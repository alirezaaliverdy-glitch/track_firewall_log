import type { SecurityFinding, VendorFindingProfile } from "@/lib/platform";

const vendorAliases: Record<string, string> = {
  routeros: "mikrotik",
  "mikrotik routeros": "mikrotik",
  fortios: "fortigate",
  "cisco ios": "cisco",
  "cisco ios xe": "cisco"
};

const faSources: Record<string, string> = {
  auth: "احراز هویت",
  system: "سامانه",
  kernel: "هسته",
  firewall: "فایروال",
  nginx: "وب‌سرور Nginx",
  docker: "کانتینرهای Docker",
  account: "حساب‌های کاربری",
  ipsec: "تونل IPsec",
  l2tp: "تونل L2TP",
  event: "رویدادهای مدیریتی",
  traffic: "ترافیک شبکه",
  utm: "تهدیدهای UTM",
  vpn: "اتصال‌های VPN",
  filterlog: "لاگ فایروال",
  openvpn: "اتصال‌های OpenVPN",
  sshguard: "محافظ SSH",
  aaa: "احراز هویت AAA",
  syslog: "لاگ سیستمی",
  acl: "فهرست کنترل دسترسی",
  ssh_config: "پیکربندی SSH",
  listeners: "پورت‌های شنونده",
  security_tools: "ابزارهای امنیتی",
  containers: "وضعیت کانتینرها",
  ip_services: "سرویس‌های IP",
  firewall_filter: "قواعد فایروال",
  nat: "قواعد NAT",
  users: "کاربران",
  admins: "مدیران",
  interfaces: "رابط‌های شبکه",
  policies: "سیاست‌ها",
  vip: "انتشار VIP",
  local_in: "دسترسی Local-in",
  webgui: "پنل مدیریتی وب",
  ssh: "دسترسی SSH",
  rules: "قواعد فایروال",
  updates: "به‌روزرسانی‌ها",
  version: "نسخه سیستم‌عامل",
  vty: "دسترسی VTY",
  acls: "فهرست‌های دسترسی",
  snmp: "پایش SNMP"
};

const faCategories: Record<string, string> = {
  auth: "احراز هویت",
  privilege: "دسترسی ممتاز",
  config_change: "تغییر پیکربندی",
  management_exposure: "سطح مدیریت",
  firewall_vpn: "فایروال و VPN",
  deny_drop_burst: "افزایش رد ترافیک",
  malware_threat: "بدافزار و تهدید",
  log_tamper: "تمامیت لاگ",
  service_health: "سلامت سرویس",
  web_app: "وب‌اپلیکیشن",
  container_runtime: "اجرای کانتینر",
  posture: "وضعیت پیکربندی",
  detection: "تشخیص رویداد"
};

export function canonicalVendor(value: unknown) {
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return vendorAliases[normalized] ?? (normalized.replace(/[^a-z0-9]/g, "") || "unknown");
}

export function findingVendor(finding: SecurityFinding) {
  return canonicalVendor(finding.vendor || finding.device?.vendor);
}

export function vendorLabel(vendor: string, profiles: VendorFindingProfile[] = []) {
  const id = canonicalVendor(vendor);
  return profiles.find((profile) => profile.vendorId === id)?.vendorName ?? ({ linux: "Linux", mikrotik: "MikroTik RouterOS", fortigate: "FortiGate", pfsense: "pfSense", cisco: "Cisco IOS XE", windows: "Windows" }[id] ?? vendor);
}

export function sourceLabel(source: string, language: string) {
  return language.startsWith("fa") ? faSources[source] ?? source : source.replaceAll("_", " ");
}

export function categoryLabel(category: string, language: string) {
  return language.startsWith("fa") ? faCategories[category] ?? category : category.replaceAll("_", " ");
}
