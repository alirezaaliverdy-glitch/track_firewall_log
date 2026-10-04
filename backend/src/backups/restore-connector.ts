import { randomBytes } from "node:crypto";
import type { Device } from "@prisma/client";
import type { Client } from "ssh2";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import { withSharedSsh } from "../services/shared-ssh-session.service.js";
import { ciscoIosXeSshConnector, ciscoConnectConfig, ciscoCompatibilityProfile } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { backupSshTarget, BackupError, readBackupCommand, collectDeviceBackup } from "./backup-collector.js";
import { linuxServiceFiles, type RestoreVendor } from "./restore-profiles.js";
import { linuxReceiverCommand } from "./linux-restore-script.js";
import { sendScpFile, writeSftpFile, runRestoreCommand } from "./restore-transfer.js";
export async function restoreSsh<T>(device: Device, run: (client: Client, rootUser: boolean) => Promise<T>) {
  const channels = await prisma.deviceConnectionChannel.findMany({ where: { deviceId: device.id } });
  const target = backupSshTarget(device, channels);
  const credential = target.credentialId ? await resolveCredentialById(target.credentialId) : target.credentialRef ? await resolveCredentialByName(target.credentialRef) : undefined;
  if (!credential) throw new BackupError("BACKUP_CREDENTIAL_REQUIRED");
  const config = device.vendor === "cisco" ? ciscoConnectConfig(target, credential, ciscoCompatibilityProfile(target)) : {
    host: target.host, port: target.managementPort, username: credential.username,
    password: credential.password, privateKey: credential.privateKey, passphrase: credential.passphrase,
    tryKeyboard: Boolean(credential.password), readyTimeout: env.sshHandshakeTimeoutMs
  };
  return withSharedSsh(device.id, config, client => run(client, credential.username === "root"), device.type === "linux_edge");
}
export function normalizedConfiguration(vendor: RestoreVendor, content: Buffer) {
  let text = content.toString("utf8").replace(/\r/g, "");
  if (vendor === "cisco") {
    const lines = text.split("\n");
    const start = lines.findIndex(line => /^(version|hostname)\s/.test(line));
    const end = lines.reduce((last, line, index) => /^end\s*$/.test(line) ? index : last, -1);
    if (start < 0 || end < start) throw new BackupError("RESTORE_INVALID_FILE");
    text = lines.slice(start, end + 1).join("\n");
  }
  return text.split("\n").filter(line => line.trim() && (vendor === "cisco" || !/^\s*#/.test(line))).map(line => line.trimEnd()).join("\n");
}
function etcPayload(content: Buffer, intent: "preflight" | "apply" | "verify") {
  const files = linuxServiceFiles(content, true);
  if (!files.length) throw new BackupError("RESTORE_INVALID_FILE");
  return Buffer.from(JSON.stringify({ intent, entries: files.map(({ content: bytes, ...entry }) => ({ ...entry, data: bytes.toString("base64") })) }));
}
async function linuxPhase(device: Device, content: Buffer, intent: "preflight" | "apply" | "verify") {
  const result = await restoreSsh(device, (client, root) => runRestoreCommand(client, linuxReceiverCommand(root), etcPayload(content, intent)));
  let evidence: { receiver?: string; verified?: boolean; intent?: string };
  try { evidence = JSON.parse(result.toString("utf8")); } catch { throw new BackupError("RESTORE_VERIFICATION_FAILED", 502); }
  if (evidence.receiver !== "SOAR_ETC_RESTORE_V1" || evidence.intent !== intent || evidence.verified !== true) throw new BackupError("RESTORE_VERIFICATION_FAILED", 502);
}
export async function preflightRestoreConnector(device: Device, vendor: RestoreVendor, content: Buffer) {
  if (vendor === "linux") return linuxPhase(device, content, "preflight");
  if (vendor === "mikrotik") {
    const version = await restoreSsh(device, client => readBackupCommand(client, ":put [/system resource get version]"));
    const match = version.toString("utf8").match(/^(\d+)\.(\d+)/);
    if (!match || Number(match[1]) < 7 || (Number(match[1]) === 7 && Number(match[2]) < 16)) throw new BackupError("RESTORE_ROUTEROS_DRY_RUN_REQUIRED", 409);
  }
}
export async function verifyRestoreConnector(device: Device, vendor: RestoreVendor, content: Buffer) {
  if (vendor === "linux") { await linuxPhase(device, content, "verify"); return true; }
  return normalizedConfiguration(vendor, content) === normalizedConfiguration(vendor, await collectDeviceBackup(device));
}
export async function applyRestoreConnector(device: Device, vendor: RestoreVendor, content: Buffer) {
  const filename = "soar-" + randomBytes(16).toString("hex");
  if (vendor === "linux") {
    await linuxPhase(device, content, "apply");
    return { verified: true, state: "files_verified_activation_required", connectorInvoked: true };
  }
  if (vendor === "fortigate") {
    await restoreSsh(device, client => sendScpFile(client, "fgt-restore-config", content, filename + ".conf"));
    // SCP receipt is not proof of applying the configuration or completing reboot.
    return { verified: false, state: "awaiting_verification", connectorInvoked: true };
  }
  if (vendor === "mikrotik") {
    await restoreSsh(device, async client => {
      const path = filename + ".rsc";
      await writeSftpFile(client, path, content);
      try {
        await runRestoreCommand(client, '/import file-name="' + path + '" verbose=yes dry-run');
        await runRestoreCommand(client, '/import file-name="' + path + '" verbose=yes');
      } finally {
        // Only our generated staging file is eligible for cleanup.
        await runRestoreCommand(client, '/file remove [find where name="' + path + '"]').catch(() => undefined);
      }
    });
    const verified = await verifyRestoreConnector(device, vendor, content);
    return { verified, state: verified ? "configuration_verified" : "applied_merge_needs_review", connectorInvoked: true };
  }
  const target = backupSshTarget(device, await prisma.deviceConnectionChannel.findMany({ where: { deviceId: device.id } }));
  const path = "flash:/" + filename + ".cfg";
  // Remove display headers but preserve indentation and banners in the native file.
  const source = content.toString("utf8").replace(/\r/g, "").split("\n");
  const start = source.findIndex(line => /^(version|hostname)\s/.test(line)), end = source.reduce((last, line, index) => /^end\s*$/.test(line) ? index : last, -1);
  const candidate = Buffer.from(source.slice(start, end + 1).join("\n") + "\n");
  await restoreSsh(device, client => sendScpFile(client, path, candidate, filename + ".cfg"));
  try {
    await ciscoIosXeSshConnector.runCliCommands(target, [{
      commandId: "restore-config", command: "configure replace " + path + " force time 3", write: true, strict: true, redactOutput: true
    }]);
    // Confirm rollback timer only after authenticated read-back proves the candidate.
    if (!await verifyRestoreConnector(device, vendor, content)) throw new BackupError("RESTORE_VERIFICATION_FAILED", 502);
    await ciscoIosXeSshConnector.runCliCommands(target, [{ commandId: "restore-confirm", command: "configure confirm", write: true, strict: true, redactOutput: true }]);
    return { verified: true, state: "running_configuration_verified", connectorInvoked: true };
  } finally {
    await ciscoIosXeSshConnector.runCliCommands(target, [{ commandId: "restore-staging-cleanup", command: "delete /force " + path, write: true, strict: true, redactOutput: true }]).catch(() => undefined);
  }
}
