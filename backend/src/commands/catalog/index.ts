import type { CommandCatalogItem, CommandParam, CommandRiskLevel, CommandVendor, ImplementationState } from "./types.js";

const param = (key: string, labelFa: string, helpFa: string, type: CommandParam["type"], placeholderFa?: string): CommandParam => ({ key, labelFa, helpFa, type, placeholderFa });
const ipAddress = param("ipAddress", "آدرس IP", "یک آدرس IPv4 یا IPv6 معتبر برای مسدودسازی وارد کنید.", "ip", "192.0.2.10");
const serviceName = param("serviceName", "نام سرویس", "نام واحد systemd مانند nginx یا sshd را وارد کنید.", "string", "nginx");
const allowedSource = param("allowedSource", "شبکه مجاز", "آدرس یا CIDR مدیریتی مجاز را وارد کنید؛ مانند 192.0.2.0/24.", "cidr", "192.0.2.0/24");

type Options = Partial<CommandCatalogItem> & { state?: ImplementationState; template?: string; required?: CommandParam[]; mutates?: boolean };
function item(vendor: CommandVendor, slug: string, titleFa: string, titleEn: string, category: string, actionType: string, options: Options = {}): CommandCatalogItem {
  const implementationState = options.state ?? "planned";
  const mutating = options.mutates ?? false;
  const requiredParams = options.required ?? [];
  const executable = implementationState === "implemented";
  const manual = implementationState === "manualOnly";
  const badgeFa = executable ? "اجراپذیر" : manual ? "نیازمند بررسی دستی" : implementationState === "planned" ? "در حال توسعه" : "پشتیبانی نمی‌شود";
  return {
    id: `${vendor}.${slug}`, vendor, titleFa, titleEn, category, actionType,
    descriptionFa: options.descriptionFa ?? `${titleFa} برای دستگاه انتخاب‌شده، با ثبت شواهد و بازبینی نتیجه.`,
    implementationState,
    executionSupport: executable ? "connector" : manual ? "manual" : "not_implemented",
    connectorType: executable ? (vendor === "linux" ? "linux-ssh" : "mikrotik-ssh") : null,
    riskLevel: options.riskLevel ?? (mutating ? "high" : "low") as CommandRiskLevel,
    privilegeLevel: options.privilegeLevel ?? (mutating ? "admin" : "read"),
    readOnly: !mutating, mutating, requiresConfirmation: mutating,
    requiredParams, optionalParams: options.optionalParams ?? [], defaultParams: options.defaultParams ?? {},
    paramCandidates: options.paramCandidates ?? {}, autoResolveParams: options.autoResolveParams ?? [],
    paramLabelsFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.labelFa])),
    paramHelpFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.helpFa])),
    tagsFa: options.tagsFa ?? [titleFa, category], searchKeywordsFa: options.searchKeywordsFa ?? [],
    supportedConnectors: executable ? [vendor === "linux" ? "linux-ssh" : "mikrotik-ssh"] : [],
    prechecks: options.prechecks ?? ["اتصال و اعتبارنامه دستگاه بررسی شود"],
    validationRules: options.validationRules ?? Object.fromEntries(requiredParams.map((field) => [field.key, [field.type, "required"]])),
    executionTemplateRef: options.template ?? null,
    verification: options.verification ?? ["خروجی فرمان و وضعیت دستگاه بازبینی شود"],
    rollback: options.rollback ?? (mutating ? { available: false, notAvailableReasonFa: "بازگشت خودکار برای این عملیات پیاده‌سازی نشده است؛ بازگشت باید دستی بازبینی شود." } : { available: false, notAvailableReasonFa: "عملیات فقط‌خواندنی است و تغییری برای بازگشت ندارد." }),
    evidenceOutput: options.evidenceOutput ?? ["خروجی خلاصه‌شده", "زمان بررسی", "دستگاه هدف"],
    supportedDeviceCapabilities: options.supportedDeviceCapabilities ?? (executable ? [vendor === "linux" ? "ssh" : "routeros-ssh"] : []),
    disabledReasonFa: executable || manual ? null : options.disabledReasonFa ?? "handler اجرایی معتبر هنوز پیاده‌سازی نشده است.",
    uiHints: { executable, badgeFa }
  };
}
const implemented = (template: string, extra: Options = {}): Options => ({ ...extra, state: "implemented", template });
const manual = (extra: Options = {}): Options => ({ ...extra, state: "manualOnly", mutates: extra.mutates ?? true });
const planned = (extra: Options = {}): Options => ({ ...extra, state: "planned" });

export const COMMAND_CATALOG: readonly CommandCatalogItem[] = Object.freeze([
  item("linux", "open-ports", "نمایش پورت‌های باز", "Show open ports", "network", "linux_read_listening_ports", implemented("linux_list_open_ports")),
  item("linux", "ssh-status", "بررسی وضعیت SSH", "Check SSH status", "ssh", "linux_check_ssh_status", implemented("linux_check_ssh_status")),
  item("linux", "failed-logins", "بررسی لاگ‌های ورود ناموفق", "Review failed logins", "authentication", "linux_check_failed_logins", implemented("linux_check_failed_logins", { searchKeywordsFa: ["ورود ناموفق", "لاگ احراز هویت"] })),
  item("linux", "sudo-users", "بررسی کاربران sudo", "Review sudo users", "identity", "linux_check_sudo_users", implemented("linux_check_sudo_users")),
  item("linux", "firewall-status", "بررسی وضعیت فایروال", "Check firewall status", "firewall", "linux_read_firewall_status", implemented("linux_check_firewall_status")),
  item("linux", "fail2ban-status", "بررسی fail2ban", "Check fail2ban", "hardening", "linux_check_fail2ban_status", implemented("linux_check_fail2ban_status")),
  item("linux", "block-ip", "بلاک کردن IP مشکوک", "Block suspicious IP", "firewall", "block_source_ip_temporary", implemented("linux_block_ip", { mutates: true, required: [ipAddress], defaultParams: { durationMinutes: 30 }, optionalParams: [param("durationMinutes", "مدت مسدودی", "مدت مسدودی بر حسب دقیقه.", "number", "30")], rollback: { available: true, steps: ["حذف قانون deny مدیریت‌شده برای IP"] } })),
  item("linux", "service-status", "بررسی وضعیت سرویس", "Check service status", "services", "linux_check_service_status", implemented("linux_check_service_status", { required: [serviceName] })),
  item("linux", "restrict-ssh", "محدود کردن SSH", "Restrict SSH", "ssh", "generic_security_action", manual({ required: [allowedSource], riskLevel: "high" })),
  item("linux", "enable-fail2ban", "فعال‌سازی fail2ban", "Enable fail2ban", "hardening", "generic_security_action", manual({ riskLevel: "medium" })),

  item("mikrotik", "management-services", "نمایش سرویس‌های مدیریتی", "Show management services", "management", "mikrotik_list_ip_services", implemented("mikrotik_list_management_services")),
  item("mikrotik", "firewall-filter", "بررسی firewall filter", "Review firewall filter", "firewall", "mikrotik_list_filter_rules", implemented("mikrotik_check_firewall_filter")),
  item("mikrotik", "dangerous-nat", "بررسی NATهای خطرناک", "Review dangerous NAT", "nat", "mikrotik_list_nat_rules", implemented("mikrotik_check_nat_exposure")),
  item("mikrotik", "failed-logins", "نمایش لاگ‌های ورود ناموفق", "Show failed logins", "authentication", "mikrotik_show_logs", implemented("mikrotik_check_failed_logins")),
  item("mikrotik", "block-ip", "بلاک کردن IP", "Block IP", "firewall", "mikrotik_block_ip_temporary", implemented("mikrotik_block_ip", { mutates: true, required: [ipAddress], defaultParams: { timeout: "30m", listName: "firewall-log-analyzer-blocked" }, rollback: { available: true, steps: ["حذف IP از address-list مدیریت‌شده"] } })),
  item("mikrotik", "backup", "بکاپ تنظیمات", "Backup configuration", "backup", "mikrotik_create_backup", implemented("mikrotik_backup_config", { mutates: true, riskLevel: "medium", rollback: { available: false, notAvailableReasonFa: "ساخت فایل بکاپ تغییر پیکربندی ندارد؛ فایل در صورت نیاز دستی حذف می‌شود." } })),
  item("mikrotik", "restrict-management", "محدود کردن دسترسی WinBox/SSH", "Restrict WinBox/SSH", "management", "generic_security_action", manual({ required: [allowedSource], riskLevel: "high" })),
  item("mikrotik", "change-ssh-port", "تغییر پورت SSH", "Change SSH port", "management", "mikrotik_change_service_port", planned({ mutates: true, riskLevel: "high" })),

  item("fortigate", "admin-failures", "بررسی خطاهای ورود مدیر", "Review admin login failures", "authentication", "generic_security_action", manual({ mutates: false })),
  item("fortigate", "risky-policies", "بررسی policyهای خطرناک", "Review risky policies", "firewall", "generic_security_action", manual({ mutates: false })),
  item("fortigate", "vip-exposure", "بررسی VIP/NAT exposure", "Review VIP exposure", "nat", "generic_security_action", manual({ mutates: false })),
  item("fortigate", "ssl-vpn-failures", "بررسی خطاهای SSL-VPN", "Review SSL-VPN failures", "vpn", "generic_security_action", manual({ mutates: false })),
  item("fortigate", "local-in", "بررسی local-in policy", "Review local-in policy", "management", "generic_security_action", manual({ mutates: false })),
  item("fortigate", "restrict-management", "پیشنهاد محدودسازی دسترسی مدیریتی", "Restrict management access", "management", "generic_security_action", manual()),
  item("cisco", "management", "بررسی مدیریت SSH/Telnet", "Review SSH/Telnet", "management", "generic_security_action", manual({ mutates: false })),
  item("cisco", "acl", "بررسی ACL", "Review ACL", "firewall", "generic_security_action", manual({ mutates: false })),
  item("cisco", "aaa", "بررسی AAA", "Review AAA", "identity", "generic_security_action", manual({ mutates: false })),
  item("cisco", "login-failures", "بررسی ورودهای ناموفق", "Review login failures", "authentication", "generic_security_action", manual({ mutates: false })),
  item("cisco", "snmp", "بررسی SNMP", "Review SNMP", "management", "generic_security_action", manual({ mutates: false })),
  item("cisco", "disable-telnet", "پیشنهاد غیرفعال‌سازی Telnet", "Disable Telnet", "hardening", "generic_security_action", manual()),
  item("pfsense", "wan-rules", "بررسی قوانین WAN", "Review WAN rules", "firewall", "generic_security_action", manual({ mutates: false })),
  item("pfsense", "port-forward", "بررسی NAT و Port Forward", "Review NAT/Port Forward", "nat", "generic_security_action", manual({ mutates: false })),
  item("pfsense", "webgui-exposure", "بررسی دسترسی WebGUI", "Review WebGUI exposure", "management", "generic_security_action", manual({ mutates: false })),
  item("pfsense", "vpn-failures", "بررسی خطاهای OpenVPN/IPsec", "Review VPN failures", "vpn", "generic_security_action", manual({ mutates: false })),
  item("pfsense", "sshguard", "بررسی لاگ‌های sshguard", "Review sshguard logs", "authentication", "generic_security_action", manual({ mutates: false })),
  item("generic", "security-review", "بررسی امنیت عمومی دستگاه", "Generic security review", "assessment", "generic_security_action", manual({ mutates: false }))
]);

export const COMMAND_CATALOG_VERSION = "2026.07.04.1";

export function findCatalogItem(id: string) { return COMMAND_CATALOG.find((entry) => entry.id === id); }
export function searchCatalog(filters: { q?: string; vendor?: string; category?: string; riskLevel?: string; readOnly?: boolean; executable?: boolean; includePlanned?: boolean }) {
  const q = filters.q?.trim().toLocaleLowerCase("fa") ?? "";
  return COMMAND_CATALOG.filter((entry) => {
    if (!filters.includePlanned && (entry.implementationState === "planned" || entry.implementationState === "unsupported")) return false;
    const haystack = [entry.titleFa, entry.titleEn, entry.descriptionFa, entry.vendor, entry.category, ...entry.tagsFa, ...entry.searchKeywordsFa].join(" ").toLocaleLowerCase("fa");
    return (!q || haystack.includes(q)) && (!filters.vendor || entry.vendor === filters.vendor) && (!filters.category || entry.category === filters.category) && (!filters.riskLevel || entry.riskLevel === filters.riskLevel) && (filters.readOnly === undefined || entry.readOnly === filters.readOnly) && (filters.executable === undefined || entry.implementationState === "implemented" === filters.executable);
  });
}
export type { CommandCatalogItem } from "./types.js";
