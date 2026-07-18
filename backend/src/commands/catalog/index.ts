import { FORTIGATE_FULL_CONTROL_REGISTRY } from "../../fortigate/full-control-registry.js";
import type { CommandCatalogItem, CommandParam, CommandRiskLevel, CommandVendor, ImplementationState } from "./types.js";
import { evaluateCatalogSupportState } from "./support-state.js";
import { CISCO_OPERATION_REGISTRY } from "../../cisco/cisco-operation-registry.js";

const param = (key: string, labelFa: string, helpFa: string, type: CommandParam["type"], placeholderFa?: string): CommandParam => ({ key, labelFa, helpFa, type, placeholderFa });
const ipAddress = param("ipAddress", "آدرس IP", "یک آدرس IPv4 یا IPv6 معتبر برای مسدودسازی وارد کنید.", "ip", "192.0.2.10");
const serviceName = param("serviceName", "نام سرویس", "نام واحد systemd مانند nginx یا sshd را وارد کنید.", "string", "nginx");
const username = param("username", "نام کاربر", "نام حساب لینوکس را بدون فاصله وارد کنید؛ مانند tavakoli.", "string", "tavakoli");
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
    supportState: executable ? "verified" : manual ? "manual_only" : "unsupported",
    supportReason: "",
    supportReasonKey: "support.reason.unsupported",
    connectorType: executable ? (vendor === "linux" ? "linux-ssh" : vendor === "fortigate" ? "fortigate-ssh" : vendor === "cisco" ? "cisco-ios-xe-ssh" : "mikrotik-ssh") : null,
    riskLevel: options.riskLevel ?? (mutating ? "high" : "low") as CommandRiskLevel,
    privilegeLevel: options.privilegeLevel ?? (mutating ? "admin" : "read"),
    readOnly: !mutating, mutating, requiresConfirmation: mutating,
    requiredParams, optionalParams: options.optionalParams ?? [], defaultParams: options.defaultParams ?? {},
    paramCandidates: options.paramCandidates ?? {}, autoResolveParams: options.autoResolveParams ?? [],
    paramLabelsFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.labelFa])),
    paramHelpFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.helpFa])),
    tagsFa: options.tagsFa ?? [titleFa, category], searchKeywordsFa: options.searchKeywordsFa ?? [],
    supportedConnectors: executable ? [vendor === "linux" ? "linux-ssh" : vendor === "fortigate" ? "fortigate-ssh" : vendor === "cisco" ? "cisco-ios-xe-ssh" : "mikrotik-ssh"] : [],
    prechecks: options.prechecks ?? ["اتصال و اعتبارنامه دستگاه بررسی شود"],
    validationRules: options.validationRules ?? Object.fromEntries(requiredParams.map((field) => [field.key, [field.type, "required"]])),
    executionTemplateRef: options.template ?? null,
    verification: options.verification ?? ["خروجی فرمان و وضعیت دستگاه بازبینی شود"],
    rollback: options.rollback ?? (mutating ? { available: false, notAvailableReasonFa: "بازگشت خودکار برای این عملیات پیاده‌سازی نشده است؛ بازگشت باید دستی بازبینی شود." } : { available: false, notAvailableReasonFa: "عملیات فقط‌خواندنی است و تغییری برای بازگشت ندارد." }),
    evidenceOutput: options.evidenceOutput ?? ["خروجی خلاصه‌شده", "زمان بررسی", "دستگاه هدف"],
    supportedDeviceCapabilities: options.supportedDeviceCapabilities ?? (executable ? [vendor === "linux" ? "ssh" : vendor === "cisco" ? "ios-xe-ssh" : "routeros-ssh"] : []),
    disabledReasonFa: executable || manual ? null : options.disabledReasonFa ?? "handler اجرایی معتبر هنوز پیاده‌سازی نشده است.",
    uiHints: { executable, badgeFa }
  };
}
const implemented = (template: string, extra: Options = {}): Options => ({ ...extra, state: "implemented", template });
const manual = (extra: Options = {}): Options => ({ ...extra, state: "manualOnly", mutates: extra.mutates ?? true });
const planned = (extra: Options = {}): Options => ({ ...extra, state: "planned" });
function applySupportState(entry: CommandCatalogItem): CommandCatalogItem {
  const support = evaluateCatalogSupportState(entry);
  const executable = support.supportState === "verified";
  const badgeFa = support.supportState === "verified" ? "تأییدشده" : support.supportState === "preview_only" ? "فقط پیش‌نمایش" : support.supportState === "manual_only" ? "بررسی دستی" : "پشتیبانی نمی‌شود";
  return {
    ...entry,
    executionSupport: executable ? "connector" : support.supportState === "manual_only" ? "manual" : "not_implemented",
    supportState: support.supportState,
    supportReason: support.reason,
    supportReasonKey: support.reasonKey,
    supportedConnectors: executable ? entry.supportedConnectors : [],
    disabledReasonFa: executable || support.supportState === "manual_only" ? entry.disabledReasonFa : support.reason,
    uiHints: { executable, badgeFa }
  };
}
const fortiParam = (key: string): CommandParam => param(key, key, `مقدار ${key} را وارد کنید.`, key.toLowerCase().includes("ip") || key.toLowerCase().includes("gateway") ? "ip" : key.toLowerCase().includes("cidr") || key.toLowerCase().includes("trusthost") ? "cidr" : key.toLowerCase().includes("port") || key.toLowerCase().includes("vlan") || key.toLowerCase().includes("priority") ? "number" : "string");
const fullControlFortiGateItems = FORTIGATE_FULL_CONTROL_REGISTRY.map((entry) => item("fortigate", entry.actionType.replace(/^fortigate_/, "").replace(/_/g, "-"), entry.titleFa, entry.actionType, entry.category, entry.actionType, implemented(entry.executionTemplateRef, {
  mutates: !entry.actionType.startsWith("fortigate_show_") && entry.actionType !== "fortigate_ha_precheck",
  riskLevel: entry.risk as CommandRiskLevel,
  required: entry.requiredParams.map(fortiParam),
  prechecks: entry.preChecks,
  verification: entry.verificationCommands,
  rollback: entry.rollbackTemplate === "none_read_only" ? { available: false, notAvailableReasonFa: "این عملیات فقط خواندنی است." } : { available: true, steps: ["Snapshot قبل از تغییر و rollback reference در audit نگهداری می‌شود."] },
  searchKeywordsFa: [entry.titleFa, entry.actionType.replace(/_/g, " "), entry.category],
  uiHints: { executable: true, badgeFa: "اجراپذیر" },
})));



const ciscoParam = (key: string): CommandParam => param(key, key, `Cisco parameter ${key}.`, key.toLowerCase().includes("vlan") || key.toLowerCase().includes("asn") || key.toLowerCase().includes("group") || key.toLowerCase().includes("id") ? "number" : key.toLowerCase().includes("ip") || key.toLowerCase().includes("hop") || key.toLowerCase().includes("server") ? "ip" : key.toLowerCase().includes("cidr") || key.toLowerCase().includes("network") || key.toLowerCase().includes("source") ? "cidr" : "string");
const ciscoCommandCatalogItems = CISCO_OPERATION_REGISTRY.map((operation) => item("cisco", operation.slug, operation.titleFa, operation.titleEn, operation.category, "generic_security_action", (operation.state === "implemented" ? implemented(operation.executionTemplateRef!, {
  mutates: false,
  riskLevel: operation.risk as CommandRiskLevel,
  privilegeLevel: "read",
  required: [],
  optionalParams: [],
  prechecks: operation.prechecks,
  verification: operation.verification,
  rollback: operation.rollback.available ? { available: true, steps: operation.rollback.steps } : { available: false, notAvailableReasonFa: operation.rollback.reason },
  searchKeywordsFa: operation.keywords,
  descriptionFa: `${operation.titleFa} through the controlled Cisco IOS-XE SSH connector and Action Center review flow.`
}) : operation.state === "manualOnly" ? manual({
  mutates: !operation.readOnly,
  riskLevel: operation.risk as CommandRiskLevel,
  required: (operation.requiredParams ?? []).map(ciscoParam),
  optionalParams: (operation.optionalParams ?? []).map(ciscoParam),
  prechecks: operation.prechecks,
  verification: operation.verification,
  searchKeywordsFa: operation.keywords,
  descriptionFa: `${operation.titleFa} is prepared as a Cisco action definition but is manual-only until a verified connector contract exists.`
}) : planned({
  mutates: !operation.readOnly,
  riskLevel: operation.risk as CommandRiskLevel,
  required: (operation.requiredParams ?? []).map(ciscoParam),
  optionalParams: (operation.optionalParams ?? []).map(ciscoParam),
  prechecks: operation.prechecks,
  verification: operation.verification,
  searchKeywordsFa: operation.keywords,
  descriptionFa: `${operation.titleFa} is in the Cisco roadmap. It is not executable until template, precheck, parser, verification, and rollback support are registered.`
}))));

const RAW_COMMAND_CATALOG: readonly CommandCatalogItem[] = [
  item("linux", "daily-check", "چک روزانه", "Daily check", "daily-check", "linux_daily_check", implemented("linux_daily_check", { searchKeywordsFa: ["چک روزانه سرور", "بررسی روزانه"] })),
  item("linux", "open-port", "باز کردن پورت", "Open port", "firewall", "linux_open_port", implemented("linux_open_port", { mutates: true, required: [param("port", "شماره پورت", "شماره پورت TCP/UDP معتبر را وارد کنید.", "number", "55000")], defaultParams: { protocol: "tcp" } })),
  item("linux", "close-port", "بستن پورت", "Close port", "firewall", "close_port", implemented("linux_close_port", { mutates: true, riskLevel: "medium", required: [param("port", "شماره پورت", "شماره پورت TCP/UDP معتبر را وارد کنید.", "number", "545")], defaultParams: { protocol: "tcp" }, verification: ["وضعیت موثر فایروال پس از اجرا بررسی شود"], rollback: { available: true, steps: ["قانون allow حذف شده فقط با تایید کاربر بازگردانده شود"] } })),
  item("linux", "open-ports", "نمایش پورت‌های باز", "Show open ports", "network", "linux_list_open_ports", implemented("linux_list_open_ports")),
  item("linux", "ssh-status", "بررسی وضعیت SSH", "Check SSH status", "ssh", "linux_check_ssh_status", implemented("linux_check_ssh_status")),
  item("linux", "failed-logins", "بررسی لاگ‌های ورود ناموفق", "Review failed logins", "authentication", "linux_check_failed_logins", implemented("linux_check_failed_logins", { searchKeywordsFa: ["ورود ناموفق", "لاگ احراز هویت"] })),
  item("linux", "sudo-users", "بررسی کاربران sudo", "Review sudo users", "identity", "linux_check_sudo_users", implemented("linux_check_sudo_users")),
  item("linux", "firewall-status", "بررسی وضعیت فایروال", "Check firewall status", "firewall", "linux_check_firewall_status", implemented("linux_check_firewall_status")),
  item("linux", "fail2ban-status", "بررسی fail2ban", "Check fail2ban", "hardening", "linux_check_fail2ban_status", implemented("linux_check_fail2ban_status")),
  item("linux", "block-ip", "بلاک کردن IP مشکوک", "Block suspicious IP", "firewall", "linux_block_ip", implemented("linux_block_ip", { mutates: true, required: [ipAddress], defaultParams: { durationMinutes: 30 }, optionalParams: [param("durationMinutes", "مدت مسدودی", "مدت مسدودی بر حسب دقیقه.", "number", "30")], rollback: { available: true, steps: ["حذف قانون deny مدیریت‌شده برای IP"] } })),
  item("linux", "service-status", "بررسی وضعیت سرویس", "Check service status", "services", "linux_check_service_status", implemented("linux_check_service_status", { required: [serviceName] })),
  item("linux", "services-running", "نمایش سرویس‌های فعال", "List running services", "services", "linux_list_running_services", implemented("linux_list_running_services", { searchKeywordsFa: ["سرویس های فعال", "لیست سرویس های فعال"] })),
  item("linux", "services-failed", "نمایش سرویس‌های خطادار", "List failed services", "services", "linux_list_failed_services", implemented("linux_list_failed_services", { searchKeywordsFa: ["سرویس های خطادار", "سرویس های fail شده"] })),
  item("linux", "services-important", "بررسی سرویس‌های مهم", "Check important services", "services", "linux_check_important_services", implemented("linux_check_important_services", { searchKeywordsFa: ["سرویس های مهم", "بررسی nginx ssh docker fail2ban"] })),
  item("linux", "remove-user-sudo", "حذف کاربر از sudo", "Remove user from sudo", "identity", "linux_remove_user_from_sudo", implemented("linux_remove_user_from_sudo", { mutates: true, required: [username], rollback: { available: true, steps: ["افزودن دوباره کاربر به گروه sudo"] } })),
  item("linux", "add-user-sudo", "افزودن کاربر به sudo", "Add user to sudo", "identity", "linux_add_user_to_sudo", implemented("linux_add_user_to_sudo", { mutates: true, required: [username], rollback: { available: true, steps: ["حذف کاربر از گروه sudo"] } })),
  item("linux", "user-groups", "بررسی گروه‌های کاربر", "Check user groups", "identity", "linux_check_user_groups", implemented("linux_check_user_groups", { required: [username] })),
  item("linux", "lock-user", "قفل کردن کاربر", "Lock user", "identity", "linux_lock_user", implemented("linux_lock_user", { mutates: true, required: [username], rollback: { available: true, steps: ["باز کردن قفل کاربر"] } })),
  item("linux", "unlock-user", "باز کردن قفل کاربر", "Unlock user", "identity", "linux_unlock_user", implemented("linux_unlock_user", { mutates: true, required: [username], rollback: { available: true, steps: ["قفل کردن دوباره کاربر در صورت نیاز"] } })),
  item("linux", "restrict-ssh", "محدود کردن SSH", "Restrict SSH", "ssh", "generic_security_action", manual({ required: [allowedSource], riskLevel: "high" })),
  item("linux", "enable-fail2ban", "فعال‌سازی fail2ban", "Enable fail2ban", "hardening", "generic_security_action", manual({ riskLevel: "medium" })),

  item("mikrotik", "daily-check", "چک روزانه", "Daily check", "daily-check", "mikrotik_daily_check", implemented("mikrotik_daily_check", { searchKeywordsFa: ["چک روزانه روتر", "بررسی روزانه"] })),
  item("mikrotik", "management-services", "نمایش سرویس‌های مدیریتی", "Show management services", "management", "mikrotik_list_management_services", implemented("mikrotik_list_management_services")),
  item("mikrotik", "firewall-filter", "بررسی firewall filter", "Review firewall filter", "firewall", "mikrotik_list_filter_rules", implemented("mikrotik_check_firewall_filter")),
  item("mikrotik", "dangerous-nat", "بررسی NATهای خطرناک", "Review dangerous NAT", "nat", "mikrotik_list_nat_rules", implemented("mikrotik_check_nat_exposure")),
  item("mikrotik", "failed-logins", "نمایش لاگ‌های ورود ناموفق", "Show failed logins", "authentication", "mikrotik_check_login_logs", implemented("mikrotik_check_failed_logins")),
  item("mikrotik", "block-ip", "بلاک کردن IP", "Block IP", "firewall", "mikrotik_block_ip", implemented("mikrotik_block_ip", { mutates: true, required: [ipAddress], defaultParams: { timeout: "30m", listName: "firewall-log-analyzer-blocked" }, rollback: { available: true, steps: ["حذف IP از address-list مدیریت‌شده"] } })),
  item("mikrotik", "backup", "بکاپ تنظیمات", "Backup configuration", "backup", "mikrotik_create_backup", implemented("mikrotik_backup_config", { mutates: true, riskLevel: "medium", rollback: { available: false, notAvailableReasonFa: "ساخت فایل بکاپ تغییر پیکربندی ندارد؛ فایل در صورت نیاز دستی حذف می‌شود." } })),
  item("mikrotik", "restrict-management", "محدود کردن دسترسی WinBox/SSH", "Restrict WinBox/SSH", "management", "generic_security_action", manual({ required: [allowedSource], riskLevel: "high" })),
  item("mikrotik", "change-ssh-port", "تغییر پورت SSH", "Change SSH port", "management", "mikrotik_change_service_port", planned({ mutates: true, riskLevel: "high" })),

  item("fortigate", "daily-check", "چک روزانه FortiGate", "Daily check", "daily-check", "fortigate_daily_check", implemented("fortigate_daily_check", { mutates: false, searchKeywordsFa: ["بررسی روزانه فایروال", "سلامت فورتی گیت"] })),
  item("fortigate", "interfaces", "وضعیت اینترفیس‌ها و پورت‌های مدیریتی", "Interface status", "network", "fortigate_show_interfaces", implemented("fortigate_show_interfaces", { mutates: false, searchKeywordsFa: ["وضعیت پورت ها", "پورت های باز", "اینترفیس های فایروال"] })),
  item("fortigate", "route-dns", "بررسی مسیر و DNS", "Route and DNS", "network", "fortigate_route_dns_check", implemented("fortigate_route_dns_check", { mutates: false, searchKeywordsFa: ["route و dns", "مسیر و dns"] })),
  item("fortigate", "license", "وضعیت لایسنس و FortiGuard", "License and FortiGuard", "system", "fortigate_license_status", implemented("fortigate_license_status", { mutates: false, searchKeywordsFa: ["وضعیت لایسنس", "FortiGuard"] })),
  item("fortigate", "admins", "کاربران مدیر", "Admin users", "identity", "fortigate_admin_users", implemented("fortigate_admin_users", { mutates: false, searchKeywordsFa: ["کاربران ادمین", "admin users"] })),
  item("fortigate", "system-status", "سلامت و وضعیت سیستم", "System status", "system", "fortigate_show_system_status", implemented("fortigate_show_system_status", { mutates: false, searchKeywordsFa: ["وضعیت سیستم", "سلامت فورتی گیت", "نسخه و منابع"] })),
  item("fortigate", "routing-dns-full", "مسیرها و DNS", "Routing and DNS", "network", "fortigate_show_routing_dns", implemented("fortigate_show_routing_dns", { mutates: false, searchKeywordsFa: ["مسیر پیش فرض", "گیت وی", "dns فورتی گیت"] })),
  item("fortigate", "admin-access", "امنیت دسترسی مدیران", "Admin access", "identity", "fortigate_show_admin_access", implemented("fortigate_show_admin_access", { mutates: false, searchKeywordsFa: ["امنیت ادمین", "trusthost", "دسترسی مدیریتی"] })),
  item("fortigate", "firewall-policies", "Policy، NAT و VIP", "Policies, NAT and VIP", "firewall", "fortigate_show_firewall_policies", implemented("fortigate_show_firewall_policies", { mutates: false, searchKeywordsFa: ["policy ها", "nat و vip", "قوانین فایروال"] })),
  item("fortigate", "vpn-status", "وضعیت VPN", "VPN status", "vpn", "fortigate_show_vpn_status", implemented("fortigate_show_vpn_status", { mutates: false, searchKeywordsFa: ["وضعیت vpn", "تونل ipsec", "ssl vpn"] })),
  item("fortigate", "ha-vdom-zone", "HA، VDOM و Zone", "HA, VDOM and zones", "network", "fortigate_show_ha_vdom_zone", implemented("fortigate_show_ha_vdom_zone", { mutates: false, searchKeywordsFa: ["وضعیت ha", "vdom ها", "zone ها"] })),
  ...fullControlFortiGateItems,
  ...ciscoCommandCatalogItems,
  item("cisco", "daily-check", "چک روزانه", "Daily check", "daily-check", "generic_security_action", manual({ mutates: false })),
  item("pfsense", "daily-check", "چک روزانه", "Daily check", "daily-check", "generic_security_action", manual({ mutates: false })),
  item("juniper", "daily-check", "چک روزانه", "Daily check", "daily-check", "generic_security_action", manual({ mutates: false })),
  item("paloalto", "daily-check", "چک روزانه", "Daily check", "daily-check", "generic_security_action", manual({ mutates: false })),
  item("windows", "daily-check", "چک روزانه", "Daily check", "daily-check", "generic_security_action", manual({ mutates: false })),
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
];

export const COMMAND_CATALOG: readonly CommandCatalogItem[] = Object.freeze(RAW_COMMAND_CATALOG.map(applySupportState));

export const COMMAND_CATALOG_VERSION = "2026.07.05.1";

export function findCatalogItem(id: string) { return COMMAND_CATALOG.find((entry) => entry.id === id); }
export function searchCatalog(filters: { q?: string; vendor?: string; category?: string; riskLevel?: string; readOnly?: boolean; executable?: boolean; includePlanned?: boolean }) {
  const q = filters.q?.trim().toLocaleLowerCase("fa") ?? "";
  return COMMAND_CATALOG.filter((entry) => {
    if (!filters.includePlanned && (entry.implementationState === "planned" || entry.implementationState === "unsupported")) return false;
    const haystack = [entry.titleFa, entry.titleEn, entry.descriptionFa, entry.vendor, entry.category, ...entry.tagsFa, ...entry.searchKeywordsFa].join(" ").toLocaleLowerCase("fa");
    return (!q || haystack.includes(q)) && (!filters.vendor || entry.vendor === filters.vendor) && (!filters.category || entry.category === filters.category) && (!filters.riskLevel || entry.riskLevel === filters.riskLevel) && (filters.readOnly === undefined || entry.readOnly === filters.readOnly) && (filters.executable === undefined || (entry.supportState === "verified") === filters.executable);
  });
}
export type { CommandCatalogItem } from "./types.js";
