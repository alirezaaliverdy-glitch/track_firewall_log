import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import puppeteer from "puppeteer-core";
import type { Device } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { assessReportDevice, reportActionTitle, reportCategory, reportPercentage, type ReportLiveData } from "./company-status-assessment.js";
import { collectLinuxServerOverview } from "../telemetry/linux/linux-telemetry.service.js";
import { renderReadableReportHtml } from "./company-status-report.template.js";
import type { PublicUser } from "../services/auth.service.js";
import type { CompanyStatusEquipment, CompanyStatusReport, ReportEquipmentCategory, ReportEquipmentState } from "./company-status-report.types.js";

export class CompanyReportError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) { super(code); }
}

type DeviceData = Device & {
  asset: null | { name: string; managementIp: string | null; healthState: string; metadataJson: unknown; vendor: null | { name: string }; platform: null | { name: string }; role: null | { name: string } };
  statusChecks: Array<{ status: string; message: string | null; checkedAt: Date }>;
  healthSnapshots: Array<{ state: string; summary: string; metricsJson: unknown; collectedAt: Date }>;
  deviceSnapshots: Array<{ dataJson: unknown; collectedAt: Date; snapshotType: string }>;
};

type Live = ReportLiveData;
const tehran = "Asia/Tehran";
const maxReportEquipment = 250;
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, fallback = "داده موجود نیست") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const limitText = (value: unknown, max = 240) => Array.from(clean(value, ""), (char) => char.charCodeAt(0) < 32 ? " " : char).join("").slice(0, max);
const withTimeout = async <T>(promise: Promise<T>, ms = 20_000) => { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race<T>([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("REPORT_COLLECTION_TIMEOUT")), ms); })]); } finally { clearTimeout(timer); } };

function categoryOf(device: DeviceData): ReportEquipmentCategory { return reportCategory(device); }

async function liveStatus(device: DeviceData): Promise<Live> {
  if (!device.credentialId && !device.credentialRef) return null;
  try {
    if (categoryOf(device) === "server" && !/esxi|vmware/i.test(device.vendor)) {
      const linux = await withTimeout(collectLinuxServerOverview(device.id));
      return { collectedAt: linux.collectedAt, linux };
    }
    const connector = selectDeviceConnector(device);
    if (!connector) return null;
    const collected = await withTimeout(connector.collectStatus(device));
    return { collectedAt: new Date().toISOString(), connector: collected };
  } catch (error) { return { collectedAt: new Date().toISOString(), collectionError: error instanceof Error ? limitText(error.message, 220) : "REPORT_COLLECTION_FAILED" }; }
}


function snapshotMetric(device: DeviceData, key: "cpu" | "disk") {
  const metrics = obj(device.healthSnapshots[0]?.metricsJson), nested = obj(metrics[key]);
  const values = key === "cpu" ? [nested.usagePercent, nested.usage_percent, metrics.cpuPercent, metrics.cpu_usage_percent] : [nested.usagePercent, nested.usage_percent, metrics.diskPercent, metrics.disk_usage_percent];
  return values.map(num).find((value) => value !== null) ?? null;
}

function normalizedVendorFields(device: DeviceData, live: Live) {
  const result: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: unknown) => { if (value !== undefined && value !== null && String(value).trim()) result.push({ label, value: String(value).trim() }); };
  const c = live?.connector;
  if (live?.linux) { add("RAM", live.linux.memory.usedPercent === null ? null : `${live.linux.memory.usedPercent}%`); add("سیستم‌عامل", live.linux.host.os); add("Uptime", live.linux.host.uptime); add("Kernel", live.linux.host.kernel); }
  if (c?.fortigate) { add("Session", c.fortigate.sessionCount); add("Policy", c.fortigate.policies.length); add("FortiOS", c.fortigate.version); add("License", c.fortigate.licenseStatus); add("Serial", c.fortigate.serial); }
  if (c?.mikrotik) { add("اینترفیس", c.mikrotik.interfaces.length); add("RouterOS", c.mikrotik.routerosVersion); add("Uptime", c.mikrotik.uptime); add("CPU Load", c.mikrotik.cpuLoad); add("Architecture", c.mikrotik.architecture); }
  if (c?.sophos) { add("API Version", c.sophos.apiVersion); add("Interface", c.sophos.interfaces.length); add("Firewall Rule", c.sophos.firewallRules.length); add("VPN", c.sophos.vpnConnections.length); }
  if (c?.esxi) { add("ESXi", c.esxi.version); add("مدل", c.esxi.model); add("VM", c.esxi.vmCount); add("Datastore", c.esxi.datastoreCount); add("CPU", c.esxi.cpuPercent === null ? null : `${c.esxi.cpuPercent}%`); add("Lockdown", c.esxi.lockdownMode); }
  if (device.vendor === "cisco") { add("سامانه", c?.os ?? device.asset?.platform?.name); }
  // Diagnostic codes and retry flags are not vendor inventory or useful managerial facts.
  return result.slice(0, 6);
}

function modelOf(device: DeviceData, live: Live) {
  if (live?.connector?.fortigate?.model) return live.connector.fortigate.model;
  if (live?.connector?.mikrotik?.architecture) return `RouterOS / ${live.connector.mikrotik.architecture}`;
  if (live?.connector?.sophos?.product) return live.connector.sophos.product;
  if (live?.connector?.esxi?.model) return `${live.connector.esxi.model} / ESXi ${live.connector.esxi.version}`;
  const metadata = obj(device.asset?.metadataJson);
  return clean(metadata.model ?? metadata.product ?? device.asset?.platform?.name ?? live?.connector?.os);
}


function normalizeDevice(device: DeviceData, live: Live): CompanyStatusEquipment {
  const kind = categoryOf(device), storedAt = device.deviceSnapshots[0]?.collectedAt ?? device.healthSnapshots[0]?.collectedAt ?? device.statusChecks[0]?.checkedAt ?? null;
  const disk = live?.linux?.disks.map((item) => item.usedPercent).filter((value): value is number => value !== null).sort((a, b) => b - a)[0] ?? null;
  const assessment = assessReportDevice(device, live);
  const fresh = Boolean(live?.linux || live?.connector);
  const cpu = live?.linux ? live.linux.cpu.usagePercent : live?.connector?.fortigate?.cpuUsage ?? live?.connector?.mikrotik?.cpuLoad ?? live?.connector?.esxi?.cpuPercent;
  return {
    id: device.id, name: clean(device.asset?.name ?? device.name), host: clean(device.asset?.managementIp ?? device.host), vendor: clean(device.asset?.vendor?.name ?? device.vendor, "Generic"), model: modelOf(device, live),
    category: kind, ...assessment, description: assessment.statusReason, physicalLocation: "", vendorFields: normalizedVendorFields(device, live),
    cpuPercent: fresh ? reportPercentage(cpu) : reportPercentage(snapshotMetric(device, "cpu")),
    diskPercent: kind === "server" ? (fresh ? disk : snapshotMetric(device, "disk")) : null,
    collectedAt: fresh ? live!.collectedAt : storedAt?.toISOString() ?? null, source: fresh ? "live" : storedAt ? "snapshot" : "inventory"
  };
}

export async function buildCompanyStatusReport(companyId: string, user: PublicUser, refresh = true): Promise<CompanyStatusReport> {
  const company = await prisma.company.findFirst({ where: { id: companyId, ownerId: user.scopeOwnerId ?? user.id, deletedAt: null } });
  if (!company) throw new CompanyReportError("COMPANY_NOT_FOUND", 404);
  const devices = await prisma.device.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: "asc" }, include: {
    asset: { select: { name: true, managementIp: true, healthState: true, metadataJson: true, vendor: { select: { name: true } }, platform: { select: { name: true } }, role: { select: { name: true } } } },
    statusChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { status: true, message: true, checkedAt: true } },
    healthSnapshots: { orderBy: { collectedAt: "desc" }, take: 1, select: { state: true, summary: true, metricsJson: true, collectedAt: true } },
    deviceSnapshots: { orderBy: { collectedAt: "desc" }, take: 1, select: { dataJson: true, collectedAt: true, snapshotType: true } }
  } }) as DeviceData[];
  if (devices.length > maxReportEquipment) throw new CompanyReportError("REPORT_EQUIPMENT_LIMIT_EXCEEDED", 400);
  const live = refresh ? await Promise.all(devices.map(liveStatus)) : devices.map(() => null);
  const equipment = devices.map((device, index) => normalizeDevice(device, live[index]));
  const count = (state: ReportEquipmentState) => equipment.filter((item) => item.status === state).length;
  const active = count("active"), limited = count("limited"), inactive = count("inactive");
  const actions = devices.length ? await prisma.actionPlan.findMany({ where: { deviceId: { in: devices.map(item => item.id) }, status: "succeeded" }, orderBy: { updatedAt: "desc" }, take: 12, select: { parametersJson: true, resultJson: true, updatedAt: true, device: { select: { name: true } } } }) : [];
  const now = new Date(), parts = (locale: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: tehran }).format(now);
  return { schemaVersion: 1, generatedAt: now.toISOString(), reportDateFa: parts("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }), reportDateGregorian: parts("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }), reportTime: parts("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }), timezone: tehran,
    reportNumber: `${company.code}-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`, preparedBy: user.displayName, company: { id: company.id, name: company.name, code: company.code },
    summary: { total: equipment.length, active, limited, inactive, healthScore: equipment.length ? Math.round(active / equipment.length * 100) : 0 }, equipment,
    completedActions: actions.filter(item => obj(item.resultJson).connectorInvoked === true && obj(item.resultJson).executed === true).slice(0, 4).map(item => `${reportActionTitle(clean(obj(obj(item.parametersJson).metadata).catalogTitleFa, "عملیات تأییدشده"))} · ${item.device?.name ?? "تجهیز"} · ${item.updatedAt.toLocaleString("fa-IR", { timeZone: tehran })}`), futureActions: equipment.filter(item => item.status !== "active").slice(0, 4).map(item => `${item.name}: ${item.recommendation}`), additionalNotes: "", responsibleName: user.displayName };
}

export function sanitizeCompanyStatusReport(input: CompanyStatusReport, companyId: string): CompanyStatusReport {
  if (!input || input.schemaVersion !== 1 || input.company?.id !== companyId || !Array.isArray(input.equipment)) throw new CompanyReportError("INVALID_REPORT", 400);
  if (input.equipment.length > maxReportEquipment) throw new CompanyReportError("REPORT_EQUIPMENT_LIMIT_EXCEEDED", 400);
  const status = new Set(["active", "limited", "inactive"]), category = new Set(["server", "firewall", "switch", "router", "other"]);
  const equipment = input.equipment.map((item) => ({ ...item, id: limitText(item.id, 80), name: limitText(item.name, 90), host: limitText(item.host, 120), vendor: limitText(item.vendor, 70), model: limitText(item.model, 100), description: limitText(item.description, 300), physicalLocation: limitText(item.physicalLocation, 120), statusReason: limitText(item.statusReason, 450), recommendation: limitText(item.recommendation, 650), technicalDetails: limitText(item.technicalDetails, 450), connectionState: (["online", "offline", "unknown", "auth_failed"] as const).includes(item.connectionState!) ? item.connectionState : "unknown" as const, category: (category.has(item.category) ? item.category : "other") as ReportEquipmentCategory, status: (status.has(item.status) ? item.status : "limited") as ReportEquipmentState, cpuPercent: item.cpuPercent !== null && num(item.cpuPercent) !== null && item.cpuPercent >= 0 && item.cpuPercent <= 100 ? num(item.cpuPercent) : null, diskPercent: item.diskPercent !== null && num(item.diskPercent) !== null && item.diskPercent >= 0 && item.diskPercent <= 100 ? num(item.diskPercent) : null, collectedAt: item.collectedAt ? limitText(item.collectedAt, 40) : null, source: (["live", "snapshot", "inventory"] as const).includes(item.source) ? item.source : "inventory" as const, vendorFields: (item.vendorFields ?? []).slice(0, 8).map((field) => ({ label: limitText(field.label, 50), value: limitText(field.value, 100) })) }));
  const active = equipment.filter((item) => item.status === "active").length, limited = equipment.filter((item) => item.status === "limited").length, inactive = equipment.filter((item) => item.status === "inactive").length;
  return { ...input, generatedAt: limitText(input.generatedAt, 40), reportDateFa: limitText(input.reportDateFa, 30), reportDateGregorian: limitText(input.reportDateGregorian, 30), reportTime: limitText(input.reportTime, 20), timezone: tehran, reportNumber: limitText(input.reportNumber, 60), preparedBy: limitText(input.preparedBy, 80), company: { id: companyId, name: limitText(input.company.name, 100), code: limitText(input.company.code, 50) }, summary: { total: equipment.length, active, limited, inactive, healthScore: equipment.length ? Math.round(active / equipment.length * 100) : 0 }, equipment, completedActions: (input.completedActions ?? []).slice(0, 8).map((item) => limitText(item, 180)), futureActions: (input.futureActions ?? []).slice(0, 8).map((item) => limitText(item, 650)), additionalNotes: limitText(input.additionalNotes, 600), responsibleName: limitText(input.responsibleName, 80) };
}


const stateFa = { active: "بدون هشدار گزارش‌شده", limited: "نیازمند بررسی", inactive: "قطع کانال مدیریتی" } as const;
const categoryFa: Record<ReportEquipmentCategory, string> = { server: "سرور", firewall: "فایروال", switch: "سوئیچ", router: "روتر", other: "سایر" };
async function embeddedFont() {
  try { return (await fs.readFile(path.join(process.cwd(), "assets", "iranyekanwebregularfanum.ttf"))).toString("base64"); }
  catch { return ""; }
}

export async function renderCompanyReportHtml(report: CompanyStatusReport) {
  return renderReadableReportHtml(report, await embeddedFont());
}
export async function renderCompanyReportPdf(report: CompanyStatusReport) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent(await renderCompanyReportHtml(report), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  }
  finally { await browser.close(); }
}

export async function renderCompanyReportXlsx(report: CompanyStatusReport) {
  const book = new ExcelJS.Workbook(); book.creator = "Firewall SOAR"; book.created = new Date(report.generatedAt);
  const summary = book.addWorksheet("خلاصه مدیریتی", { views: [{ rightToLeft: true }] }); summary.columns = Array.from({ length: 6 }, () => ({ width: 24 }));
  summary.mergeCells("A1:F2"); summary.getCell("A1").value = `گزارش وضعیت تجهیزات - ${report.company.name}`;
  summary.getCell("A1").font = { name: "IRANYekan", bold: true, size: 20, color: { argb: "FF183454" } };
  summary.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF3F8" } };
  summary.addRow([]);
  summary.addRow(["تاریخ شمسی", report.reportDateFa, "تاریخ میلادی", report.reportDateGregorian, "ساعت تهران", report.reportTime]);
  summary.addRow(["شماره گزارش", report.reportNumber, "تهیه‌کننده", report.preparedBy, "تجهیزات بدون هشدار %", report.summary.healthScore]);
  summary.addRow(["کل تجهیزات", report.summary.total, "بدون هشدار", report.summary.active, "بررسی / قطع کانال", `${report.summary.limited} / ${report.summary.inactive}`]);
  const explain=summary.addRow(["نیازمند بررسی (محدود سابق): هشدار سلامت، دادهٔ ناقص یا وضعیت نامشخص؛ به معنی نداشتن مجوز نیست."]);
  summary.mergeCells(explain.number, 1, explain.number, 6); explain.height=44;
  summary.addRow(["وندور", "تعداد", "بدون هشدار", "نیازمند بررسی", "قطع کانال", "گروه‌ها"]);
  [...new Set(report.equipment.map(item=>item.vendor))].forEach(vendor=>{
    const rows=report.equipment.filter(item=>item.vendor===vendor);
    summary.addRow([vendor,rows.length,rows.filter(item=>item.status==="active").length,rows.filter(item=>item.status==="limited").length,rows.filter(item=>item.status==="inactive").length,[...new Set(rows.map(item=>categoryFa[item.category]))].join("، ")]);
  });
  for (const [heading, values] of [["اقدامات اجراشدهٔ تأییدشده", report.completedActions], ["پیگیری‌های بعدی", report.futureActions]] as const) {
    const header=summary.addRow([heading]); summary.mergeCells(header.number,1,header.number,6); header.font={name:"IRANYekan",size:14,bold:true};
    for(const value of values.length ? values : ["مورد تأییدشده‌ای ثبت نشده است"]) { const row=summary.addRow([value]); summary.mergeCells(row.number,1,row.number,6); row.height=55; }
  }
  if(report.additionalNotes){const row=summary.addRow(["یادداشت مسئول: "+report.additionalNotes]);summary.mergeCells(row.number,1,row.number,6);row.height=70;}
  summary.eachRow(row=>{row.alignment={vertical:"middle",horizontal:"right",wrapText:true};row.height=Math.max(row.height ?? 0,28);row.eachCell(cell=>{cell.font={name:"IRANYekan",size:13,...cell.font};});});
  const details=book.addWorksheet("تجهیزات", { views: [{rightToLeft:true,state:"frozen",ySplit:1}] });
  details.columns=[
    {header:"نام تجهیز",key:"name",width:24},{header:"گروه",key:"category",width:14},{header:"وندور",key:"vendor",width:18},{header:"مدل / پلتفرم",key:"model",width:26},
    {header:"IP / نام میزبان",key:"host",width:22},{header:"وضعیت",key:"status",width:26},{header:"اتصال",key:"connection",width:16},
    {header:"علت وضعیت",key:"reason",width:52},{header:"قدم بعدی / راهنمای رفع",key:"action",width:65},
    {header:"CPU %",key:"cpu",width:12},{header:"Disk %",key:"disk",width:12},{header:"محل فیزیکی",key:"location",width:22},
    {header:"اطلاعات وندور",key:"vendorData",width:50},{header:"توضیحات مسئول",key:"description",width:44},
    {header:"زمان داده (تهران)",key:"collected",width:30},{header:"منبع داده",key:"source",width:28},{header:"جزئیات فنی",key:"technical",width:52}
  ];
  report.equipment.forEach(item=>details.addRow({
    name:item.name,category:categoryFa[item.category],vendor:item.vendor,model:item.model,host:item.host,status:stateFa[item.status],
    connection:item.connectionState==="online"?"برقرار":item.connectionState==="offline"?"قطع":item.connectionState==="auth_failed"?"ورود رد شد":"تأیید نشده",
    reason:item.statusReason || item.description,action:item.recommendation || "نمای کلی و سنسورها را بررسی و جمع‌آوری تازه اجرا کنید.",
    cpu:item.cpuPercent,disk:item.diskPercent,location:item.physicalLocation,
    vendorData:item.vendorFields.map(field=>`${field.label}: ${field.value}`).join(" | "),description:item.description,
    collected:item.collectedAt && Number.isFinite(Date.parse(item.collectedAt))?new Date(item.collectedAt).toLocaleString("fa-IR",{timeZone:tehran}):"زمان نامشخص",
    source:item.source==="live"?"جمع‌آوری زنده":item.source==="snapshot"?"نمونهٔ ذخیره‌شده؛ نه تست زنده":"فقط موجودی",
    technical:item.technicalDetails ?? ""
  }));
  details.eachRow((row,index)=>{row.height=index===1?38:100;row.alignment={vertical:"top",horizontal:"right",wrapText:true};row.eachCell(cell=>{cell.font={name:"IRANYekan",size:13};if(index===1){cell.font={...cell.font,bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF304D68"}};}else if(index%2===0)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF4F7FA"}};});});
  details.autoFilter={from:"A1",to:`Q${Math.max(1,details.rowCount)}`};
  return Buffer.from(await book.xlsx.writeBuffer());
}
