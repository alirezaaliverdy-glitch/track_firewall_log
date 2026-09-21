import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, Download, Eye, FileCode2, FileSpreadsheet, FileText, History, LoaderCircle, PencilLine, RefreshCw, ServerCog, X } from "lucide-react";
import { listCompanies, type Company } from "@/lib/companies";
import { createCompanyStatusReport, downloadCompanyStatusReport, listCompanyStatusReportHistory, type CompanyStatusEquipment, type CompanyStatusReport, type ReportFormat, type ReportHistoryEntry } from "@/lib/reports";
import "./ReportsPage.css";

const stateLabel = { active: "فعال", limited: "محدود", inactive: "غیرفعال" } as const;
const categoryLabel = { server: "سرور", firewall: "فایروال", switch: "سوئیچ", router: "روتر", other: "سایر" } as const;
const formatOptions: Array<{ id: ReportFormat; label: string; Icon: typeof FileText }> = [
  { id: "pdf", label: "PDF", Icon: FileText },
  { id: "xlsx", label: "Excel", Icon: FileSpreadsheet },
  { id: "html", label: "HTML", Icon: FileCode2 }
];

function historyDate(value: string) {
  const date = new Date(value);
  return {
    fa: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tehran" }).format(date),
    en: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(date),
    time: new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(date)
  };
}

export default function ReportsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [report, setReport] = useState<CompanyStatusReport | null>(null);
  const [historyItems, setHistoryItems] = useState<ReportHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"create" | "history">("create");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async (selectedCompanyId: string) => {
    if (!selectedCompanyId) return setHistoryItems([]);
    setHistoryLoading(true);
    try { setHistoryItems(await listCompanyStatusReportHistory(selectedCompanyId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "دریافت تاریخچه گزارش‌ها ناموفق بود"); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    void listCompanies()
      .then((items) => { setCompanies(items); setCompanyId(items[0]?.id ?? ""); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "دریافت شرکت‌ها ناموفق بود"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { setError(""); void loadHistory(companyId); }, [companyId, loadHistory]);
  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [previewOpen]);

  const updateReport = <K extends keyof CompanyStatusReport>(key: K, value: CompanyStatusReport[K]) => setReport((current) => current ? { ...current, [key]: value } : current);
  const updateEquipment = (id: string, patch: Partial<CompanyStatusEquipment>) => setReport((current) => current ? { ...current, equipment: current.equipment.map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  const generate = async () => {
    if (!companyId) return;
    setGenerating(true); setError("");
    try {
      const nextReport = await createCompanyStatusReport(companyId);
      setReport(nextReport);
      setPreviewOpen(false);
      await loadHistory(companyId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ساخت گزارش ناموفق بود"); }
    finally { setGenerating(false); }
  };
  const download = async () => {
    if (!report) return;
    setExporting(true); setError("");
    try { await downloadCompanyStatusReport(report, format); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "دریافت فایل ناموفق بود"); }
    finally { setExporting(false); }
  };

  return <section className="reports-page" dir="rtl">
    <header className="reports-hero">
      <div><span>گزارش‌گیری مدیریتی</span><h1>گزارش وضعیت تجهیزات</h1></div>
      <div className="reports-hero__mark"><FileText/><small>PDF · Excel · HTML</small></div>
    </header>

    <nav className="reports-tabs" aria-label="بخش‌های گزارش‌گیری">
      <button type="button" className={activeTab === "create" ? "active" : ""} onClick={() => setActiveTab("create")}><FileText/> ساخت گزارش</button>
      <button type="button" className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}><History/> تاریخچه <span>{historyItems.length.toLocaleString("fa-IR")}</span></button>
    </nav>

    <section className="reports-toolbar">
      <label><span><Building2/> شرکت</span><select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setReport(null); setPreviewOpen(false); }} disabled={loading}>{companies.map((company) => <option value={company.id} key={company.id}>{company.name} · {company.code}</option>)}</select></label>
      {activeTab === "create" ? <button className="reports-generate" type="button" disabled={!companyId || generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin"/> : <RefreshCw/>}{generating ? "در حال دریافت وضعیت…" : "ساخت گزارش جدید"}</button> : null}
    </section>

    {error && <p className="reports-error">{error}</p>}

    {activeTab === "create"
      ? <CreateReportView report={report} loading={loading} format={format} exporting={exporting} onFormat={setFormat} onDownload={() => void download()} onPreview={() => setPreviewOpen(true)} onDismiss={() => { setReport(null); setPreviewOpen(false); }}/>
      : <ReportHistory items={historyItems} loading={historyLoading}/>}

    {report && previewOpen ? <ReportPreviewModal report={report} onClose={() => setPreviewOpen(false)} onUpdateReport={updateReport} onUpdateEquipment={updateEquipment}/> : null}
  </section>;
}

function CreateReportView({ report, loading, format, exporting, onFormat, onDownload, onPreview, onDismiss }: { report: CompanyStatusReport | null; loading: boolean; format: ReportFormat; exporting: boolean; onFormat: (format: ReportFormat) => void; onDownload: () => void; onPreview: () => void; onDismiss: () => void }) {
  if (!report && !loading) return <div className="reports-empty"><ServerCog/><h2>برای شروع، یک گزارش بسازید</h2><p>شرکت را انتخاب کنید و وضعیت فعلی تجهیزات را دریافت کنید.</p></div>;
  if (!report) return <div className="reports-loading"><LoaderCircle className="spin"/> در حال آماده‌سازی…</div>;
  return <section className="report-ready">
    <div className="report-ready__status"><CheckCircle2/><div><small>گزارش آماده است</small><h2>{report.company.name}</h2><p>{report.reportNumber} · {report.reportDateFa} · ساعت {report.reportTime}</p></div></div>
    <div className="report-ready__metrics"><span><b>{report.summary.total.toLocaleString("fa-IR")}</b> تجهیز</span><span><b>{report.summary.active.toLocaleString("fa-IR")}</b> فعال</span><span><b>{report.summary.healthScore.toLocaleString("fa-IR")}%</b> سلامت</span></div>
    <div className="report-ready__actions">
      <button type="button" className="report-preview-button" onClick={onPreview}><Eye/> ویرایش و پیش‌نمایش</button>
      <div className="reports-formats" aria-label="فرمت خروجی">{formatOptions.map(({ id, label, Icon }) => <button type="button" key={id} className={format === id ? "active" : ""} onClick={() => onFormat(id)}><Icon/>{label}</button>)}</div>
      <button className="reports-download" type="button" disabled={exporting} onClick={onDownload}>{exporting ? <LoaderCircle className="spin"/> : <Download/>}{exporting ? "در حال ساخت فایل…" : `دریافت ${format.toUpperCase()}`}</button>
      <button className="report-dismiss" type="button" onClick={onDismiss}><X/> بستن گزارش</button>
    </div>
  </section>;
}

function ReportHistory({ items, loading }: { items: ReportHistoryEntry[]; loading: boolean }) {
  if (loading) return <div className="reports-loading"><LoaderCircle className="spin"/> در حال دریافت تاریخچه…</div>;
  if (!items.length) return <div className="reports-empty reports-empty--history"><History/><h2>هنوز گزارشی ثبت نشده</h2><p>گزارش‌های ساخته‌شده برای این شرکت اینجا نمایش داده می‌شوند.</p></div>;
  return <section className="reports-history"><header><div><h2>تاریخچه گزارش‌ها</h2><p>{items.length.toLocaleString("fa-IR")} گزارش اخیر این شرکت</p></div><History/></header><div className="reports-history__list">{items.map((item) => { const date = historyDate(item.createdAt); return <article key={item.id} className="history-row"><div className="history-row__user"><span>{item.actorDisplayName.trim().charAt(0).toUpperCase() || "U"}</span><div><strong>{item.actorDisplayName}</strong><small dir="ltr">@{item.actorUsername}</small></div></div><div className="history-row__report"><small>شماره گزارش</small><b dir="ltr">{item.reportNumber}</b></div><div className="history-row__date"><Clock3/><div><strong>{date.fa}</strong><small dir="ltr">{date.en} · {date.time}</small></div></div><div className="history-row__metrics"><span>{item.equipmentCount.toLocaleString("fa-IR")} تجهیز</span><b>{item.healthScore.toLocaleString("fa-IR")}% سلامت</b></div></article>; })}</div></section>;
}

function ReportPreviewModal({ report, onClose, onUpdateReport, onUpdateEquipment }: { report: CompanyStatusReport; onClose: () => void; onUpdateReport: <K extends keyof CompanyStatusReport>(key: K, value: CompanyStatusReport[K]) => void; onUpdateEquipment: (id: string, patch: Partial<CompanyStatusEquipment>) => void }) {
  const vendors = useMemo(() => [...new Set(report.equipment.map((item) => item.vendor))], [report.equipment]);
  return <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
    <button className="report-modal__backdrop" type="button" aria-label="بستن پیش‌نمایش" onClick={onClose}/>
    <section className="report-modal__panel">
      <header className="report-modal__toolbar"><div><PencilLine/><div><strong id="report-preview-title">ویرایش و پیش‌نمایش گزارش</strong><small>تغییرات این بخش در فایل خروجی اعمال می‌شوند.</small></div></div><button type="button" onClick={onClose}><X/> بستن</button></header>
      <div className="report-modal__body">
        <div className="report-editor__hint"><CheckCircle2/><span>آخرین جمع‌آوری: {report.reportDateFa}، ساعت {report.reportTime} تهران</span></div>
        <article className="report-paper">
          <header className="report-paper__head"><div className="report-paper__brand"><FileText/> IT Infrastructure<small>Report Form</small></div><div className="report-paper__title"><h2>فرم گزارش کار تجهیزات زیرساخت IT</h2><p>وضعیت تجهیزات شرکت {report.company.name}</p></div><div className="report-paper__meta"><label>تاریخ شمسی<input value={report.reportDateFa} onChange={(event) => onUpdateReport("reportDateFa", event.target.value)}/></label><label>تاریخ میلادی<input dir="ltr" value={report.reportDateGregorian} onChange={(event) => onUpdateReport("reportDateGregorian", event.target.value)}/></label><label>ساعت تهران<input value={report.reportTime} onChange={(event) => onUpdateReport("reportTime", event.target.value)}/></label><label>شماره گزارش<input value={report.reportNumber} onChange={(event) => onUpdateReport("reportNumber", event.target.value)}/></label><label>تهیه‌کننده<input value={report.preparedBy} onChange={(event) => onUpdateReport("preparedBy", event.target.value)}/></label></div></header>
          <div className="report-paper__summary"><div className="score"><small>امتیاز سلامت</small><strong>{report.summary.healthScore.toLocaleString("fa-IR")}%</strong></div><div><small>کل</small><strong>{report.summary.total.toLocaleString("fa-IR")}</strong></div><div><small>فعال</small><strong>{report.summary.active.toLocaleString("fa-IR")}</strong></div><div><small>محدود</small><strong>{report.summary.limited.toLocaleString("fa-IR")}</strong></div><div><small>غیرفعال</small><strong>{report.summary.inactive.toLocaleString("fa-IR")}</strong></div></div>
          <div className="report-vendors">{vendors.map((vendor, index) => { const rows = report.equipment.filter((item) => item.vendor === vendor); return <section className={`report-vendor tone-${index % 6}`} key={vendor}><header><ServerCog/><strong>{vendor}</strong><small>{rows.length.toLocaleString("fa-IR")} تجهیز</small></header><div>{rows.map((item) => <EquipmentEditor key={item.id} item={item} onChange={(patch) => onUpdateEquipment(item.id, patch)}/>)}</div></section>; })}</div>
          <div className="report-paper__actions"><label><span>اقدامات انجام‌شده</span><textarea value={report.completedActions.join("\n")} onChange={(event) => onUpdateReport("completedActions", event.target.value.split("\n"))}/></label><label><span>برنامه‌ها و اقدامات آتی</span><textarea value={report.futureActions.join("\n")} onChange={(event) => onUpdateReport("futureActions", event.target.value.split("\n"))}/></label></div>
          <label className="report-paper__notes"><span>توضیحات اضافی</span><textarea value={report.additionalNotes} onChange={(event) => onUpdateReport("additionalNotes", event.target.value)}/></label>
          <label className="report-paper__responsible"><span>نام مسئول</span><input value={report.responsibleName} onChange={(event) => onUpdateReport("responsibleName", event.target.value)}/></label>
        </article>
      </div>
    </section>
  </div>;
}

function EquipmentEditor({ item, onChange }: { item: CompanyStatusEquipment; onChange: (patch: Partial<CompanyStatusEquipment>) => void }) {
  return <article className="equipment-editor"><div className="equipment-editor__grid"><label>نام تجهیز<input value={item.name} onChange={(event) => onChange({ name: event.target.value })}/></label><label>IP Address<input dir="ltr" value={item.host} onChange={(event) => onChange({ host: event.target.value })}/></label><label>مدل / پلتفرم<input value={item.model} onChange={(event) => onChange({ model: event.target.value })}/></label><label>نوع<input value={categoryLabel[item.category]} readOnly/></label><label>محل فیزیکی<input value={item.physicalLocation} placeholder="توسط کاربر تکمیل شود" onChange={(event) => onChange({ physicalLocation: event.target.value })}/></label><label>وضعیت<select value={item.status} onChange={(event) => onChange({ status: event.target.value as CompanyStatusEquipment["status"] })}><option value="active">فعال</option><option value="limited">محدود</option><option value="inactive">غیرفعال</option></select></label></div>{item.category === "server" ? <div className="equipment-editor__health"><span>CPU <b>{item.cpuPercent ?? "داده موجود نیست"}{item.cpuPercent === null ? "" : "%"}</b></span><span>Disk <b>{item.diskPercent ?? "داده موجود نیست"}{item.diskPercent === null ? "" : "%"}</b></span></div> : null}<div className="equipment-editor__facts">{item.vendorFields.map((field) => <span key={`${field.label}-${field.value}`}><b>{field.label}</b>{field.value}</span>)}</div><label className="equipment-editor__description">توضیحات<input value={item.description} onChange={(event) => onChange({ description: event.target.value })}/></label><footer><span className={item.status}>{stateLabel[item.status]}</span><span>{item.source === "live" ? "داده زنده" : item.source === "snapshot" ? "آخرین Snapshot" : "موجودی ثبت‌شده"}</span><time>{item.collectedAt ? new Date(item.collectedAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "داده زمانی موجود نیست"}</time></footer></article>;
}
