import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import puppeteer from "puppeteer-core";
import type { Device } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import type { DeviceConnectionTestResult } from "../connectors/types.js";
import { collectLinuxServerOverview } from "../telemetry/linux/linux-telemetry.service.js";
import type { LinuxServerOverview } from "../telemetry/linux/linux-telemetry.types.js";
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

type Live = { collectedAt: string; connector?: DeviceConnectionTestResult; linux?: LinuxServerOverview } | null;
const tehran = "Asia/Tehran";
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, fallback = "داده موجود نیست") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const limitText = (value: unknown, max = 240) => Array.from(clean(value, ""), (char) => char.charCodeAt(0) < 32 ? " " : char).join("").slice(0, max);
const withTimeout = <T>(promise: Promise<T>, ms = 20_000) => Promise.race<T>([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("REPORT_COLLECTION_TIMEOUT")), ms))]);

function categoryOf(device: DeviceData): ReportEquipmentCategory {
  const raw = `${device.type} ${device.vendor} ${device.asset?.role?.name ?? ""} ${device.asset?.platform?.name ?? ""}`.toLowerCase();
  if (/linux|server/.test(raw)) return "server";
  if (/forti|sophos|firewall|pfsense/.test(raw)) return "firewall";
  if (/switch/.test(raw)) return "switch";
  if (/router|mikrotik/.test(raw)) return "router";
  if (/cisco/.test(raw)) return "switch";
  return "other";
}

async function liveStatus(device: DeviceData): Promise<Live> {
  if (!device.credentialId && !device.credentialRef) return null;
  try {
    if (categoryOf(device) === "server") {
      const linux = await withTimeout(collectLinuxServerOverview(device.id));
      return { collectedAt: linux.collectedAt, linux };
    }
    const connector = selectDeviceConnector(device);
    if (!connector) return null;
    return { collectedAt: new Date().toISOString(), connector: await withTimeout(connector.collectStatus(device)) };
  } catch { return null; }
}

function statusOf(device: DeviceData, live: Live): ReportEquipmentState {
  if (live?.linux) return live.linux.health.status === "healthy" ? "active" : live.linux.health.status === "warning" ? "limited" : "inactive";
  if (live?.connector) return live.connector.connected ? (live.connector.warnings.length ? "limited" : "active") : "inactive";
  const value = device.statusChecks[0]?.status ?? device.asset?.healthState ?? device.status;
  if (["online", "healthy", "active"].includes(value)) return "active";
  if (["offline", "critical", "inactive", "error"].includes(value)) return "inactive";
  return "limited";
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
  if (live?.linux) { add("سیستم‌عامل", live.linux.host.os); add("Kernel", live.linux.host.kernel); add("Uptime", live.linux.host.uptime); add("RAM", live.linux.memory.usedPercent === null ? null : `${live.linux.memory.usedPercent}%`); }
  if (c?.fortigate) { add("FortiOS", c.fortigate.version); add("Serial", c.fortigate.serial); add("License", c.fortigate.licenseStatus); add("Session", c.fortigate.sessionCount); add("Policy", c.fortigate.policies.length); }
  if (c?.mikrotik) { add("RouterOS", c.mikrotik.routerosVersion); add("Architecture", c.mikrotik.architecture); add("Uptime", c.mikrotik.uptime); add("CPU Load", c.mikrotik.cpuLoad); add("Interface", c.mikrotik.interfaces.length); }
  if (c?.sophos) { add("API Version", c.sophos.apiVersion); add("Interface", c.sophos.interfaces.length); add("Firewall Rule", c.sophos.firewallRules.length); add("VPN", c.sophos.vpnConnections.length); }
  if (c?.diagnostic) Object.entries(c.diagnostic).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 5).forEach(([key, value]) => add(key, value));
  return result.slice(0, 6);
}

function modelOf(device: DeviceData, live: Live) {
  if (live?.connector?.fortigate?.model) return live.connector.fortigate.model;
  if (live?.connector?.mikrotik?.architecture) return `RouterOS / ${live.connector.mikrotik.architecture}`;
  if (live?.connector?.sophos?.product) return live.connector.sophos.product;
  const metadata = obj(device.asset?.metadataJson);
  return clean(metadata.model ?? metadata.product ?? device.asset?.platform?.name ?? live?.connector?.os);
}

function descriptionOf(device: DeviceData, live: Live) {
  if (live?.linux) return live.linux.health.summary;
  if (live?.connector?.message) return live.connector.message;
  return clean(device.statusChecks[0]?.message ?? device.healthSnapshots[0]?.summary);
}

function normalizeDevice(device: DeviceData, live: Live): CompanyStatusEquipment {
  const kind = categoryOf(device), storedAt = device.deviceSnapshots[0]?.collectedAt ?? device.healthSnapshots[0]?.collectedAt ?? device.statusChecks[0]?.checkedAt ?? null;
  const disk = live?.linux?.disks.map((item) => item.usedPercent).filter((value): value is number => value !== null).sort((a, b) => b - a)[0] ?? null;
  return {
    id: device.id, name: clean(device.asset?.name ?? device.name), host: clean(device.asset?.managementIp ?? device.host), vendor: clean(device.asset?.vendor?.name ?? device.vendor, "Generic"), model: modelOf(device, live),
    category: kind, status: statusOf(device, live), description: descriptionOf(device, live), physicalLocation: "", vendorFields: normalizedVendorFields(device, live),
    cpuPercent: kind === "server" ? (live?.linux?.cpu.usagePercent ?? snapshotMetric(device, "cpu")) : null,
    diskPercent: kind === "server" ? (disk ?? snapshotMetric(device, "disk")) : null,
    collectedAt: live?.collectedAt ?? storedAt?.toISOString() ?? null, source: live ? "live" : storedAt ? "snapshot" : "inventory"
  };
}

export async function buildCompanyStatusReport(companyId: string, user: PublicUser, refresh = true): Promise<CompanyStatusReport> {
  const company = await prisma.company.findFirst({ where: { id: companyId, ownerId: user.id, deletedAt: null } });
  if (!company) throw new CompanyReportError("COMPANY_NOT_FOUND", 404);
  const devices = await prisma.device.findMany({ where: { companyId, deletedAt: null }, orderBy: { name: "asc" }, include: {
    asset: { select: { name: true, managementIp: true, healthState: true, metadataJson: true, vendor: { select: { name: true } }, platform: { select: { name: true } }, role: { select: { name: true } } } },
    statusChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { status: true, message: true, checkedAt: true } },
    healthSnapshots: { orderBy: { collectedAt: "desc" }, take: 1, select: { state: true, summary: true, metricsJson: true, collectedAt: true } },
    deviceSnapshots: { orderBy: { collectedAt: "desc" }, take: 1, select: { dataJson: true, collectedAt: true, snapshotType: true } }
  } }) as DeviceData[];
  const live = refresh ? await Promise.all(devices.map(liveStatus)) : devices.map(() => null);
  const equipment = devices.map((device, index) => normalizeDevice(device, live[index]));
  const count = (state: ReportEquipmentState) => equipment.filter((item) => item.status === state).length;
  const active = count("active"), limited = count("limited"), inactive = count("inactive");
  const actions = devices.length ? await prisma.auditLog.findMany({ where: { deviceId: { in: devices.map((item) => item.id) }, dryRun: false }, orderBy: { createdAt: "desc" }, take: 4, select: { action: true } }) : [];
  const now = new Date(), parts = (locale: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: tehran }).format(now);
  return { schemaVersion: 1, generatedAt: now.toISOString(), reportDateFa: parts("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }), reportDateGregorian: parts("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }), reportTime: parts("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }), timezone: tehran,
    reportNumber: `${company.code}-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`, preparedBy: user.displayName, company: { id: company.id, name: company.name, code: company.code },
    summary: { total: equipment.length, active, limited, inactive, healthScore: equipment.length ? Math.round(((active + limited * .5) / equipment.length) * 100) : 100 }, equipment,
    completedActions: actions.map((item) => item.action), futureActions: equipment.filter((item) => item.status !== "active").slice(0, 4).map((item) => `بررسی و رفع وضعیت ${item.name}`), additionalNotes: "", responsibleName: user.displayName };
}

export function sanitizeCompanyStatusReport(input: CompanyStatusReport, companyId: string): CompanyStatusReport {
  if (!input || input.schemaVersion !== 1 || input.company?.id !== companyId || !Array.isArray(input.equipment)) throw new CompanyReportError("INVALID_REPORT", 400);
  const status = new Set(["active", "limited", "inactive"]), category = new Set(["server", "firewall", "switch", "router", "other"]);
  const equipment = input.equipment.slice(0, 250).map((item) => ({ ...item, id: limitText(item.id, 80), name: limitText(item.name, 90), host: limitText(item.host, 120), vendor: limitText(item.vendor, 70), model: limitText(item.model, 100), description: limitText(item.description, 300), physicalLocation: limitText(item.physicalLocation, 120), category: (category.has(item.category) ? item.category : "other") as ReportEquipmentCategory, status: (status.has(item.status) ? item.status : "limited") as ReportEquipmentState, cpuPercent: num(item.cpuPercent), diskPercent: num(item.diskPercent), collectedAt: item.collectedAt ? limitText(item.collectedAt, 40) : null, source: (["live", "snapshot", "inventory"] as const).includes(item.source) ? item.source : "inventory" as const, vendorFields: (item.vendorFields ?? []).slice(0, 8).map((field) => ({ label: limitText(field.label, 50), value: limitText(field.value, 100) })) }));
  const active = equipment.filter((item) => item.status === "active").length, limited = equipment.filter((item) => item.status === "limited").length, inactive = equipment.filter((item) => item.status === "inactive").length;
  return { ...input, generatedAt: limitText(input.generatedAt, 40), reportDateFa: limitText(input.reportDateFa, 30), reportDateGregorian: limitText(input.reportDateGregorian, 30), reportTime: limitText(input.reportTime, 20), timezone: tehran, reportNumber: limitText(input.reportNumber, 60), preparedBy: limitText(input.preparedBy, 80), company: { id: companyId, name: limitText(input.company.name, 100), code: limitText(input.company.code, 50) }, summary: { total: equipment.length, active, limited, inactive, healthScore: Math.max(0, Math.min(100, Number(input.summary?.healthScore) || 0)) }, equipment, completedActions: (input.completedActions ?? []).slice(0, 8).map((item) => limitText(item, 180)), futureActions: (input.futureActions ?? []).slice(0, 8).map((item) => limitText(item, 180)), additionalNotes: limitText(input.additionalNotes, 600), responsibleName: limitText(input.responsibleName, 80) };
}

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const stateFa = { active: "فعال", limited: "محدود", inactive: "غیرفعال" } as const;
const categoryFa: Record<ReportEquipmentCategory, string> = { server: "سرور", firewall: "فایروال", switch: "سوئیچ", router: "روتر", other: "سایر" };
const palettes = [
  { color: "#1769cc", tint: "#eaf4ff", icon: "▤" }, { color: "#d62635", tint: "#fff0f1", icon: "▦" },
  { color: "#13864f", tint: "#ecfff5", icon: "⇄" }, { color: "#e87700", tint: "#fff5e7", icon: "⌁" },
  { color: "#6750a4", tint: "#f4f0ff", icon: "◇" }, { color: "#087e8b", tint: "#e9fcff", icon: "◫" }
];

async function embeddedFont() {
  try { return (await fs.readFile(path.join(process.cwd(), "assets", "iranyekanwebregularfanum.ttf"))).toString("base64"); }
  catch { return ""; }
}

export async function renderCompanyReportHtml(report: CompanyStatusReport) {
  const font = await embeddedFont();
  const vendors = [...new Set(report.equipment.map((item) => item.vendor))];
  const vendorSections = vendors.map((vendor, index) => {
    const rows = report.equipment.filter((item) => item.vendor === vendor), palette = palettes[index % palettes.length];
    const devices = rows.slice(0, 3).map((item) => {
      const extras = item.vendorFields.slice(0, 3).map((field) => `<span><b>${esc(field.label)}:</b> ${esc(field.value)}</span>`).join("");
      return `<article class="device"><div><strong>${esc(item.name)}</strong><small>${esc(categoryFa[item.category])} · ${esc(item.model)}</small></div><code>${esc(item.host)}</code><em class="${item.status}">${stateFa[item.status]}</em><p>${esc(item.description)}</p>${item.category === "server" ? `<div class="metrics"><span>CPU <b>${item.cpuPercent ?? "—"}%</b></span><span>Disk <b>${item.diskPercent ?? "—"}%</b></span></div>` : ""}<div class="facts">${extras}</div><label>محل فیزیکی <i>${esc(item.physicalLocation) || " "}</i></label></article>`;
    }).join("");
    const hidden = rows.length > 3 ? `<small class="more">و ${rows.length - 3} تجهیز دیگر در فایل Excel</small>` : "";
    return `<section class="vendor" style="--accent:${palette.color};--tint:${palette.tint}"><header><i>${palette.icon}</i><strong>${esc(vendor)}</strong><small>${rows.length.toLocaleString("fa-IR")} تجهیز</small></header><div class="vendor-body">${devices}${hidden}</div></section>`;
  }).join("") || `<div class="empty">برای این شرکت تجهیز فعالی ثبت نشده است.</div>`;
  const issueRows = report.equipment.filter((item) => item.status !== "active").slice(0, 12).map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.vendor)}</td><td dir="ltr">${esc(item.host)}</td><td class="${item.status}">${stateFa[item.status]}</td><td>${esc(item.description)}</td><td>${item.collectedAt ? esc(new Date(item.collectedAt).toLocaleString("fa-IR", { timeZone: tehran })) : "داده موجود نیست"}</td></tr>`).join("") || `<tr><td colspan="6">همهٔ تجهیزات دارای وضعیت فعال هستند.</td></tr>`;
  const lines = (values: string[]) => values.length ? values.slice(0, 6).map((value) => `<li>${esc(value)}</li>`).join("") : "<li>موردی ثبت نشده است.</li>";
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(report.company.name)} - گزارش وضعیت</title><style>
@font-face{font-family:IRANYekan;src:url(data:font/ttf;base64,${font}) format('truetype')}*{box-sizing:border-box}body{margin:0;background:#eaf0f8;color:#102653;font:10px IRANYekan,Tahoma,sans-serif}.page{width:210mm;height:297mm;overflow:hidden;margin:0 auto;background:#fff;padding:9mm;page-break-after:always}.page:last-child{page-break-after:auto}.head{display:grid;grid-template-columns:1fr 2.2fr 1.15fr;gap:5mm;align-items:center}.brand{font-size:13px;font-weight:900}.brand small{display:block;color:#607596}.title{background:linear-gradient(120deg,#e8f1ff,#dbe7ff);border-radius:9px;padding:4mm;text-align:center}.title h1{font-size:19px;margin:0}.title p{margin:1mm 0 0}.meta{display:grid;grid-template-columns:auto 1fr;gap:1.5mm}.meta b{border:1px solid #a9c4e9;border-radius:4px;padding:1.2mm;font-size:8.5px}.summary{display:grid;grid-template-columns:1.4fr repeat(4,1fr);gap:2mm;margin:4mm 0}.summary div{border:1px solid #c8d8ee;border-radius:7px;padding:2mm;text-align:center;background:#f7fbff}.summary strong{display:block;font-size:15px}.summary .score{background:#102653;color:#fff}.vendors{display:grid;gap:2.5mm}.vendor{display:grid;grid-template-columns:27mm 1fr;border:1px solid var(--accent);border-radius:8px;overflow:hidden;background:var(--tint);break-inside:avoid}.vendor>header{display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--accent);background:color-mix(in srgb,var(--tint) 78%,var(--accent));padding:2mm;text-align:center}.vendor>header i{font-size:22px;font-style:normal}.vendor>header strong{font-size:12px}.vendor-body{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;padding:2mm}.device{display:grid;grid-template-columns:1fr auto;gap:1mm 2mm;background:#ffffffe6;border-radius:5px;padding:2mm;min-width:0}.device small{display:block;color:#6b7f9e}.device code{direction:ltr;font:8px Consolas,monospace}.device em{font-style:normal;font-weight:900}.device p,.device .facts,.device label,.device .metrics{grid-column:1/3;margin:0;color:#526a8b;font-size:8px}.device .facts{display:flex;gap:2mm;flex-wrap:wrap}.device label{border-top:1px dashed #b9cbe3;padding-top:1mm}.device label i{display:inline-block;min-width:18mm;font-style:normal}.more{align-self:end;color:#667a97}.active{color:#0a9448!important}.limited{color:#e87700!important}.inactive{color:#dc2638!important}.section-title{font-size:18px;margin:0 0 4mm}.table{width:100%;border-collapse:collapse;font-size:8.5px}.table th{background:#e5efff}.table td,.table th{border:1px solid #b8c9e3;padding:2mm;text-align:right}.two{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm}.box{border:1px solid #b8c9e3;border-radius:8px;overflow:hidden;min-height:48mm}.box h3{margin:0;padding:3mm;background:#edf3ff}.box.future h3{background:#e8fff5;color:#126c47}.box ul{line-height:2;padding:2mm 7mm;margin:0}.notes{margin-top:4mm;border:1px solid #b8c9e3;border-radius:8px;padding:4mm;min-height:25mm}.signature{display:flex;justify-content:space-between;margin-top:6mm;border-top:1px solid #294f8e;padding-top:3mm}.empty{padding:20mm;text-align:center;border:1px dashed #9db4d4;border-radius:8px}@page{size:A4;margin:0}@media print{body{background:#fff}}
</style></head><body><section class="page"><div class="head"><div class="brand">▱ IT Infrastructure<small>Report Form</small></div><div class="title"><h1>فرم گزارش کار تجهیزات زیرساخت IT</h1><p>وضعیت جدید تجهیزات شرکت ${esc(report.company.name)}</p></div><div class="meta"><span>تاریخ شمسی</span><b>${esc(report.reportDateFa)}</b><span>تاریخ میلادی</span><b dir="ltr">${esc(report.reportDateGregorian)}</b><span>ساعت تهران</span><b>${esc(report.reportTime)}</b><span>شماره گزارش</span><b>${esc(report.reportNumber)}</b><span>تهیه‌کننده</span><b>${esc(report.preparedBy)}</b></div></div><div class="summary"><div class="score"><span>امتیاز سلامت</span><strong>${report.summary.healthScore.toLocaleString("fa-IR")}%</strong></div><div><span>کل تجهیزات</span><strong>${report.summary.total.toLocaleString("fa-IR")}</strong></div><div><span>فعال</span><strong class="active">${report.summary.active.toLocaleString("fa-IR")}</strong></div><div><span>محدود</span><strong class="limited">${report.summary.limited.toLocaleString("fa-IR")}</strong></div><div><span>غیرفعال</span><strong class="inactive">${report.summary.inactive.toLocaleString("fa-IR")}</strong></div></div><div class="vendors">${vendorSections}</div></section><section class="page"><h1 class="section-title">جمع‌بندی وضعیت و اقدامات</h1><table class="table"><thead><tr><th>تجهیز</th><th>وندور</th><th>IP</th><th>وضعیت</th><th>توضیح</th><th>زمان داده</th></tr></thead><tbody>${issueRows}</tbody></table><div class="two"><section class="box"><h3>اقدامات انجام‌شده</h3><ul>${lines(report.completedActions)}</ul></section><section class="box future"><h3>برنامه‌ها و اقدامات آتی</h3><ul>${lines(report.futureActions)}</ul></section></div><div class="notes"><b>توضیحات اضافی</b><p>${esc(report.additionalNotes) || "—"}</p></div><div class="signature"><span>نام مسئول: <b>${esc(report.responsibleName)}</b></span><span>زمان تولید: ${esc(report.reportDateFa)} · ${esc(report.reportTime)} · تهران</span></div></section></body></html>`;
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
  const summary = book.addWorksheet("خلاصه مدیریتی", { views: [{ rightToLeft: true }] }); summary.columns = Array.from({ length: 6 }, () => ({ width: 22 }));
  summary.mergeCells("A1:F2"); summary.getCell("A1").value = `گزارش وضعیت تجهیزات زیرساخت IT - ${report.company.name}`; summary.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF102653" } }; summary.getCell("A1").alignment = { horizontal: "center", vertical: "middle" }; summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3EDFF" } };
  summary.addRow([]); summary.addRow(["تاریخ شمسی", report.reportDateFa, "تاریخ میلادی", report.reportDateGregorian, "ساعت تهران", report.reportTime]); summary.addRow(["شماره گزارش", report.reportNumber, "تهیه‌کننده", report.preparedBy, "امتیاز سلامت", report.summary.healthScore]); summary.addRow(["کل", report.summary.total, "فعال", report.summary.active, "محدود / غیرفعال", `${report.summary.limited} / ${report.summary.inactive}`]); summary.addRow([]); summary.addRow(["وندور", "تعداد", "فعال", "محدود", "غیرفعال", "گروه‌ها"]);
  [...new Set(report.equipment.map((item) => item.vendor))].forEach((vendor) => { const rows = report.equipment.filter((item) => item.vendor === vendor); summary.addRow([vendor, rows.length, rows.filter((item) => item.status === "active").length, rows.filter((item) => item.status === "limited").length, rows.filter((item) => item.status === "inactive").length, [...new Set(rows.map((item) => categoryFa[item.category]))].join("، ")]); });
  summary.eachRow((row) => { row.alignment = { vertical: "middle", horizontal: "right", wrapText: true }; });
  const details = book.addWorksheet("تجهیزات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] }); details.columns = [
    { header: "نام تجهیز", key: "name", width: 24 }, { header: "گروه", key: "category", width: 14 }, { header: "وندور", key: "vendor", width: 18 }, { header: "مدل / پلتفرم", key: "model", width: 24 }, { header: "IP Address", key: "host", width: 19 }, { header: "وضعیت", key: "status", width: 13 }, { header: "CPU %", key: "cpu", width: 10 }, { header: "Disk %", key: "disk", width: 10 }, { header: "محل فیزیکی", key: "location", width: 22 }, { header: "اطلاعات وندور", key: "vendorData", width: 42 }, { header: "توضیحات", key: "description", width: 44 }, { header: "زمان داده", key: "collected", width: 22 }, { header: "منبع", key: "source", width: 13 }
  ];
  report.equipment.forEach((item) => details.addRow({ name: item.name, category: categoryFa[item.category], vendor: item.vendor, model: item.model, host: item.host, status: stateFa[item.status], cpu: item.cpuPercent, disk: item.diskPercent, location: item.physicalLocation, vendorData: item.vendorFields.map((field) => `${field.label}: ${field.value}`).join(" | "), description: item.description, collected: item.collectedAt, source: item.source }));
  details.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; details.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1769CC" } }; details.autoFilter = { from: "A1", to: "M1" }; details.eachRow((row) => { row.alignment = { vertical: "middle", horizontal: "right", wrapText: true }; });
  return Buffer.from(await book.xlsx.writeBuffer());
}
