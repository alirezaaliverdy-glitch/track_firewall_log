import { gunzipSync } from "node:zlib";
export type BackupProfile = { key: string; title: string; extension: string; contentType: string; scope: string; supported: boolean };
export function backupProfile(vendor: string, type = ""): BackupProfile {
  const key = vendor.trim().toLowerCase();
  const base = { supported: true, contentType: "text/plain; charset=utf-8" };
  if (key === "cisco") return { ...base, key, title: "تنظیمات جاری سیسکو", extension: "cfg", scope: "Running-config؛ شامل سیستم‌عامل، Flash و Startup نیست." };
  if (key === "mikrotik") return { ...base, key, title: "خروجی تنظیمات RouterOS", extension: "rsc", scope: "خروجی متنی تنظیمات؛ شامل گذرواژه کاربران، گواهی‌ها و فایل‌ها نیست. بک‌آپ باینری نیست." };
  if (key === "fortigate" || key === "fortinet") return { ...base, key: "fortigate", title: "بک‌آپ تنظیمات FortiGate", extension: "conf", scope: "فایل بومی sys_config از SCP؛ فعال بودن admin-scp و مجوز حساب لازم است. شامل Firmware نیست؛ محدوده VDOM تابع دسترسی حساب است." };
  if (key === "pfsense") return { ...base, key, title: "تنظیمات pfSense", extension: "xml", contentType: "application/xml", scope: "فایل config.xml؛ شامل سیستم‌عامل، RRD و فایل‌های مستقل افزونه‌ها نیست." };
  if (key === "linux" || key === "linux_edge" || (!key && type.startsWith("linux"))) return { ...base, key: "linux", title: "آرشیو تنظیمات لینوکس", extension: "tar.gz", contentType: "application/gzip", scope: "آرشیو /etc؛ شامل دیتابیس، فایل کاربران و بک‌آپ دیسک نیست. دسترسی خواندن تمام /etc لازم است." };
  return { ...base, key, title: "بک‌آپ خودکار پشتیبانی نمی‌شود", extension: "", scope: "این وندور هنوز کانکتور بک‌آپ معتبر ندارد؛ از ابزار رسمی دستگاه بک‌آپ بگیرید.", supported: false };
}
export function validateBackup(profile: BackupProfile, data: Buffer) {
  if (!data.length || data.length > 20 * 1024 * 1024) throw new Error("BACKUP_EMPTY_OR_TOO_LARGE");
  if (profile.key === "linux") {
    if (data[0] !== 0x1f || data[1] !== 0x8b) throw new Error("BACKUP_INVALID_ARCHIVE");
    const archive = gunzipSync(data, { maxOutputLength: 128 * 1024 * 1024 });
    if (archive.length < 1024 || archive.length % 512 !== 0 || archive.subarray(-1024).some(byte => byte !== 0)) throw new Error("BACKUP_INCOMPLETE_ARCHIVE");
    return;
  }
  const text = data.toString("utf8");
  if (/--More--|\bsyntax error\b|bad command name|not enough permissions|permission denied|%\s*(Invalid|Error|Authorization|Incomplete)|Command fail|Unknown action/i.test(text)) throw new Error("BACKUP_COMMAND_REJECTED");
  if (profile.key === "cisco" && (!/^end\s*$/m.test(text) || !/^(version|hostname|interface)\s/m.test(text))) throw new Error("BACKUP_INCOMPLETE_CONFIG");
  if (profile.key === "mikrotik" && (!/^\//m.test(text) || /#.*(?:error exporting|interrupted)/i.test(text))) throw new Error("BACKUP_INCOMPLETE_CONFIG");
  if (profile.key === "fortigate" && (!/^#config-version=/m.test(text) || !/^config\s/m.test(text) || !/^end\s*$/m.test(text))) throw new Error("BACKUP_INCOMPLETE_CONFIG");
  if (profile.key === "pfsense" && (!/<pfsense(?:\s|>)/.test(text) || !/<\/pfsense>/.test(text))) throw new Error("BACKUP_INCOMPLETE_CONFIG");
}
export function backupFilename(deviceName: string, extension: string, date = new Date()) {
  const name = deviceName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "device";
  return `${name}-${date.toISOString().replace(/[:.]/g, "-")}.${extension}`;
}
