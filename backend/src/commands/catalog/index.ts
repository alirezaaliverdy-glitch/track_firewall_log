import type { CommandCatalogItem, CommandParam, CommandRiskLevel, CommandVendor } from "./types.js";

const ip: CommandParam = { key: "srcIp", labelFa: "آدرس IP", type: "ip", placeholderFa: "192.0.2.10" };
const port: CommandParam = { key: "newPort", labelFa: "پورت جدید", type: "number", placeholderFa: "2222" };

function item(vendor: CommandVendor, slug: string, titleFa: string, titleEn: string, category: string, intent: string, options: Partial<CommandCatalogItem> = {}): CommandCatalogItem {
  const readOnly = options.readOnly ?? true;
  return {
    id: `${vendor}.${slug}`, vendor, titleFa, titleEn,
    descriptionFa: options.descriptionFa ?? `بررسی کنترل‌شدهٔ ${titleFa} و ثبت نتیجه در مرکز عملیات.`,
    category, intent, riskLevel: options.riskLevel ?? (readOnly ? "low" : "high"),
    privilegeLevel: options.privilegeLevel ?? (readOnly ? "read" : "admin"),
    readOnly, mutating: !readOnly, requiresConfirmation: !readOnly,
    requiredParams: options.requiredParams ?? [], optionalParams: options.optionalParams ?? [],
    tagsFa: options.tagsFa ?? [titleFa, category], searchKeywordsFa: options.searchKeywordsFa ?? [],
    supportedConnectors: options.supportedConnectors ?? [vendor === "generic" ? "generic-ssh" : `${vendor}-ssh`],
    prechecks: options.prechecks ?? ["دستگاه و اعتبارنامه بررسی شود"],
    executionTemplateRef: options.executionTemplateRef ?? null,
    verification: options.verification ?? ["خروجی فرمان و وضعیت دستگاه بازبینی شود"],
    rollback: options.rollback ?? (readOnly ? [] : ["تنظیم قبلی ثبت و در صورت خطا بازیابی شود"]),
    evidenceOutput: options.evidenceOutput ?? ["خروجی خلاصه‌شده", "زمان اجرا", "دستگاه هدف"],
    uiHints: options.uiHints ?? { executable: Boolean(options.executionTemplateRef), badgeFa: readOnly ? "فقط خواندنی" : "نیازمند تأیید" }
  };
}

const rw = (riskLevel: CommandRiskLevel = "high", requiredParams: CommandParam[] = [], executionTemplateRef: string | null = null) => ({ readOnly: false, riskLevel, requiredParams, executionTemplateRef, uiHints: { executable: Boolean(executionTemplateRef), badgeFa: "نیازمند تأیید" } });

export const COMMAND_CATALOG: readonly CommandCatalogItem[] = Object.freeze([
  item("linux", "open-ports", "نمایش پورت‌های باز", "Show open ports", "network", "linux_read_listening_ports", { executionTemplateRef: "linux_read_listening_ports" }),
  item("linux", "ssh-status", "بررسی وضعیت SSH", "Check SSH status", "ssh", "linux_check_service_status", { optionalParams: [{ key: "serviceName", labelFa: "نام سرویس", type: "string" }], executionTemplateRef: "linux_check_service_status" }),
  item("linux", "failed-logins", "بررسی لاگ‌های ورود ناموفق", "Review failed logins", "authentication", "linux_read_auth_logs", { executionTemplateRef: "linux_read_auth_logs", searchKeywordsFa: ["ورود ناموفق", "لاگ احراز هویت"] }),
  item("linux", "sudo-users", "بررسی کاربران sudo", "Review sudo users", "identity", "generic_security_action"),
  item("linux", "firewall-status", "بررسی وضعیت firewall", "Check firewall status", "firewall", "linux_read_firewall_status", { executionTemplateRef: "linux_read_firewall_status" }),
  item("linux", "fail2ban-status", "بررسی fail2ban", "Check fail2ban", "hardening", "generic_security_action"),
  item("linux", "block-ip", "بلاک کردن IP مشکوک", "Block suspicious IP", "firewall", "block_source_ip_temporary", rw("high", [ip], "block_source_ip_temporary")),
  item("linux", "restrict-ssh", "محدود کردن SSH", "Restrict SSH", "ssh", "generic_security_action", rw("high")),
  item("linux", "enable-fail2ban", "فعال‌سازی fail2ban", "Enable fail2ban", "hardening", "generic_security_action", rw("medium")),

  item("mikrotik", "management-services", "نمایش سرویس‌های مدیریتی", "Show management services", "management", "mikrotik_list_ip_services", { executionTemplateRef: "mikrotik_list_ip_services" }),
  item("mikrotik", "change-ssh-port", "تغییر پورت SSH", "Change SSH port", "management", "mikrotik_change_service_port", rw("high", [port], "mikrotik_change_service_port")),
  item("mikrotik", "restrict-management", "محدود کردن دسترسی WinBox/SSH", "Restrict WinBox/SSH", "management", "mikrotik_restrict_service_by_address", rw("high", [{ key: "trustedSourceCidr", labelFa: "شبکه مجاز", type: "cidr" }], "mikrotik_restrict_service_by_address")),
  item("mikrotik", "block-ip", "بلاک کردن IP", "Block IP", "firewall", "mikrotik_block_ip_temporary", rw("high", [ip], "mikrotik_block_ip_temporary")),
  item("mikrotik", "firewall-filter", "بررسی firewall filter", "Review firewall filter", "firewall", "mikrotik_list_filter_rules", { executionTemplateRef: "mikrotik_list_filter_rules" }),
  item("mikrotik", "dangerous-nat", "بررسی NATهای خطرناک", "Review dangerous NAT", "nat", "mikrotik_list_nat_rules", { executionTemplateRef: "mikrotik_list_nat_rules" }),
  item("mikrotik", "backup", "بکاپ تنظیمات", "Backup configuration", "backup", "mikrotik_create_backup", rw("medium", [], "mikrotik_create_backup")),
  item("mikrotik", "failed-logins", "نمایش لاگ‌های ورود ناموفق", "Show failed logins", "authentication", "mikrotik_show_logs", { executionTemplateRef: "mikrotik_show_logs" }),

  item("fortigate", "admin-failures", "بررسی خطاهای ورود مدیر", "Review admin login failures", "authentication", "fortigate_show_logs", { executionTemplateRef: "fortigate_show_logs" }),
  item("fortigate", "risky-policies", "بررسی policyهای خطرناک", "Review risky policies", "firewall", "generic_security_action"),
  item("fortigate", "vip-exposure", "بررسی VIP/NAT exposure", "Review VIP exposure", "nat", "generic_security_action"),
  item("fortigate", "ssl-vpn-failures", "بررسی خطاهای SSL-VPN", "Review SSL-VPN failures", "vpn", "fortigate_show_logs", { executionTemplateRef: "fortigate_show_logs" }),
  item("fortigate", "local-in", "بررسی local-in policy", "Review local-in policy", "management", "generic_security_action"),
  item("fortigate", "restrict-management", "پیشنهاد محدودسازی دسترسی مدیریتی", "Restrict management access", "management", "fortigate_restrict_admin_trusthost", rw("high")),

  item("cisco", "management", "بررسی مدیریت SSH/Telnet", "Review SSH/Telnet", "management", "generic_security_action"),
  item("cisco", "acl", "بررسی ACL", "Review ACL", "firewall", "generic_security_action"),
  item("cisco", "aaa", "بررسی AAA", "Review AAA", "identity", "generic_security_action"),
  item("cisco", "login-failures", "بررسی ورودهای ناموفق", "Review login failures", "authentication", "generic_security_action"),
  item("cisco", "snmp", "بررسی SNMP", "Review SNMP", "management", "generic_security_action"),
  item("cisco", "disable-telnet", "پیشنهاد غیرفعال‌سازی Telnet", "Disable Telnet", "hardening", "generic_security_action", rw("high")),

  item("pfsense", "wan-rules", "بررسی قوانین WAN", "Review WAN rules", "firewall", "generic_security_action"),
  item("pfsense", "port-forward", "بررسی NAT و Port Forward", "Review NAT/Port Forward", "nat", "generic_security_action"),
  item("pfsense", "webgui-exposure", "بررسی دسترسی WebGUI", "management", "management", "generic_security_action"),
  item("pfsense", "vpn-failures", "بررسی خطاهای OpenVPN/IPsec", "Review VPN failures", "vpn", "generic_security_action"),
  item("pfsense", "sshguard", "بررسی لاگ‌های sshguard", "Review sshguard logs", "authentication", "generic_security_action"),
  item("generic", "security-review", "بررسی امنیت عمومی دستگاه", "Generic security review", "assessment", "generic_security_action")
]);

export function findCatalogItem(id: string) { return COMMAND_CATALOG.find((entry) => entry.id === id); }
export function searchCatalog(filters: { q?: string; vendor?: string; category?: string; riskLevel?: string; readOnly?: boolean; executable?: boolean }) {
  const q = filters.q?.trim().toLocaleLowerCase("fa") ?? "";
  return COMMAND_CATALOG.filter((entry) => {
    const haystack = [entry.titleFa, entry.titleEn, entry.descriptionFa, entry.vendor, entry.category, ...entry.tagsFa, ...entry.searchKeywordsFa].join(" ").toLocaleLowerCase("fa");
    return (!q || haystack.includes(q)) && (!filters.vendor || entry.vendor === filters.vendor) && (!filters.category || entry.category === filters.category) && (!filters.riskLevel || entry.riskLevel === filters.riskLevel) && (filters.readOnly === undefined || entry.readOnly === filters.readOnly) && (filters.executable === undefined || entry.uiHints.executable === filters.executable);
  });
}

export type { CommandCatalogItem } from "./types.js";
