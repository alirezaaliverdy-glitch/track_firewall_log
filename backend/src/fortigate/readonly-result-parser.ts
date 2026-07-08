export type FortiGateResultStatus = "safe" | "needs_review" | "critical" | "not_checked" | "not_supported";

export type FortiGateEvidence = { label: string; value: string; source: string };
export type FortiGateFinding = {
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  whyItMatters: string;
  evidence: string;
  recommendedAction: string;
};
export type FortiGateTable = { title: string; columns: string[]; rows: Array<Record<string, string | number | boolean | null>> };
export type FortiGateStructuredResult = {
  summary: string;
  status: FortiGateResultStatus;
  evidence: FortiGateEvidence[];
  findings: FortiGateFinding[];
  tables: FortiGateTable[];
  rawOutputRef: true;
};

type CommandOutput = { template: string; stdout: string; stderr?: string; exitCode?: number | null };
type Block = { name: string; body: string };

const value = (text: string, label: string) => text.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim();
const setting = (text: string, key: string) => text.match(new RegExp(`^\\s*set\\s+${key}\\s+(.+)$`, "im"))?.[1]?.trim().replace(/^"|"$/g, "");
const settings = (text: string, key: string) => setting(text, key)?.match(/"[^"]+"|\S+/g)?.map((item) => item.replace(/^"|"$/g, "")) ?? [];
const blocks = (text: string): Block[] => text.split(/^\s*edit\s+/m).slice(1).map((body) => ({ name: body.match(/^"?([^"\r\n]+)"?/)?.[1]?.trim() ?? "", body })).filter((item) => item.name);
const commandName = (template: string) => template.includes(": ") ? template.slice(template.lastIndexOf(": ") + 2) : template;
const byCommand = (outputs: CommandOutput[], command: string) => outputs.find((item) => commandName(item.template) === command)?.stdout ?? "";
const unavailable = (outputs: CommandOutput[]) => outputs.length > 0 && outputs.every((item) => item.exitCode !== 0 || /unknown command|command fail|not supported/i.test(`${item.stdout}\n${item.stderr ?? ""}`));
const emptyResult = (summary: string, status: FortiGateResultStatus = "not_checked"): FortiGateStructuredResult => ({ summary, status, evidence: [], findings: [], tables: [], rawOutputRef: true });
const finding = (title: string, severity: FortiGateFinding["severity"], whyItMatters: string, evidence: string, recommendedAction: string): FortiGateFinding => ({ title, severity, whyItMatters, evidence, recommendedAction });
const statusFrom = (findings: FortiGateFinding[], hasEvidence = true): FortiGateResultStatus => !hasEvidence ? "not_checked" : findings.some((item) => item.severity === "critical") ? "critical" : findings.some((item) => ["medium", "high"].includes(item.severity)) ? "needs_review" : "safe";

function parseInterfaces(outputs: CommandOutput[]): FortiGateStructuredResult {
  const config = byCommand(outputs, "show system interface");
  const physical = byCommand(outputs, "get system interface physical") || byCommand(outputs, "get system interface");
  const rows = blocks(config).map(({ name, body }) => {
    const allowaccess = settings(body, "allowaccess");
    const ip = setting(body, "ip") ?? "—";
    const role = setting(body, "role") ?? "—";
    const configuredStatus = setting(body, "status") ?? "up";
    const physicalLine = physical.split(/\r?\n/).find((line) => line.includes(`==[${name}]`) || line.trim().startsWith(`${name}:`)) ?? "";
    const link = /\bdown\b/i.test(physicalLine) ? "down" : /\bup\b/i.test(physicalLine) ? "up" : configuredStatus;
    const isPublic = /\bwan\b/i.test(`${name} ${role}`) || /\b(?:public|external)\b/i.test(`${name} ${role}`);
    const exposed = allowaccess.filter((item) => ["http", "https", "ssh", "telnet"].includes(item));
    const risks = [isPublic && exposed.length ? `مدیریت روی WAN: ${exposed.join(", ")}` : "", exposed.includes("http") || exposed.includes("telnet") ? "پروتکل مدیریتی ناامن" : "", ip === "—" ? "بدون IP" : "", link === "down" ? "لینک down" : ""].filter(Boolean);
    return { name, vdom: setting(body, "vdom") ?? "root", ip, mode: setting(body, "mode") ?? "static", allowaccess: allowaccess.join(", ") || "—", type: setting(body, "type") ?? "physical", role, status: link, risk: risks.join("؛ ") || "—", isPublic, exposed };
  });
  const findings: FortiGateFinding[] = [];
  for (const row of rows) {
    if (row.isPublic && row.exposed.length) findings.push(finding(`دسترسی مدیریتی روی ${row.name}`, "high", "سطح مدیریت روی اینترفیس عمومی در معرض دسترسی شبکه قرار می‌گیرد.", row.exposed.join(", "), "allowaccess را به حداقل لازم کاهش دهید و دسترسی را با trusted host محدود کنید."));
    if (/http|telnet/.test(row.allowaccess)) findings.push(finding(`پروتکل ناامن روی ${row.name}`, "high", "HTTP/Telnet محرمانگی نشست مدیریت را تضمین نمی‌کند.", row.allowaccess, "HTTP و Telnet را غیرفعال و HTTPS/SSH محدودشده را استفاده کنید."));
    if (row.status === "down") findings.push(finding(`اینترفیس ${row.name} خاموش است`, "low", "این وضعیت ممکن است عمدی یا نشانه قطع لینک باشد.", row.status, "کاربری اینترفیس و وضعیت لینک فیزیکی را بررسی کنید."));
  }
  return { summary: `${rows.length} اینترفیس بررسی شد؛ ${findings.length} مورد نیازمند توجه است.`, status: statusFrom(findings, rows.length > 0), evidence: [{ label: "تعداد اینترفیس", value: String(rows.length), source: "show system interface" }, { label: "دسترسی مدیریتی نمایان", value: String(rows.filter((row) => row.exposed.length).length), source: "show system interface" }], findings, tables: [{ title: "Interfaces", columns: ["name", "vdom", "ip", "mode", "allowaccess", "type", "role", "status", "risk"], rows: rows.map(({ isPublic: _a, exposed: _b, ...row }) => row) }], rawOutputRef: true };
}

function parseSystem(outputs: CommandOutput[]): FortiGateStructuredResult {
  const status = byCommand(outputs, "get system status");
  const performance = byCommand(outputs, "get system performance status");
  const cpu = performance.match(/CPU states:\s*(\d+)%\s*user/i)?.[1] ?? performance.match(/CPU[^\n]*?(\d+)%/i)?.[1];
  const memory = performance.match(/Memory:\s*(\d+)%/i)?.[1];
  const sessions = performance.match(/sessions?\s*[:=]?\s*(\d+)/i)?.[1];
  const evidence = [
    ["نسخه", value(status, "Version"), "get system status"], ["Build", status.match(/build(\d+)/i)?.[1], "get system status"], ["Hostname", value(status, "Hostname"), "get system status"], ["Serial", value(status, "Serial-Number"), "get system status"], ["License", value(status, "License Status") ?? value(status, "License Status Validation"), "get system status"], ["Operation mode", value(status, "Operation Mode") ?? value(status, "Current HA mode"), "get system status"], ["VDOM", value(status, "Virtual domain configuration"), "get system status"], ["System time", value(status, "System time"), "get system status"], ["Uptime", performance.match(/Uptime:\s*(.+)$/im)?.[1], "get system performance status"], ["CPU", cpu ? `${cpu}%` : undefined, "get system performance status"], ["Memory", memory ? `${memory}%` : undefined, "get system performance status"], ["Sessions", sessions, "get system performance status"]
  ].filter((item): item is string[] => Boolean(item[1])).map(([label, val, source]) => ({ label, value: val, source }));
  const findings: FortiGateFinding[] = [];
  const license = value(status, "License Status") ?? value(status, "License Status Validation");
  if (license && /invalid|expired|unlicensed|not licensed/i.test(license)) findings.push(finding("وضعیت لایسنس نیازمند بررسی است", "medium", "در VM آزمایشگاهی این وضعیت ممکن است برخی به‌روزرسانی‌ها و سرویس‌های FortiGuard را محدود کند، اما به‌تنهایی اثبات خرابی فایروال نیست.", license, "قابلیت‌های FortiGuard، به‌روزرسانی signature و قرارداد پشتیبانی را جداگانه بررسی کنید."));
  if (Number(cpu) >= 90 || Number(memory) >= 90) findings.push(finding("مصرف منابع بحرانی", "critical", "مصرف پایدار بالای منابع می‌تواند پردازش ترافیک را مختل کند.", `CPU ${cpu ?? "?"}% / Memory ${memory ?? "?"}%`, "مصرف لحظه‌ای و روند منابع و پردازش‌های پرمصرف را بررسی کنید."));
  else if (Number(cpu) >= 75 || Number(memory) >= 75) findings.push(finding("مصرف منابع بالا", "medium", "ظرفیت آزاد سیستم کاهش یافته است.", `CPU ${cpu ?? "?"}% / Memory ${memory ?? "?"}%`, "روند مصرف منابع را پایش کنید."));
  return { summary: evidence.length ? `وضعیت ${value(status, "Hostname") ?? "FortiGate"} از خروجی واقعی سیستم استخراج شد.` : "اطلاعات قابل اتکای سیستم دریافت نشد.", status: statusFrom(findings, evidence.length > 0), evidence, findings, tables: [], rawOutputRef: true };
}

function parseRoutingDns(outputs: CommandOutput[]): FortiGateStructuredResult {
  const routing = byCommand(outputs, "get router info routing-table all");
  const dns = `${byCommand(outputs, "get system dns")}\n${byCommand(outputs, "show system dns")}`;
  const routeLines = routing.split(/\r?\n/).filter((line) => /\b(?:0\.0\.0\.0\/0|C\s+\d)/.test(line));
  const defaultLine = routing.split(/\r?\n/).find((line) => /(?:0\.0\.0\.0\/0|\bS\*)/.test(line));
  const route = defaultLine?.match(/via\s+([^,\s]+)(?:,\s*(\S+))?/i);
  const dnsServers = Array.from(dns.matchAll(/^\s*(?:set\s+)?(?:primary|secondary)\s*:?\s*"?(\d+\.\d+\.\d+\.\d+)/gim)).map((item) => item[1]);
  const interfaces = blocks(byCommand(outputs, "show system interface")).map((item) => item.name);
  const findings: FortiGateFinding[] = [];
  if (!defaultLine) findings.push(finding("مسیر پیش‌فرض یافت نشد", "high", "ترافیک مقصدهای ناشناخته مسیر خروجی ندارد.", "0.0.0.0/0 در جدول دیده نشد.", "تنظیمات routing و gateway را بررسی کنید."));
  if (!dnsServers.length) findings.push(finding("DNS تنظیم نشده است", "medium", "نام‌گشایی سرویس‌ها و FortiGuard ممکن است مختل شود.", "primary/secondary DNS یافت نشد.", "حداقل یک DNS معتبر تنظیم و دسترسی آن آزموده شود."));
  if (route?.[2] && interfaces.length && !interfaces.includes(route[2])) findings.push(finding("اینترفیس مسیر پیش‌فرض ناشناخته است", "high", "مسیر ممکن است به اینترفیس حذف‌شده یا نامعتبر اشاره کند.", route[2], "اینترفیس خروجی مسیر را با پیکربندی فعلی تطبیق دهید."));
  return { summary: defaultLine ? `مسیر پیش‌فرض از ${route?.[1] ?? "gateway نامشخص"} روی ${route?.[2] ?? "اینترفیس نامشخص"} ثبت شد.` : "مسیر پیش‌فرض قابل تشخیص نبود.", status: statusFrom(findings, Boolean(routing || dns)), evidence: [{ label: "Default route", value: defaultLine?.trim() ?? "یافت نشد", source: "get router info routing-table all" }, { label: "Gateway", value: route?.[1] ?? "—", source: "get router info routing-table all" }, { label: "Outgoing interface", value: route?.[2] ?? "—", source: "get router info routing-table all" }, { label: "DNS servers", value: dnsServers.join(", ") || "یافت نشد", source: "get/show system dns" }], findings, tables: [{ title: "Routes", columns: ["route"], rows: routeLines.map((line) => ({ route: line.trim() })) }], rawOutputRef: true };
}

function parseAdmins(outputs: CommandOutput[]): FortiGateStructuredResult {
  const adminText = byCommand(outputs, "show system admin");
  const admins = blocks(adminText).map(({ name, body }) => ({ name, profile: setting(body, "accprofile") ?? "—", trusthostConfigured: /^\s*set\s+trusthost\d+/m.test(body) ? "بله" : "خیر" }));
  const interfaceResult = parseInterfaces(outputs);
  const findings = admins.filter((item) => item.trusthostConfigured === "خیر").map((item) => finding(`مدیر ${item.name} بدون trusthost`, item.profile === "super_admin" ? "high" : "medium", "نبود محدودیت مبدا سطح حمله حساب مدیریتی را افزایش می‌دهد.", `profile=${item.profile}`, "trusthost متناسب با شبکه مدیریت تنظیم شود."));
  findings.push(...interfaceResult.findings);
  return { summary: `${admins.length} حساب مدیر بررسی شد؛ مقدار رمز یا کلید در خروجی ساختاریافته نمایش داده نمی‌شود.`, status: statusFrom(findings, admins.length > 0), evidence: [{ label: "تعداد مدیران", value: String(admins.length), source: "show system admin" }, { label: "مدیر دارای trusthost", value: String(admins.filter((item) => item.trusthostConfigured === "بله").length), source: "show system admin" }], findings, tables: [{ title: "Administrators", columns: ["name", "profile", "trusthostConfigured"], rows: admins }, ...interfaceResult.tables], rawOutputRef: true };
}

function parsePolicies(outputs: CommandOutput[]): FortiGateStructuredResult {
  const policies = blocks(byCommand(outputs, "show firewall policy")).map(({ name, body }) => ({ policyid: name, name: setting(body, "name") ?? "—", status: setting(body, "status") ?? "enable", srcintf: settings(body, "srcintf").join(", "), dstintf: settings(body, "dstintf").join(", "), srcaddr: settings(body, "srcaddr").join(", "), dstaddr: settings(body, "dstaddr").join(", "), service: settings(body, "service").join(", "), action: setting(body, "action") ?? "accept", nat: setting(body, "nat") ?? "disable", logtraffic: setting(body, "logtraffic") ?? "disable" }));
  const vips = blocks(byCommand(outputs, "show firewall vip")).map((item) => item.name);
  const addresses = blocks(byCommand(outputs, "show firewall address")).map((item) => item.name);
  const ippools = blocks(byCommand(outputs, "show firewall ippool")).map((item) => item.name);
  const findings = policies.filter((item) => item.status !== "disable" && item.action === "accept" && item.logtraffic === "disable").map((item) => finding(`Logging policy ${item.policyid} غیرفعال است`, "medium", "بدون لاگ، بررسی رخداد و ممیزی ترافیک مجاز دشوار است.", item.name, "logtraffic را مطابق سیاست نگه‌داری لاگ فعال کنید."));
  return { summary: `${policies.length} policy، ${vips.length} VIP و ${ippools.length} IP pool استخراج شد.`, status: statusFrom(findings, Boolean(policies.length || vips.length || addresses.length || ippools.length)), evidence: [{ label: "Policies", value: String(policies.length), source: "show firewall policy" }, { label: "Enabled / Disabled", value: `${policies.filter((p) => p.status !== "disable").length} / ${policies.filter((p) => p.status === "disable").length}`, source: "show firewall policy" }, { label: "VIP / IP Pool", value: `${vips.length} / ${ippools.length}`, source: "show firewall vip / ippool" }], findings, tables: [{ title: "Firewall Policies", columns: ["policyid", "name", "status", "srcintf", "dstintf", "srcaddr", "dstaddr", "service", "action", "nat", "logtraffic"], rows: policies }, { title: "Referenced Objects", columns: ["type", "name"], rows: [...vips.map((name) => ({ type: "VIP", name })), ...addresses.map((name) => ({ type: "Address", name })), ...ippools.map((name) => ({ type: "IP Pool", name }))] }], rawOutputRef: true };
}

function parseVpn(outputs: CommandOutput[]): FortiGateStructuredResult {
  const summary = byCommand(outputs, "get vpn ipsec tunnel summary");
  const tunnelList = byCommand(outputs, "diagnose vpn tunnel list");
  const phase1 = blocks(byCommand(outputs, "show vpn ipsec phase1-interface")).map((item) => item.name);
  const phase2 = blocks(byCommand(outputs, "show vpn ipsec phase2-interface")).map((item) => item.name);
  const sslSettings = byCommand(outputs, "show vpn ssl settings");
  const sslMonitor = byCommand(outputs, "get vpn ssl monitor");
  const tunnels = Array.from(new Set([...phase1, ...Array.from(`${summary}\n${tunnelList}`.matchAll(/(?:name|name=)\s*[:=]?\s*"?([^,\s"]+)/gi)).map((m) => m[1])])).map((name) => ({ name, status: new RegExp(`${name}[^\n]*(?:up|established)`, "i").test(`${summary}\n${tunnelList}`) ? "up" : "down/unknown", phase1: phase1.includes(name) ? "yes" : "unknown", phase2: phase2.some((p) => p === name || p.includes(name)) ? "yes" : "unknown" }));
  const sslEnabled = Boolean(sslSettings.trim()) && !/set\s+status\s+disable/i.test(sslSettings);
  const activeUsers = Number(sslMonitor.match(/(?:users?|user count)\s*[:=]\s*(\d+)/i)?.[1] ?? 0);
  const findings = tunnels.filter((item) => item.status !== "up").map((item) => finding(`تونل ${item.name} فعال دیده نشد`, "medium", "تونل پیکربندی شده ممکن است قطع یا بدون ترافیک باشد.", item.status, "وضعیت peer، route و phase1/phase2 را بررسی کنید."));
  if (sslEnabled && !/(?:source-interface|source-address|user-group|set groups|servercert)/i.test(sslSettings)) findings.push(finding("شواهد محدودسازی SSL-VPN کافی نیست", "medium", "پیکربندی فعال بدون شواهد گروه کاربری یا گواهی نیازمند بازبینی است.", "SSL-VPN settings present", "گروه مجاز، گواهی و محدودیت مبدا را بررسی کنید."));
  const hasEvidence = Boolean(summary || tunnelList || phase1.length || phase2.length || sslSettings || sslMonitor);
  return { summary: hasEvidence ? `${tunnels.length} تونل IPsec و ${activeUsers} کاربر فعال SSL-VPN مشاهده شد.` : "شواهد کافی برای وضعیت VPN دریافت نشد.", status: statusFrom(findings, hasEvidence), evidence: [{ label: "IPsec configured", value: String(tunnels.length), source: "IPsec summary/config" }, { label: "IPsec up", value: String(tunnels.filter((t) => t.status === "up").length), source: "IPsec summary/diagnose" }, { label: "SSL-VPN", value: sslSettings ? (sslEnabled ? "enabled/configured" : "disabled") : "not_checked", source: "show vpn ssl settings" }, { label: "Active SSL users", value: sslMonitor ? String(activeUsers) : "not_checked", source: "get vpn ssl monitor" }], findings, tables: [{ title: "VPN Tunnels", columns: ["name", "status", "phase1", "phase2"], rows: tunnels }], rawOutputRef: true };
}

function parseHaVdomZone(outputs: CommandOutput[]): FortiGateStructuredResult {
  const ha = `${byCommand(outputs, "get system ha status")}\n${byCommand(outputs, "show system ha")}`;
  const vdoms = blocks(byCommand(outputs, "show system vdom")).map((item) => item.name);
  const zones = blocks(byCommand(outputs, "show system zone")).map(({ name, body }) => ({ name, members: settings(body, "interface").join(", ") || "—" }));
  const mode = value(ha, "Mode") ?? setting(ha, "mode") ?? (/standalone/i.test(ha) ? "standalone" : "unknown");
  const evidence: FortiGateEvidence[] = [{ label: "HA mode", value: mode, source: "get/show system ha" }, { label: "HA group", value: value(ha, "Group") ?? setting(ha, "group-name") ?? setting(ha, "group-id") ?? "—", source: "get/show system ha" }, { label: "Sync status", value: value(ha, "Configuration Status") ?? (/(?:in-sync|synchronized)/i.test(ha) ? "in-sync" : "not_checked"), source: "get system ha status" }, { label: "VDOMs", value: vdoms.join(", ") || "not_checked", source: "show system vdom" }, { label: "Zones", value: String(zones.length), source: "show system zone" }];
  const findings: FortiGateFinding[] = [];
  if (mode !== "standalone" && /out.of.sync|not synchronized/i.test(ha)) findings.push(finding("HA همگام نیست", "high", "اختلاف پیکربندی بین اعضا ریسک failover را بالا می‌برد.", "out-of-sync", "علت اختلاف و وضعیت heartbeat را بررسی کنید."));
  return { summary: mode === "standalone" ? "دستگاه در حالت standalone است؛ این وضعیت به‌تنهایی ریسک امنیتی نیست." : `حالت HA: ${mode}؛ ${vdoms.length} VDOM و ${zones.length} zone ثبت شد.`, status: statusFrom(findings, Boolean(ha || vdoms.length || zones.length)), evidence, findings, tables: [{ title: "VDOMs", columns: ["name"], rows: vdoms.map((name) => ({ name })) }, { title: "Zones", columns: ["name", "members"], rows: zones }], rawOutputRef: true };
}

export function parseFortiGateReadOnlyResult(actionType: string, outputs: CommandOutput[]): FortiGateStructuredResult {
  if (unavailable(outputs)) return emptyResult("دستور در این نسخه یا سطح دسترسی FortiOS پشتیبانی نشد.", "not_supported");
  if (actionType === "fortigate_show_system_status" || actionType === "fortigate_license_status") return parseSystem(outputs);
  if (actionType === "fortigate_show_interfaces") return parseInterfaces(outputs);
  if (actionType === "fortigate_show_routing_dns" || actionType === "fortigate_route_dns_check") return parseRoutingDns(outputs);
  if (actionType === "fortigate_show_admin_access" || actionType === "fortigate_admin_users") return parseAdmins(outputs);
  if (actionType === "fortigate_show_firewall_policies") return parsePolicies(outputs);
  if (actionType === "fortigate_show_vpn_status") return parseVpn(outputs);
  if (actionType === "fortigate_show_ha_vdom_zone") return parseHaVdomZone(outputs);
  return emptyResult("برای این ActionPlan پارسر ساختاریافته FortiGate ثبت نشده است.", "not_checked");
}

export const fortiGateParsers = { parseSystem, parseInterfaces, parseRoutingDns, parseAdmins, parsePolicies, parseVpn, parseHaVdomZone };

export function buildFortiGateDailyCheck(deviceId: string, outputs: CommandOutput[]) {
  const system = parseSystem(outputs);
  const interfaces = parseInterfaces(outputs);
  const routing = parseRoutingDns(outputs);
  const policies = parsePolicies(outputs);
  const vpn = parseVpn(outputs);
  const ha = parseHaVdomZone(outputs);
  const admins = parseAdmins(outputs);
  const licenseFinding = system.findings.filter((item) => /لایسنس|FortiGuard/i.test(`${item.title} ${item.whyItMatters}`));
  const licenseEvidence = system.evidence.filter((item) => /License/i.test(item.label));
  const license: FortiGateStructuredResult = { summary: licenseEvidence.length ? `وضعیت لایسنس: ${licenseEvidence[0].value}` : "شواهد لایسنس و FortiGuard کافی نیست.", status: statusFrom(licenseFinding, licenseEvidence.length > 0), evidence: licenseEvidence, findings: licenseFinding, tables: [], rawOutputRef: true };
  const section = (key: string, titleFa: string, result: FortiGateStructuredResult) => ({ key, titleFa, status: result.status, severity: result.status, summaryFa: result.summary, items: [], evidence: result.evidence.map((item) => `${item.label}: ${item.value}`), suggestedActions: result.findings.map((item) => item.recommendedAction), findings: result.findings, tables: result.tables });
  const sections = [section("system_health", "سلامت سیستم", system), section("license", "وضعیت لایسنس و FortiGuard", license), section("interfaces", "اینترفیس‌ها و دسترسی مدیریتی", interfaces), section("route_dns", "مسیر و DNS", routing), section("policy_nat_vip", "سیاست‌ها / NAT / VIP", policies), section("vpn", "شبکه خصوصی (VPN)", vpn), section("ha_vdom_zone", "افزونگی / VDOM / Zone", ha), section("admin_security", "امنیت مدیران (Admin Security)", admins)];
  const overallStatus: FortiGateResultStatus = sections.some((item) => item.status === "critical") ? "critical" : sections.some((item) => item.status === "needs_review") ? "needs_review" : sections.every((item) => item.status === "not_supported") ? "not_supported" : sections.some((item) => item.status === "safe") ? "safe" : "not_checked";
  return { deviceId, vendor: "fortigate", status: overallStatus, overallStatus, summary: overallStatus === "safe" ? "چک روزانه FortiGate بدون یافته مهم تکمیل شد." : "چک روزانه FortiGate بر پایه خروجی واقعی و شواهد ساختاریافته تکمیل شد.", summaryFa: overallStatus === "safe" ? "چک روزانه FortiGate بدون یافته مهم تکمیل شد." : "چک روزانه FortiGate بر پایه خروجی واقعی و شواهد ساختاریافته تکمیل شد.", evidence: sections.flatMap((item) => item.evidence), findings: sections.flatMap((item) => item.findings), tables: sections.flatMap((item) => item.tables), rawOutputRef: true, recommendationsFa: sections.flatMap((item) => item.suggestedActions), commands: outputs.map((item) => item.template), confidence: sections.some((item) => item.status === "not_checked") ? 0.7 : 0.95, score: Math.round(sections.reduce((sum, item) => sum + (item.status === "safe" ? 100 : item.status === "needs_review" ? 60 : item.status === "not_checked" ? 50 : item.status === "not_supported" ? 50 : 20), 0) / sections.length), sections, rawOutputs: outputs, executedTemplates: outputs.map((item) => item.template), manualSections: [], unsupportedSections: sections.filter((item) => item.status === "not_supported").map((item) => item.key) };
}
