import { FORTIGATE_FULL_CONTROL_REGISTRY } from "../../fortigate/full-control-registry.js";
import type { CommandCatalogItem, CommandParam, CommandRiskLevel, CommandVendor, ImplementationState } from "./types.js";
import { evaluateCatalogSupportState } from "./support-state.js";
import { CISCO_OPERATION_REGISTRY } from "../../cisco/cisco-operation-registry.js";
import { SWITCHING_ACTIONS } from "../../cisco/cisco-switching.js";
export { COMMAND_CATALOG_VERSION } from "./version.js";

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
    connectorType: executable ? (vendor === "linux" ? "linux-ssh" : vendor === "fortigate" ? "fortigate-ssh" : vendor === "cisco" ? "cisco-ios-xe-ssh" : vendor === "sophos" ? "sophos-api" : vendor === "esxi" ? "esxi-soap" : "mikrotik-ssh") : null,
    riskLevel: options.riskLevel ?? (mutating ? "high" : "low") as CommandRiskLevel,
    privilegeLevel: options.privilegeLevel ?? (mutating ? "admin" : "read"),
    readOnly: !mutating, mutating, requiresConfirmation: mutating,
    requiredParams, optionalParams: options.optionalParams ?? [], defaultParams: options.defaultParams ?? {},
    paramCandidates: options.paramCandidates ?? {}, autoResolveParams: options.autoResolveParams ?? [],
    paramLabelsFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.labelFa])),
    paramHelpFa: Object.fromEntries(requiredParams.map((field) => [field.key, field.helpFa])),
    tagsFa: options.tagsFa ?? [titleFa, category], searchKeywordsFa: options.searchKeywordsFa ?? [],
    supportedConnectors: executable ? [vendor === "linux" ? "linux-ssh" : vendor === "fortigate" ? "fortigate-ssh" : vendor === "cisco" ? "cisco-ios-xe-ssh" : vendor === "sophos" ? "sophos-api" : vendor === "esxi" ? "esxi-soap" : "mikrotik-ssh"] : [],
    prechecks: options.prechecks ?? ["اتصال و اعتبارنامه دستگاه بررسی شود"],
    validationRules: options.validationRules ?? Object.fromEntries(requiredParams.map((field) => [field.key, [field.type, "required"]])),
    executionTemplateRef: options.template ?? null,
    verification: options.verification ?? ["خروجی فرمان و وضعیت دستگاه بازبینی شود"],
    rollback: options.rollback ?? (mutating ? { available: false, notAvailableReasonFa: "بازگشت خودکار برای این عملیات پیاده‌سازی نشده است؛ بازگشت باید دستی بازبینی شود." } : { available: false, notAvailableReasonFa: "عملیات فقط‌خواندنی است و تغییری برای بازگشت ندارد." }),
    evidenceOutput: options.evidenceOutput ?? ["خروجی خلاصه‌شده", "زمان بررسی", "دستگاه هدف"],
    supportedDeviceCapabilities: options.supportedDeviceCapabilities ?? (executable ? [vendor === "linux" ? "ssh" : vendor === "cisco" ? "ios-xe-ssh" : vendor === "sophos" ? "sfos-xml-api" : vendor === "esxi" ? "esxi-soap" : "routeros-ssh"] : []),
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



const ciscoParam = (key: string): CommandParam => {
  const labels: Record<string, [string, string, string?]> = {
    groupId: ["شماره Port-channel", "برای Catalyst 2960-X عددی از ۱ تا ۲۴ وارد کنید.", "5"],
    interfaces: ["پورت‌های عضو", "۲ تا ۸ پورت فیزیکی هم‌نوع، جداشده با ویرگول. پورت‌های دارای تنظیمات ناسازگار قبل از تغییر رد می‌شوند.", "Gi1/0/1, Gi1/0/2"],
    accessVlanId: ["VLAN دسترسی", "VLAN یکسان برای همهٔ پورت‌های عضو (۱ تا ۴۰۹۴).", "10"],
    allowedVlans: ["VLANهای مجاز", "فهرست دقیق مانند 10,20-25؛ all یعنی همه و none یعنی هیچ‌کدام. افزودن، حذف و جایگزینی عملیات جدا هستند.", "10,20-25"],
    nativeVlanId: ["Native VLAN", "VLAN ترافیک بدون تگ؛ باید با سمت مقابل مطابقت داشته باشد.", "1"],
    portMode: ["حالت گروه موجود", "برای افزودن عضو، همان حالت Access یا Trunk گروه موجود را انتخاب کنید."],
    lacpMode: ["حالت LACP", "Active پیشنهاد می‌شود. در حالت Passive باید سمت مقابل Active باشد."],
    enableMembers: ["روشن‌کردن اعضای انتخابی", "اگر انتخاب شود no shutdown روی اعضای انتخابی اعمال می‌شود؛ در غیر این صورت وضعیت مدیریتی قبلی حفظ می‌شود."],
    name: ["نام VLAN", "حداکثر ۳۲ حرف لاتین، عدد، خط تیره یا زیرخط.", "Office"],
    acknowledgeDisruption: ["تأیید اثر روی ترافیک", "تغییر پورت‌های عضو ممکن است ترافیک را قطع کند. ابتدا سمت مقابل را برای LACP آماده کنید."],
    interfaceName: ["نام اینترفیس", "نام دقیق پورت روی دستگاه را وارد کنید.", "Gi1/0/1"],
    vlanId: ["شماره VLAN", "شماره VLAN دستگاه را وارد کنید.", "10"],
    target: ["آدرس مقصد", "آدرس IPv4 مقصد را وارد کنید.", "192.0.2.10"],
    aclName: ["نام ACL", "نام ACL لاتین و بدون فاصله؛ مانند MGMT_ONLY.", "MGMT_ONLY"],
    sequence: ["شماره ترتیب", "شماره دقیق قانون در ACL؛ مانند ۱۰.", "10"],
    action: ["عمل ACL", "فقط permit یا deny.", "permit"],
    sourceCidr: ["شبکه مبدأ", "آدرس IPv4/CIDR مبدأ؛ مانند 192.168.10.0/24.", "192.168.10.0/24"],
    direction: ["جهت ACL", "in برای ترافیک ورودی یا out برای خروجی.", "in"]
  };
  const [label, help, placeholder] = labels[key] ?? [key, `مقدار ${key} را وارد کنید.`];
  const type = key === "allowedVlans" ? "string" : key === "acknowledgeDisruption" || key === "enableMembers" ? "boolean"
    : key === "sequence" || key.toLowerCase().includes("port") || key.toLowerCase().includes("vlan") || key.toLowerCase().includes("asn") || key.toLowerCase().includes("group") || key.toLowerCase().includes("id") ? "number"
      : key.toLowerCase().includes("ip") || key.toLowerCase().includes("hop") || key.toLowerCase().includes("server") ? "ip"
        : key.toLowerCase().includes("cidr") || key.toLowerCase().includes("network") || key.toLowerCase().includes("source") ? "cidr" : "string";
  return param(key, label, help, type, placeholder);
};
const ciscoCommandCatalogItems = CISCO_OPERATION_REGISTRY.map((operation) => item("cisco", operation.slug, operation.titleFa, operation.titleEn, operation.category, "generic_security_action", (operation.state === "implemented" ? implemented(operation.executionTemplateRef!, {
  mutates: !operation.readOnly,
  riskLevel: operation.risk as CommandRiskLevel,
  privilegeLevel: operation.readOnly ? "read" : "admin",
  required: (operation.requiredParams ?? []).map(ciscoParam),
  optionalParams: (operation.optionalParams ?? []).map(ciscoParam),
  defaultParams: operation.optionalParams?.includes("lacpMode") ? { lacpMode: "active" } : {},
  paramCandidates: { lacpMode: ["active", "passive"], portMode: ["access", "trunk"] },
  prechecks: operation.prechecks,
  verification: operation.verification,
  rollback: operation.rollback.available ? { available: true, steps: operation.rollback.steps } : { available: false, notAvailableReasonFa: operation.rollback.reason },
  searchKeywordsFa: operation.keywords,
  descriptionFa: operation.slug === "create-access-etherchannel"
    ? "ساخت Port-channel از پورت‌های access با LACP؛ ابتدا پیش‌نیازهای دستگاه بررسی و فرمان‌ها برای تأیید شما نمایش داده می‌شوند. سمت مقابل باید از قبل آماده باشد."
    : /remove-etherchannel-members|delete-etherchannel/.test(operation.slug)
      ? "اعضای جداشده خاموش می‌مانند تا حلقه شبکه ایجاد نشود؛ تنظیمات قبلی پورت پاک نمی‌شود."
      : operation.slug === "configure-trunk-allowed-vlans" ? "کل فهرست VLANهای مجاز جایگزین می‌شود؛ برای حفظ بقیه، عملیات افزودن یا حذف انتخابی را انتخاب کنید."
      : SWITCHING_ACTIONS.some(action => action.slug === operation.slug)
        ? `${operation.titleFa} با بررسی تنظیمات فعلی، بک‌آپ ایمنی و تطبیق نتیجه؛ Startup-config خودکار ذخیره نمی‌شود.`
        : `${operation.titleFa} برای دستگاه انتخاب‌شده، با ثبت شواهد و بازبینی نتیجه.`,
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
  item("linux", "reboot", "راه‌اندازی دوباره سرور", "Reboot server", "system", "linux_reboot", implemented("linux_reboot", { mutates: true, riskLevel: "critical", verification: ["پذیرش فرمان systemd توسط کانکتور و ثبت قطع مورد انتظار نشست SSH"] })),
  item("linux", "shutdown", "خاموش کردن سرور", "Power off server", "system", "linux_shutdown", implemented("linux_shutdown", { mutates: true, riskLevel: "critical", verification: ["پذیرش فرمان poweroff توسط کانکتور و ثبت قطع مورد انتظار نشست SSH"] })),
  item("linux", "open-port", "باز کردن پورت", "Open port", "firewall", "linux_open_port", implemented("linux_open_port", { mutates: true, required: [param("port", "شماره پورت", "شماره پورت TCP/UDP معتبر را وارد کنید.", "number", "55000")], defaultParams: { protocol: "tcp" } })),
  item("linux", "close-port", "بستن پورت", "Close port", "firewall", "close_port", implemented("linux_close_port", { mutates: true, riskLevel: "medium", required: [param("port", "شماره پورت", "شماره پورت TCP/UDP معتبر را وارد کنید.", "number", "545")], defaultParams: { protocol: "tcp" }, verification: ["وضعیت موثر فایروال پس از اجرا بررسی شود"], rollback: { available: true, steps: ["قانون allow حذف شده فقط با تایید کاربر بازگردانده شود"] } })),
  item("linux", "open-ports", "نمایش پورت‌های باز", "Show open ports", "network", "linux_list_open_ports", implemented("linux_list_open_ports")),
  item("linux", "ssh-status", "بررسی وضعیت SSH", "Check SSH status", "ssh", "linux_check_ssh_status", implemented("linux_check_ssh_status")),
  item("linux", "failed-logins", "بررسی لاگ‌های ورود ناموفق", "Review failed logins", "authentication", "linux_check_failed_logins", implemented("linux_check_failed_logins", { searchKeywordsFa: ["ورود ناموفق", "لاگ احراز هویت"] })),
  item("linux", "live-logs", "پایش زندهٔ لاگ لینوکس", "Live Linux logs", "observability", "linux_read_auth_logs", implemented("linux_live_log_query", {
    required: [param("logQuery", "فیلتر لاگ", "پرس‌وجوی ساختاریافته؛ از اقدام با یک جمله بسازید. پیش‌نمایش اتصال خودکار ساخته می‌شود.", "string")],
    descriptionFa: "دریافت فقط‌خواندنی لاگ واقعی از SSH؛ سرویس، IP و عبارت، حداکثر ۳۰ دقیقه و حافظهٔ محدود، بدون ذخیرهٔ دائمی متن لاگ.",
    prechecks: ["مالکیت، SSH، کلید میزبان، مسیر VPN و خواندنی‌بودن منبع بررسی شود"],
    verification: ["اتصال واقعی و بررسی موفق منبع و بازماندن جریان؛ سلامت سرویس از سکوت لاگ نتیجه‌گیری نمی‌شود"],
    searchKeywordsFa: ["لاگ زنده", "لاگ سرویس", "لاگ IP"]
  })),
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
  item("mikrotik", "reboot", "راه‌اندازی دوباره روتر", "Reboot router", "system", "mikrotik_reboot", implemented("mikrotik_reboot", { mutates: true, riskLevel: "critical", verification: ["پذیرش فرمان RouterOS و ثبت قطع مورد انتظار نشست SSH"] })),
  item("mikrotik", "shutdown", "خاموش کردن روتر", "Shut down router", "system", "mikrotik_shutdown", implemented("mikrotik_shutdown", { mutates: true, riskLevel: "critical", verification: ["پذیرش فرمان RouterOS و ثبت قطع مورد انتظار نشست SSH"] })),
  item("mikrotik", "management-services", "نمایش سرویس‌های مدیریتی", "Show management services", "management", "mikrotik_list_management_services", implemented("mikrotik_list_management_services")),
  item("mikrotik", "firewall-filter", "بررسی firewall filter", "Review firewall filter", "firewall", "mikrotik_list_filter_rules", implemented("mikrotik_check_firewall_filter")),
  item("mikrotik", "dangerous-nat", "بررسی NATهای خطرناک", "Review dangerous NAT", "nat", "mikrotik_list_nat_rules", implemented("mikrotik_check_nat_exposure")),
  item("mikrotik", "failed-logins", "نمایش لاگ‌های ورود ناموفق", "Show failed logins", "authentication", "mikrotik_check_login_logs", implemented("mikrotik_check_failed_logins")),
  item("mikrotik", "block-ip", "بلاک کردن IP", "Block IP", "firewall", "mikrotik_block_ip", implemented("mikrotik_block_ip", { mutates: true, required: [ipAddress], defaultParams: { timeout: "30m", listName: "firewall-log-analyzer-blocked", requireDropRule: true }, rollback: { available: true, steps: ["حذف IP از address-list مدیریت‌شده"] } })),
  item("mikrotik", "backup", "بکاپ تنظیمات", "Backup configuration", "backup", "mikrotik_create_backup", implemented("mikrotik_backup_config", { mutates: true, riskLevel: "medium", rollback: { available: false, notAvailableReasonFa: "ساخت فایل بکاپ تغییر پیکربندی ندارد؛ فایل در صورت نیاز دستی حذف می‌شود." } })),
  item("mikrotik", "enable-interface", "روشن کردن پورت", "Enable interface", "interfaces", "mikrotik_enable_interface", implemented("mikrotik_enable_interface", { mutates: true, riskLevel: "medium", required: [param("interfaceName", "نام پورت", "نام دقیق اینترفیس انتخاب‌شده را وارد کنید.", "string", "ether1")], rollback: { available: true, steps: ["غیرفعال‌کردن همان اینترفیس پس از بررسی مسیر مدیریت"] } })),
  item("mikrotik", "disable-interface", "خاموش کردن پورت", "Disable interface", "interfaces", "mikrotik_disable_interface", implemented("mikrotik_disable_interface", { mutates: true, riskLevel: "critical", required: [param("interfaceName", "نام پورت", "نام دقیق اینترفیس انتخاب‌شده را وارد کنید.", "string", "ether1")], rollback: { available: true, steps: ["فعال‌کردن دوباره همان اینترفیس"] } })),
  item("mikrotik", "set-interface-comment", "ثبت توضیح پورت", "Set interface comment", "interfaces", "mikrotik_set_interface_comment", implemented("mikrotik_set_interface_comment", { mutates: true, riskLevel: "medium", required: [param("interfaceName", "نام پورت", "نام دقیق اینترفیس انتخاب‌شده را وارد کنید.", "string", "ether1"), param("comment", "توضیح", "توضیح کوتاه و قابل شناسایی برای پورت.", "string", "uplink-to-core")], rollback: { available: true, steps: ["بازگرداندن comment قبلی از شواهد پیش‌نمایش"] } })),
  item("mikrotik", "enable-service", "فعال کردن سرویس مدیریتی", "Enable management service", "management", "mikrotik_enable_service", implemented("mikrotik_enable_service", { mutates: true, riskLevel: "medium", required: [param("serviceName", "نام سرویس", "سرویس RouterOS مانند ssh یا winbox.", "string", "ssh")] })),
  item("mikrotik", "disable-service", "غیرفعال کردن سرویس مدیریتی", "Disable management service", "management", "mikrotik_disable_service", implemented("mikrotik_disable_service", { mutates: true, riskLevel: "high", required: [param("serviceName", "نام سرویس", "سرویس RouterOS مانند ssh یا winbox.", "string", "ssh")] })),
  item("mikrotik", "interfaces", "نمایش همه اینترفیس‌ها", "List interfaces", "interfaces", "mikrotik_list_interfaces", implemented("mikrotik_list_interfaces")),
  item("mikrotik", "routes", "نمایش جدول مسیریابی", "List routes", "routing", "mikrotik_list_routes", implemented("mikrotik_list_routes")),
  item("mikrotik", "address-lists", "نمایش Address Listها", "List address lists", "firewall", "mikrotik_list_address_list", implemented("mikrotik_list_address_list")),
  item("mikrotik", "dns-settings", "نمایش تنظیمات DNS", "Show DNS settings", "dns", "mikrotik_show_dns_settings", implemented("mikrotik_show_dns_settings")),
  item("mikrotik", "dhcp-servers", "نمایش DHCP Serverها", "List DHCP servers", "dhcp", "mikrotik_list_dhcp_servers", implemented("mikrotik_list_dhcp_servers")),
  item("mikrotik", "dhcp-leases", "نمایش DHCP Leaseها", "List DHCP leases", "dhcp", "mikrotik_list_dhcp_leases", implemented("mikrotik_list_dhcp_leases")),
  item("mikrotik", "resources", "نمایش منابع و سلامت روتر", "Show system resources", "system", "mikrotik_show_resources", implemented("mikrotik_show_resources")),
  item("mikrotik", "logs", "نمایش لاگ‌های RouterOS", "Show RouterOS logs", "observability", "mikrotik_show_logs", implemented("mikrotik_show_logs")),
  item("mikrotik", "create-filter-rule", "ساخت قانون مدیریت‌شده فایروال", "Create managed firewall rule", "firewall", "mikrotik_create_filter_rule", implemented("mikrotik_create_filter_rule", {
    mutates: true, riskLevel: "high",
    required: [param("chain", "زنجیره", "input یا forward را وارد کنید.", "string", "forward"), param("action", "عمل", "برای اجازه accept و برای مسدودسازی drop.", "string", "drop")],
    optionalParams: [param("sourceCidr", "مبدأ", "IPv4/CIDR اختیاری.", "cidr", "192.168.10.0/24"), param("protocol", "پروتکل", "tcp یا udp.", "string", "tcp"), param("dstPort", "پورت مقصد", "پورت مقصد اختیاری.", "number", "443"), param("comment", "توضیح", "شناسه قابل پیگیری قانون.", "string", "block-untrusted-web")],
    defaultParams: { action: "drop", disabled: true },
    verification: ["قانون با comment مدیریت‌شده ساخته و از RouterOS دوباره خوانده می‌شود؛ قانون جدید برای جلوگیری از قطع ناخواسته، ابتدا غیرفعال است."],
    rollback: { available: true, steps: ["حذف فقط قانون دارای comment مدیریت‌شده ثبت‌شده در نتیجه اجرا"] }
  })),
  item("mikrotik", "enable-filter-rule", "فعال‌کردن قانون مدیریت‌شده فایروال", "Enable managed firewall rule", "firewall", "mikrotik_enable_filter_rule", implemented("mikrotik_enable_filter_rule", { mutates: true, riskLevel: "high", required: [param("ruleId", "شناسه قانون", "شناسه دقیق RouterOS مانند *A؛ فقط قانون ساخته‌شده توسط سامانه پذیرفته می‌شود.", "string", "*A")], rollback: { available: true, steps: ["غیرفعال‌کردن همان قانون"] } })),
  item("mikrotik", "disable-filter-rule", "غیرفعال‌کردن قانون مدیریت‌شده فایروال", "Disable managed firewall rule", "firewall", "mikrotik_disable_filter_rule", implemented("mikrotik_disable_filter_rule", { mutates: true, riskLevel: "high", required: [param("ruleId", "شناسه قانون", "شناسه دقیق RouterOS؛ فقط قانون مدیریت‌شده پذیرفته می‌شود.", "string", "*A")], rollback: { available: true, steps: ["فعال‌کردن دوباره همان قانون"] } })),
  item("mikrotik", "create-port-forward", "ساخت Port Forward کنترل‌شده", "Create controlled port forward", "nat", "mikrotik_create_dstnat_rule", implemented("mikrotik_create_dstnat_rule", {
    mutates: true, riskLevel: "high",
    required: [param("dstPort", "پورت عمومی", "پورت ورودی روی روتر.", "number", "443"), param("toAddress", "IP مقصد", "IPv4 داخلی مقصد.", "ip", "192.168.10.20")],
    optionalParams: [param("toPort", "پورت داخلی", "در صورت خالی بودن برابر پورت عمومی است.", "number", "8443"), param("protocol", "پروتکل", "tcp یا udp.", "string", "tcp"), param("comment", "توضیح", "شناسه قانون NAT.", "string", "publish-app")],
    defaultParams: { protocol: "tcp" }, verification: ["قانون DST-NAT به‌صورت disabled ساخته و با comment مدیریت‌شده ثبت می‌شود."], rollback: { available: true, steps: ["حذف فقط قانون NAT مدیریت‌شده ایجادشده"] }
  })),
  item("mikrotik", "create-masquerade", "ساخت قانون Masquerade کنترل‌شده", "Create controlled masquerade", "nat", "mikrotik_create_srcnat_masquerade_rule", implemented("mikrotik_create_srcnat_masquerade_rule", { mutates: true, riskLevel: "high", required: [param("outInterface", "اینترفیس خروجی", "نام دقیق WAN مانند ether1.", "string", "ether1")], optionalParams: [param("srcAddress", "شبکه مبدأ", "IPv4/CIDR اختیاری.", "cidr", "192.168.10.0/24"), param("comment", "توضیح", "شناسه قانون NAT.", "string", "lan-masquerade")], verification: ["قانون Masquerade به‌صورت disabled ساخته می‌شود."], rollback: { available: true, steps: ["حذف فقط قانون NAT مدیریت‌شده ایجادشده"] } })),
  item("mikrotik", "enable-nat-rule", "فعال‌کردن قانون NAT مدیریت‌شده", "Enable managed NAT rule", "nat", "mikrotik_enable_nat_rule", implemented("mikrotik_enable_nat_rule", { mutates: true, riskLevel: "high", required: [param("ruleId", "شناسه قانون", "شناسه دقیق قانون مدیریت‌شده RouterOS.", "string", "*A")], rollback: { available: true, steps: ["غیرفعال‌کردن همان قانون NAT"] } })),
  item("mikrotik", "disable-nat-rule", "غیرفعال‌کردن قانون NAT مدیریت‌شده", "Disable managed NAT rule", "nat", "mikrotik_disable_nat_rule", implemented("mikrotik_disable_nat_rule", { mutates: true, riskLevel: "high", required: [param("ruleId", "شناسه قانون", "شناسه دقیق قانون مدیریت‌شده RouterOS.", "string", "*A")], rollback: { available: true, steps: ["فعال‌کردن دوباره همان قانون NAT"] } })),
  item("mikrotik", "add-static-route", "ساخت مسیر ثابت کنترل‌شده", "Add controlled static route", "routing", "mikrotik_add_static_route", implemented("mikrotik_add_static_route", { mutates: true, riskLevel: "high", required: [param("dstAddress", "شبکه مقصد", "IPv4/CIDR مقصد.", "cidr", "10.20.0.0/16"), param("gateway", "Gateway", "IPv4 دروازه بعدی.", "ip", "192.168.10.1")], optionalParams: [param("comment", "توضیح", "شناسه مسیر.", "string", "branch-route")], verification: ["مسیر با comment مدیریت‌شده و در حالت disabled ساخته می‌شود."], rollback: { available: true, steps: ["حذف مسیر مدیریت‌شده ایجادشده"] } })),
  item("mikrotik", "set-dns-servers", "تنظیم DNS Serverها", "Set DNS servers", "dns", "mikrotik_set_dns_servers", implemented("mikrotik_set_dns_servers", { mutates: true, riskLevel: "medium", required: [param("servers", "DNS Serverها", "IPv4ها را با ویرگول جدا کنید.", "string", "1.1.1.1,8.8.8.8")], verification: ["تنظیمات DNS بعد از تغییر دوباره خوانده می‌شود."], rollback: { available: true, steps: ["بازگرداندن DNSهای قبلی از بک‌آپ پیش از اجرا"] } })),
  item("mikrotik", "add-static-dhcp-lease", "افزودن DHCP Lease ثابت", "Add static DHCP lease", "dhcp", "mikrotik_add_static_dhcp_lease", implemented("mikrotik_add_static_dhcp_lease", { mutates: true, riskLevel: "medium", required: [param("macAddress", "MAC Address", "MAC دقیق دستگاه.", "string", "00:11:22:33:44:55"), param("address", "IP ثابت", "IPv4 تخصیص‌یافته.", "ip", "192.168.10.50")], optionalParams: [param("comment", "توضیح", "نام یا نقش دستگاه.", "string", "printer-floor-2")], rollback: { available: true, steps: ["حذف Lease ثابت ایجادشده"] } })),
  item("mikrotik", "restrict-management", "محدود کردن دسترسی WinBox/SSH", "Restrict WinBox/SSH", "management", "mikrotik_restrict_service_by_address", implemented("mikrotik_restrict_service_by_address", { mutates: true, riskLevel: "high", required: [param("service", "سرویس", "ssh، winbox، api یا api-ssl.", "string", "winbox"), param("address", "شبکه مجاز", "IPv4/CIDR مدیریت مجاز.", "cidr", "192.168.10.0/24")], verification: ["محدوده آدرس سرویس مدیریتی پس از اجرا از RouterOS خوانده می‌شود."], rollback: { available: true, steps: ["بازگرداندن address قبلی سرویس از بک‌آپ"] } })),
  item("mikrotik", "change-ssh-port", "تغییر امن پورت SSH", "Safely change SSH port", "management", "mikrotik_change_service_port", implemented("mikrotik_change_service_port", { mutates: true, riskLevel: "high", required: [param("newPort", "پورت جدید", "پورت آزاد غیررزروشده.", "number", "22222"), param("trustedSourceCidr", "شبکه مجاز", "شبکه مدیریت مجاز برای پورت جدید.", "cidr", "192.168.10.0/24")], optionalParams: [param("oldPort", "پورت فعلی", "در صورت تشخیص خودکار لازم نیست وارد شود.", "number", "22")], defaultParams: { service: "ssh" }, verification: ["ابتدا Rule دسترسی مبدأ مجاز ساخته، سپس پورت تغییر و سرویس SSH دوباره خوانده می‌شود."], rollback: { available: true, steps: ["بازگرداندن پورت قبلی و حذف Rule دقیق ساخته‌شده"] } })),
  item("mikrotik", "set-identity", "تغییر نام روتر", "Set router identity", "system", "mikrotik_set_identity", implemented("mikrotik_set_identity", { mutates: true, riskLevel: "medium", required: [param("name", "نام روتر", "نام کوتاه و قابل شناسایی.", "string", "branch-router-01")], rollback: { available: true, steps: ["بازگرداندن نام قبلی از بک‌آپ"] } })),
  item("mikrotik", "sanitized-export", "ساخت Export بدون اطلاعات حساس", "Create sanitized export", "backup", "mikrotik_create_export_sanitized", implemented("mikrotik_create_export_sanitized", { mutates: true, riskLevel: "low", optionalParams: [param("name", "نام فایل", "نام فایل بدون پسوند.", "string", "router-export")], verification: ["RouterOS پذیرش فرمان export hide-sensitive را ثبت می‌کند."], rollback: { available: false, notAvailableReasonFa: "این عملیات تنظیمات را تغییر نمی‌دهد؛ فایل خروجی در صورت نیاز دستی حذف می‌شود." } })),

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
  item("fortigate", "guided-ipsec-site-to-site", "ساخت تونل Site-to-Site فورتی‌گیت", "Create FortiGate IPsec tunnel", "vpn", "fortigate_guided_vpn_setup", implemented("fortigate_guided_vpn_setup", {
    mutates: true, riskLevel: "high", descriptionFa: "فرم مرحله‌ای IKEv2، شبکه‌ها، WAN/LAN، PSK، Route و Policy؛ پیش‌نمایش و بررسی تنظیمات پس از اجرا.",
    required: [param("vpnName", "نام تونل", "نام حداکثر ۱۵ نویسه؛ با فرم مرحله‌ای تکمیل کنید.", "string", "BranchVPN"), param("pskSecretRef", "مرجع رمز مشترک", "فرم امن، رمز را به مرجع موقت تبدیل می‌کند.", "string")],
    verification: ["Phase1/Phase2 و Route و Policy در دستگاه تطبیق داده شوند؛ ایجاد تنظیمات به معنی برقراری SA نیست"], rollback: { available: false, notAvailableReasonFa: "بازگردانی دستی پس از بررسی اشیای ساخته‌شده و بک‌آپ" }, searchKeywordsFa: ["ساخت تونل", "IKEv2", "اترنت بین سایت", "IPsec"]
  })),
  item("sophos", "create-ipsec-tunnel", "ساخت تونل Site-to-Site سوفوس", "Create Sophos IPsec tunnel", "vpn", "generic_security_action", implemented("sophos_create_ipsec_tunnel", {
    mutates: true, riskLevel: "high", descriptionFa: "انتخاب شبکه‌ها و پروفایل IKEv2 موجود در دستگاه، ورود امن PSK و بررسی تنظیمات ساخته‌شده از XML API.",
    required: [param("vpnName", "نام تونل", "از فرم مرحله‌ای تکمیل کنید.", "string", "Branch_IPsec"), param("wanInterface", "پورت WAN", "پورت واقعی دستگاه.", "string"), param("localHost", "شبکه محلی", "IP Host نوع Network.", "string"), param("remoteHost", "شبکه سمت مقابل", "IP Host نوع Network.", "string"), param("remoteGateway", "دروازه سمت مقابل", "IPv4 ثابت.", "ip"), param("profileName", "پروفایل IPsec", "پروفایل امن IKEv2 موجود.", "string"), param("localId", "Local ID", "شناسه IPv4 محلی.", "ip"), param("remoteId", "Remote ID", "شناسه IPv4 سمت مقابل.", "ip"), param("pskSecretRef", "مرجع رمز مشترک", "با فرم امن ساخته می‌شود؛ رمز خام پذیرفته نمی‌شود.", "string"), param("profileIkev2Confirmed", "تأیید IKEv2", "پروفایل را در دستگاه بررسی کنید.", "boolean")],
    verification: ["تنظیمات VPNIPSecConnection با پارامترهای درخواست تطبیق داده شوند؛ SA نامشخص باقی می‌ماند"], rollback: { available: false, notAvailableReasonFa: "حذف دستی اتصال تازه پس از بررسی دستگاه؛ بک‌آپ توصیه می‌شود" }, searchKeywordsFa: ["ساخت تونل", "IKEv2", "IPsec", "VPN سوفوس"]
  })),
  item("sophos", "inventory", "جمع‌آوری کامل وضعیت سوفوس", "Collect Sophos inventory", "system", "generic_security_action", implemented("sophos_inventory", {
    mutates: false,
    descriptionFa: "اینترفیس‌ها، Zoneها، Gatewayها، قوانین فایروال، میزبان‌ها، سرویس‌ها و اتصال‌های VPN را از XML API رسمی SFOS می‌خواند.",
    verification: ["پاسخ API معتبر باشد و تعداد موجودی‌های دریافت‌شده ثبت شود"],
    searchKeywordsFa: ["وضعیت سوفوس", "اطلاعات فایروال سوفوس", "SFOS", "Sophos Firewall"]
  })),
  item("sophos", "enable-interface", "روشن کردن پورت سوفوس", "Enable Sophos interface", "interfaces", "generic_security_action", implemented("sophos_enable_interface", {
    mutates: true, riskLevel: "high", required: [param("interfaceName", "نام پورت", "نام دقیق پورت مانند Port1 را وارد کنید.", "string", "Port1")],
    verification: ["شیء Interface دوباره خوانده شود و InterfaceStatus برابر ON باشد"], rollback: { available: true, steps: ["بازگرداندن InterfaceStatus قبلی که پیش از اجرا ثبت شده است"] }
  })),
  item("sophos", "disable-interface", "خاموش کردن پورت سوفوس", "Disable Sophos interface", "interfaces", "generic_security_action", implemented("sophos_disable_interface", {
    mutates: true, riskLevel: "critical", required: [param("interfaceName", "نام پورت", "نام دقیق پورت را وارد کنید؛ خاموش کردن مسیر مدیریت ممکن است ارتباط را قطع کند.", "string", "Port2")],
    verification: ["شیء Interface دوباره خوانده شود و InterfaceStatus برابر OFF باشد"], rollback: { available: true, steps: ["بازگرداندن InterfaceStatus قبلی که پیش از اجرا ثبت شده است"] }
  })),
  item("sophos", "set-interface-ipv4", "تنظیم IPv4 پورت سوفوس", "Set Sophos interface IPv4", "interfaces", "generic_security_action", implemented("sophos_set_interface_ipv4", {
    mutates: true, riskLevel: "critical", required: [param("interfaceName", "نام پورت", "نام دقیق پورت مانند Port1.", "string", "Port1"), param("ipAddress", "IPv4/CIDR", "آدرس و Prefix مانند 192.168.10.1/24.", "cidr", "192.168.10.1/24")],
    verification: ["آدرس و Netmask جدید از API دوباره خوانده و با درخواست تطبیق داده شود"], rollback: { available: true, steps: ["بازگرداندن IP و Netmask ثبت‌شده پیش از اجرا"] }
  })),
  item("sophos", "enable-firewall-rule", "فعال کردن قانون فایروال سوفوس", "Enable Sophos firewall rule", "firewall", "generic_security_action", implemented("sophos_enable_firewall_rule", {
    mutates: true, riskLevel: "high", required: [param("ruleName", "نام قانون", "نام دقیق قانون موجود در Sophos Firewall.", "string", "Allow-Web")],
    verification: ["قانون دوباره خوانده شود و Status برابر Enable باشد"], rollback: { available: true, steps: ["بازگرداندن Status قبلی قانون"] }
  })),
  item("sophos", "disable-firewall-rule", "غیرفعال کردن قانون فایروال سوفوس", "Disable Sophos firewall rule", "firewall", "generic_security_action", implemented("sophos_disable_firewall_rule", {
    mutates: true, riskLevel: "high", required: [param("ruleName", "نام قانون", "نام دقیق قانون موجود در Sophos Firewall.", "string", "Allow-Web")],
    verification: ["قانون دوباره خوانده شود و Status برابر Disable باشد"], rollback: { available: true, steps: ["بازگرداندن Status قبلی قانون"] }
  })),
  item("esxi", "inventory", "خواندن وضعیت هاست", "Read ESXi host inventory", "system", "generic_security_action", implemented("esxi_inventory", { mutates: false, verification: ["موجودی هاست از API خوانده شود"] })),
  item("esxi", "enter-maintenance", "ورود به حالت نگهداری", "Enter host maintenance mode", "system", "generic_security_action", implemented("esxi_enter_maintenance", { mutates: true, riskLevel: "critical", verification: ["حالت نگهداری هاست مجدداً خوانده شود"] })),
  item("esxi", "exit-maintenance", "خروج از حالت نگهداری", "Exit host maintenance mode", "system", "generic_security_action", implemented("esxi_exit_maintenance", { mutates: true, riskLevel: "high", verification: ["خروج از حالت نگهداری تأیید شود"] })),
  item("esxi", "start-service", "راه‌اندازی سرویس هاست", "Start host service", "system", "generic_security_action", implemented("esxi_start_service", { mutates: true, riskLevel: "high", required: [param("serviceKey", "شناسه سرویس", "کلید دقیق سرویس در فهرست هاست", "string", "ntpd")], verification: ["وضعیت سرویس دوباره خوانده شود"] })),
  item("esxi", "stop-service", "توقف سرویس غیرحیاتی", "Stop noncritical host service", "system", "generic_security_action", implemented("esxi_stop_service", { mutates: true, riskLevel: "critical", required: [param("serviceKey", "شناسه سرویس", "کلید دقیق سرویس غیرحیاتی", "string", "ntpd")], verification: ["وضعیت سرویس دوباره خوانده شود"] })),
  item("esxi", "set-ntp", "تنظیم سرورهای زمان", "Set host NTP servers", "system", "generic_security_action", implemented("esxi_set_ntp", { mutates: true, riskLevel: "high", required: [param("ntpServers", "سرورهای NTP", "یک تا چهار آدرس، جداشده با ویرگول", "string", "time.example.com")], verification: ["سرورهای زمان دوباره خوانده شوند"] })),
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
