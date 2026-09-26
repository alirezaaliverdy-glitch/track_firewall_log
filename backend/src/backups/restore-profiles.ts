import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { backupProfile, validateBackup } from "./backup-profiles.js";
import { BackupError } from "./backup-collector.js";

export const RESTORE_TEMPLATES = {
  linux: { id: "linux_restore_etc_files", method: "etc_overlay", connector: "linux-ssh" },
  cisco: { id: "cisco_restore_configuration", method: "replace_running", connector: "cisco-ios-xe-ssh" },
  mikrotik: { id: "mikrotik_restore_configuration", method: "import_merge", connector: "mikrotik-ssh" },
  fortigate: { id: "fortigate_restore_configuration", method: "native_scp", connector: "fortigate-ssh" }
} as const;
export type RestoreVendor = keyof typeof RESTORE_TEMPLATES;
export function restoreVendor(vendor: string): RestoreVendor {
  const key = backupProfile(vendor).key;
  if (!(key in RESTORE_TEMPLATES)) throw new BackupError("RESTORE_VENDOR_UNSUPPORTED");
  return key as RestoreVendor;
}
export const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
export function configIdentity(vendor: RestoreVendor, content: Buffer) {
  const text = content.toString("utf8");
  if (vendor === "cisco") return { version: text.match(/^version\s+(\S+)/m)?.[1] ?? "", model: "" };
  if (vendor === "mikrotik") return {
    version: text.match(/#.* by RouterOS\s+(\S+)/)?.[1] ?? "",
    model: text.match(/^#\s*model\s*=\s*(.+)$/m)?.[1]?.trim() ?? "",
    serial: text.match(/^#\s*serial number\s*=\s*(.+)$/m)?.[1]?.trim() ?? ""
  };
  if (vendor === "fortigate") return { version: text.match(/^#config-version=([^\r\n]+)/m)?.[1]?.split(":")[0] ?? "", model: "" };
  return { version: "", model: "" };
}
export function validateRestoreArtifact(vendor: RestoreVendor, data: Buffer) {
  try { validateBackup(backupProfile(vendor), data); }
  catch { throw new BackupError("RESTORE_INVALID_FILE"); }
  if (vendor !== "linux" && !configIdentity(vendor, data).version) throw new BackupError("RESTORE_VERSION_MISSING");
  if (vendor === "fortigate" && data.includes(Buffer.from("FortinetPasswordMask"))) throw new BackupError("RESTORE_MASKED_SECRETS");
  if (vendor === "linux") linuxServiceFiles(data, true);
}
export function assertCompatible(vendor: RestoreVendor, uploaded: Buffer, current: Buffer) {
  validateRestoreArtifact(vendor, uploaded);
  if (vendor === "linux") return;
  const source = configIdentity(vendor, uploaded), target = configIdentity(vendor, current);
  if (!target.version || source.version !== target.version ||
      (source.model && source.model !== target.model) ||
      ("serial" in source && source.serial && source.serial !== ("serial" in target ? target.serial : ""))) {
    throw new BackupError("RESTORE_DEVICE_VERSION_MISMATCH", 409);
  }
}
export type ServiceFile = { path: string; bytes: number; sha256: string; content: Buffer; kind: "file" | "directory" | "symlink"; link: string; mode: number; uid: number; gid: number };
const SERVICE_PATH = /^etc\/(?:nginx|apache2|httpd|redis|mysql|postgresql|fail2ban)\/[A-Za-z0-9_./-]+$/;
export function linuxServiceFiles(data: Buffer, all = false): ServiceFile[] {
  const archive = gunzipSync(data, { maxOutputLength: 128 * 1024 * 1024 });
  const files: ServiceFile[] = [], seen = new Set<string>();
  let offset = 0, longName = "";
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const value = (start: number, end: number) => header.subarray(start, end).toString("utf8").split("\0")[0];
    const size = parseInt(value(124, 136).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) throw new BackupError("RESTORE_INVALID_FILE");
    const type = value(156, 157);
    const prefix = value(345, 500);
    let path = longName || (prefix ? prefix + "/" : "") + value(0, 100);
    longName = "";
    const content = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") { if (size > 4096) throw new BackupError("RESTORE_UNSAFE_PATH"); longName = content.toString("utf8").split("\0")[0]; continue; }
    // Extended headers/sparse records can override names or sizes; never extract them.
    if (["x", "g", "K", "S"].includes(type)) throw new BackupError("RESTORE_ARCHIVE_FORMAT_UNSUPPORTED");
    path = path.replace(/^\.\//, "");
    if (path.startsWith("/") || path.split("/").includes("..") || path.includes("\\") || path.includes("\0")) throw new BackupError("RESTORE_UNSAFE_PATH");
    path = path.replace(/\/$/, "");
    if (path.split("/").some(part => !part || part === "." || part === "..")) throw new BackupError("RESTORE_UNSAFE_PATH");
    if (path === "etc" && type !== "5") throw new BackupError("RESTORE_UNSAFE_PATH");
    if (all && path !== "etc" && !path.startsWith("etc/")) throw new BackupError("RESTORE_UNSAFE_PATH");
    if (all && !["0", "", "2", "5"].includes(type)) throw new BackupError("RESTORE_ARCHIVE_FORMAT_UNSUPPORTED");
    if ((all || SERVICE_PATH.test(path)) && ["0", "", "2", "5"].includes(type)) {
      if (seen.has(path) || size > 8 * 1024 * 1024 || files.length >= 10000) throw new BackupError("RESTORE_INVALID_FILE");
      const kind = type === "2" ? "symlink" : type === "5" ? "directory" : "file";
      const link = kind === "symlink" ? value(157, 257) : "";
      if (kind === "symlink" && (!link || link.includes("\0"))) throw new BackupError("RESTORE_UNSAFE_PATH");
      const number = (start: number, end: number) => {
        const text = value(start, end).trim();
        if (!/^[0-7]+$/.test(text)) throw new BackupError("RESTORE_INVALID_FILE");
        const result = parseInt(text, 8);
        if (!Number.isSafeInteger(result) || result > 2147483647) throw new BackupError("RESTORE_INVALID_FILE");
        return result;
      };
      seen.add(path); files.push({ path, bytes: size, sha256: digest(content), content, kind, link,
        mode: number(100, 108) & 0o777, uid: number(108, 116), gid: number(116, 124) });
    }
  }
  if (longName) throw new BackupError("RESTORE_INVALID_FILE");
  const links = new Set(files.filter(file => file.kind === "symlink").map(file => file.path));
  if (files.some(file => file.path.split("/").slice(0, -1).some((_, i, parts) => links.has(parts.slice(0, i + 1).join("/"))))) throw new BackupError("RESTORE_UNSAFE_PATH");
  if (files.reduce((sum, file) => sum + file.bytes, 0) > 64 * 1024 * 1024) throw new BackupError("RESTORE_INVALID_FILE");
  return files;
}
