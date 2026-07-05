import { normalizeVendor } from "../services/ai-normalization.js";

export type DailyCheckVendor = "linux" | "mikrotik" | "fortigate" | "cisco" | "pfsense" | "juniper" | "paloalto" | "windows" | "docker" | "kubernetes";
export type DailyImplementationState = "implemented" | "manualOnly" | "planned";
export type DailyCheckSectionProfile = {
  key: string; titleFa: string; commands: string[]; parser: string; severityRules: string[]; suggestedActions: string[];
};
export type VendorDailyCheckProfile = {
  vendor: DailyCheckVendor; titleFa: string; requiredConnector: string | null; implementationState: DailyImplementationState; sections: DailyCheckSectionProfile[];
};

const section = (key: string, titleFa: string, commands: string[], suggestedActions: string[] = []): DailyCheckSectionProfile => ({
  key, titleFa, commands, parser: "bounded_text", severityRules: ["critical/error/failed => red", "warning/degraded => yellow", "otherwise => green"], suggestedActions
});
const manual = (vendor: DailyCheckVendor, titleFa: string, names: Array<[string, string]>): VendorDailyCheckProfile => ({
  vendor, titleFa, requiredConnector: null, implementationState: "manualOnly", sections: names.map(([key, title]) => section(key, title, []))
});

export const VENDOR_DAILY_CHECK_PROFILES: Readonly<Record<DailyCheckVendor, VendorDailyCheckProfile>> = Object.freeze({
  linux: { vendor: "linux", titleFa: "چک روزانه لینوکس", requiredConnector: "linux-ssh", implementationState: "implemented", sections: [
    section("system", "سلامت و منابع سیستم", ["uptime/load", "cpu/memory/swap", "disk/inode", "pending updates"]),
    section("services", "سرویس‌ها", ["failed systemd services", "important services", "docker/nginx/apache detection"], ["linux_check_service_status"]),
    section("network", "شبکه و پورت‌ها", ["interfaces/routes", "listening ports"]),
    section("firewall", "فایروال و دسترسی‌ها", ["firewall status", "sudo users"], ["linux_read_firewall_status"]),
    section("logs", "لاگ‌ها و خطاهای اخیر", ["SSH failed logins", "critical journal errors"], ["linux_check_failed_logins"])
  ]},
  mikrotik: { vendor: "mikrotik", titleFa: "چک روزانه میکروتیک", requiredConnector: "mikrotik-ssh", implementationState: "implemented", sections: [
    section("system", "سلامت و منابع RouterOS", ["resource/version/packages", "uptime/reboots"]),
    section("network", "شبکه و اینترفیس‌ها", ["interface status/errors", "DHCP leases", "routes"]),
    section("firewall", "فایروال و دسترسی‌ها", ["IP services", "filter/input drops", "NAT/dstnat", "address lists"]),
    section("vpn", "VPN", ["IPsec/L2TP/WireGuard status"]),
    section("logs", "لاگ‌ها و خطاهای اخیر", ["account/system/firewall/ipsec/route warning/error"]),
    section("backup", "پشتیبان و خروجی تنظیمات", ["backup/export status"])
  ]},
  fortigate: manual("fortigate", "چک روزانه FortiGate", [["system","سیستم و firmware"],["resources","CPU، حافظه و session"],["network","اینترفیس و HA"],["firewall","Policy، local-in و VIP/NAT"],["vpn","SSL-VPN و IPsec"],["logs","لاگ تهدید، ورود و تغییرات"]]),
  cisco: manual("cisco", "چک روزانه Cisco", [["system","نسخه، uptime و منابع"],["network","اینترفیس و routing neighbor"],["firewall","ACL و دسترسی مدیریت"],["management","AAA، SNMP، syslog و NTP"],["logs","هشدارها و خطاها"]]),
  pfsense: manual("pfsense", "چک روزانه pfSense", [["system","نسخه، به‌روزرسانی و منابع"],["network","gateway و interface"],["firewall","Firewall و NAT/port forward"],["vpn","OpenVPN و IPsec"],["logs","سرویس‌ها و auth logs"]]),
  juniper: manual("juniper", "چک روزانه Juniper", [["system","Alarm، chassis، نسخه و uptime"],["network","Routing و interface"],["firewall","Filter و security policy"],["vpn","VPN/IPsec"],["logs","لاگ هشدار و احراز هویت"]]),
  paloalto: manual("paloalto", "چک روزانه Palo Alto", [["system","System info، resources و jobs"],["network","Interface و HA"],["firewall","Security/NAT policy"],["vpn","GlobalProtect و IPsec"],["logs","Admin، auth، threat و traffic"]]),
  windows: manual("windows", "چک روزانه Windows", [["system","Uptime، CPU، memory و disk"],["services","خرابی سرویس‌ها"],["firewall","Firewall و RDP"],["identity","Failed logon و local admins"],["updates","Windows Update"],["logs","Event Viewer"]]),
  docker: manual("docker", "چک روزانه Docker", [["services","Docker service و containerها"],["health","Restart loop و unhealthy"],["network","پورت‌های منتشرشده"],["images","عمر imageها"],["logs","خطاهای اخیر container"]]),
  kubernetes: manual("kubernetes", "چک روزانه Kubernetes", [["nodes","آمادگی nodeها و resource pressure"],["workloads","Pod، CrashLoop و deployment"],["network","Service و ingress exposure"],["logs","Warning eventهای اخیر"]])
});

const EXTRA_ALIASES: Record<string, DailyCheckVendor> = { juniper: "juniper", junos: "juniper", paloalto: "paloalto", panos: "paloalto", windows: "windows", windowsserver: "windows", docker: "docker", kubernetes: "kubernetes", k8s: "kubernetes" };
export function normalizeDailyCheckVendor(value: unknown): DailyCheckVendor | null {
  const common = normalizeVendor(value);
  if (common && common !== "generic" && common !== "unknown") return common as DailyCheckVendor;
  const token = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  return EXTRA_ALIASES[token] ?? null;
}
export function getVendorDailyCheckProfile(vendor: unknown, type?: unknown) {
  const normalized = normalizeDailyCheckVendor(vendor) ?? normalizeDailyCheckVendor(type);
  return normalized ? VENDOR_DAILY_CHECK_PROFILES[normalized] : null;
}
