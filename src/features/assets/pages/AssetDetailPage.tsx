import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDeviceWorkspace, type DeviceWorkspace, type WorkspaceChartPoint } from "@/lib/deviceOnboarding";
import { Link, useNavigate } from "react-router-dom";
import { DeviceVerificationPanel } from "@/features/assets/components/DeviceVerificationPanel";
import { deleteDevice, updateDevice, type DeviceInput } from "@/lib/devices";

const sections = [
  ["overview", "نمای کلی"], ["health", "سلامت"], ["inventory", "موجودی"], ["capabilities", "قابلیت‌ها"],
  ["findings", "یافته‌ها"], ["actions", "اقدام‌ها"], ["history", "تاریخچه"], ["configuration", "پیکربندی"]
] as const;

function value(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString() : "—"; }

const rangeHours = { "1h": 1, "6h": 6, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
type TimeRange = keyof typeof rangeHours;

function TrendChart({ title, points, empty, binary = false }: { title: string; points: WorkspaceChartPoint[]; empty: string; binary?: boolean }) {
  if (!points.length) return <article className="workspace-chart is-empty"><h3>{title}</h3><p>{empty}</p></article>;
  const width = 420;
  const height = 140;
  const values = points.map((item) => item.value);
  const min = binary ? 0 : Math.min(...values);
  const max = binary ? 1 : Math.max(...values);
  const spread = Math.max(1, max - min);
  const polyline = points.map((item, index) => `${points.length === 1 ? width / 2 : index * width / (points.length - 1)},${height - 12 - ((item.value - min) / spread) * (height - 24)}`).join(" ");
  const latest = points.at(-1);
  return <article className="workspace-chart"><div><h3>{title}</h3><span>{latest?.value}{latest?.unit ?? ""}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}><polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><p>{latest?.label ?? date(latest?.timestamp)}</p></article>;
}

export default function AssetDetailPage({ params }: RouteComponentProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const reference = params.deviceId || params.assetId;
  const section = params.section || "overview";
  const [workspace, setWorkspace] = useState<DeviceWorkspace | null>(null);
  const [error, setError] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [form, setForm] = useState({ name: "", host: "", managementPort: "22", protocol: "ssh", environment: "lab", tags: "" });
  const load = () => getDeviceWorkspace(reference).then(setWorkspace).catch((failure: Error) => setError(failure.message));
  useEffect(() => { void load(); }, [reference]);
  if (!workspace && !error) return <LoadingState />;
  if (error || !workspace) return <ErrorState message={error || "فضای کاری دستگاه پیدا نشد."} onRetry={load} />;
  const deviceId = workspace.device?.id || reference;
  const overview = workspace.overview;
  const since = Date.now() - rangeHours[timeRange] * 60 * 60 * 1000;
  const chart = (points: WorkspaceChartPoint[]) => points.filter((item) => new Date(item.timestamp).getTime() >= since);
  const vendorSection = workspace.vendor.sections.find((item) => item.key === section);
  const startEditing = () => {
    if (!workspace.device) return;
    setForm({ name: workspace.device.name, host: workspace.device.host, managementPort: String(workspace.device.managementPort), protocol: workspace.device.protocol, environment: workspace.device.environment, tags: workspace.device.tags.join(", ") });
    setEditing(true); setError("");
  };
  const saveDevice = async () => {
    if (!workspace.device || !form.name.trim() || !form.host.trim() || !Number.isInteger(Number(form.managementPort))) return;
    setSaving(true); setError("");
    try {
      await updateDevice(workspace.device.id, { name: form.name.trim(), host: form.host.trim(), managementPort: Number(form.managementPort), protocol: form.protocol as DeviceInput["protocol"], environment: form.environment as DeviceInput["environment"], tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean) });
      await load(); setEditing(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ویرایش تجهیز انجام نشد."); }
    finally { setSaving(false); }
  };
  const removeDevice = async () => {
    if (!workspace.device || deleteName.trim() !== workspace.device.name) return;
    setSaving(true); setError("");
    try { await deleteDevice(workspace.device.id); navigate("/assets/devices", { replace: true }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "حذف تجهیز انجام نشد."); setSaving(false); }
  };
  const chartCopy = isFa ? {
    health: "روند امتیاز سلامت", connector: "موفقیت/خطای کانکتور", availability: "دردسترس‌بودن", resources: "CPU و حافظه", findings: "روند یافته‌ها", actions: "نتیجه اقدام‌ها", empty: "برای این بازه داده تأییدشده‌ای ذخیره نشده است.", ranges: "بازه زمانی", changes: "نشانه‌های تغییر اخیر"
  } : {
    health: "Health score trend", connector: "Connector success/failure", availability: "Availability", resources: "CPU and memory", findings: "Findings trend", actions: "Action success/failure", empty: "No verified data is stored for this time range.", ranges: "Time range", changes: "Recent change annotations"
  };

  const content = (() => {
    if (section === "health") return <><div className="content-grid"><section className="content-panel"><h2>آخرین سلامت</h2><dl className="detail-list"><dt>امتیاز</dt><dd>{value(overview.healthScore)}</dd><dt>وضعیت</dt><dd>{overview.healthState}</dd><dt>آخرین تماس</dt><dd>{date(overview.lastContact)}</dd><dt>آخرین جمع‌آوری موفق</dt><dd>{date(overview.lastSuccessfulCollection)}</dd></dl></section><section className="content-panel"><h2>بررسی‌های اتصال</h2>{workspace.statusChecks.length ? workspace.statusChecks.slice(0, 10).map((item) => <div className="list-row" key={String(item.id)}>{value(item.status)}<span>{date(item.checkedAt)}</span></div>) : <p>بررسی اتصالی ثبت نشده است.</p>}</section></div><WorkspaceCharts /></>;
    if (section === "inventory") return <div className="content-grid"><section className="content-panel"><h2>شناسه دارایی</h2><dl className="detail-list"><dt>نام</dt><dd>{overview.name}</dd><dt>Vendor</dt><dd>{overview.vendor}</dd><dt>Platform</dt><dd>{overview.platform}</dd><dt>Version</dt><dd>{value(overview.version)}</dd><dt>IP مدیریت</dt><dd>{value(overview.managementIp)}</dd><dt>Site</dt><dd>{value(overview.site)}</dd><dt>Location</dt><dd>{value(overview.location)}</dd></dl></section><section className="content-panel"><h2>مدیریت</h2><p>{workspace.device ? "این دارایی به Device Registry متصل است." : "این دارایی هنوز unmanaged است؛ برای فعال‌سازی Connector آن را ثبت کنید."}</p>{!workspace.device ? <Link className="primary-link" to={`/assets/onboarding?asset=${workspace.asset?.id ?? reference}`}>ثبت Device برای این دارایی</Link> : null}</section></div>;
    if (section === "capabilities") return <section className="content-panel"><h2>قابلیت‌های تاییدشده</h2><dl className="detail-list"><dt>Connector</dt><dd>{value(overview.connectorType)}</dd><dt>Platform</dt><dd>{value(workspace.capabilities?.platformKey)}</dd><dt>آخرین refresh</dt><dd>{date(workspace.capabilities?.refreshedAt)}</dd><dt>وضعیت</dt><dd>{workspace.capabilities ? "کشف شده" : "هنوز کشف نشده"}</dd></dl><p>فقط قابلیت‌هایی که Backend و Connector برای این دستگاه تایید کرده‌اند قابل استفاده خواهند بود.</p></section>;
    if (section === "findings") return <section className="content-panel"><h2>یافته‌های امنیتی</h2>{workspace.findings.length ? workspace.findings.map((item) => <div className="list-row" key={String(item.id)}>{value(item.title)}<span>{value(item.severity)}</span></div>) : <p>یافته‌ای برای این دستگاه ثبت نشده است.</p>}</section>;
    if (section === "actions") return <section className="content-panel"><h2>اقدام‌های مرتبط</h2>{workspace.actions.length ? workspace.actions.map((item) => <Link className="list-row" key={String(item.id)} to={`/actions/${item.id}`}>{value(item.actionType)}<span>{value(item.status)}</span></Link>) : <p>ActionPlan مرتبطی وجود ندارد.</p>}</section>;
    if (section === "history") return <div className="content-grid"><section className="content-panel"><h2>تغییرات ثبت‌شده</h2>{workspace.audit.length ? workspace.audit.map((item) => <div className="list-row" key={String(item.id)}>{value(item.action)}<span>{date(item.createdAt)}</span></div>) : <p>رویداد Audit ثبت نشده است.</p>}</section><section className="content-panel"><h2>جمع‌آوری‌ها</h2>{workspace.collections.length ? workspace.collections.map((item) => <div className="list-row" key={String(item.id)}>{value(item.provider)}<span>{value(item.status)}</span></div>) : <p>جمع‌آوری ثبت نشده است.</p>}</section></div>;
    if (section === "configuration") return <div className="content-grid"><section className="content-panel"><h2>پشتیبان پیکربندی</h2><dl className="detail-list"><dt>وضعیت</dt><dd>{value(overview.configBackup.state)}</dd><dt>آخرین پشتیبان</dt><dd>{date(overview.configBackup.collectedAt)}</dd></dl></section><section className="content-panel"><h2>تنظیم اتصال</h2><p>Credential فقط به‌صورت مرجع ذخیره‌شده نمایش داده می‌شود.</p><Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>باز کردن راه‌اندازی اتصال</Link></section></div>;
    if (vendorSection) return <section className="content-panel vendor-capability-view"><h2>{isFa ? vendorSection.titleFa : vendorSection.titleEn}</h2><StatusBadge value={isFa ? (vendorSection.state === "available" ? "دردسترس" : "بدون داده") : vendorSection.state} tone={vendorSection.state === "available" ? "good" : "warning"} />{vendorSection.state === "available" ? <p>{isFa ? "این قابلیت توسط وضعیت واقعی دستگاه یا اجرای ثبت‌شده پشتیبانی شده است." : "This capability is supported by recorded device state or execution evidence."}</p> : <><p>{isFa ? "برای این قابلیت هنوز جمع‌آوری تأییدشده‌ای ذخیره نشده است." : vendorSection.reason}</p><dl className="detail-list"><dt>{isFa ? "نیازمندی" : "Requirement"}</dt><dd>{isFa ? "یک جمع‌آوری ثبت‌شده با کانکتور تأییدشده اجرا شود." : vendorSection.requirement}</dd><dt>{isFa ? "اقدام بعدی" : "Next action"}</dt><dd>{isFa ? "از مسیر پایش یا کاتالوگ، بررسی فقط‌خواندنی مرتبط را تازه‌سازی کنید." : vendorSection.nextAction}</dd></dl></>}</section>;
    return <><div className="content-grid"><section className="content-panel"><h2>وضعیت عملیاتی</h2><dl className="detail-list"><dt>دسترسی</dt><dd>{overview.availability}</dd><dt>سلامت</dt><dd>{overview.healthState}</dd><dt>امتیاز</dt><dd>{value(overview.healthScore)}</dd><dt>Connector</dt><dd>{value(overview.connectorType)} / {overview.connectorState}</dd><dt>تایید</dt><dd>{overview.verificationStatus}</dd></dl></section><section className="content-panel"><h2>ریسک و اقدام</h2><dl className="detail-list"><dt>یافته بحرانی</dt><dd>{overview.findingsBySeverity.critical ?? 0}</dd><dt>یافته مهم</dt><dd>{overview.findingsBySeverity.high ?? 0}</dd><dt>اقدام منتظر</dt><dd>{overview.pendingActions}</dd><dt>پشتیبان تنظیمات</dt><dd>{value(overview.configBackup.state)}</dd></dl></section><section className="content-panel"><h2>آخرین وضعیت</h2><p>آخرین تماس: {date(overview.lastContact)}</p><p>آخرین جمع‌آوری موفق: {date(overview.lastSuccessfulCollection)}</p><p>سایت: {value(overview.site)} / {value(overview.location)}</p></section></div><WorkspaceCharts /></>;
  })();

  function WorkspaceCharts() {
    if (!workspace) return null;
    const changes = workspace.charts.recentChanges.filter((item) => new Date(item.timestamp).getTime() >= since);
    return <section className="workspace-analytics" aria-label={chartCopy.ranges}><div className="workspace-range"><span>{chartCopy.ranges}</span>{(Object.keys(rangeHours) as TimeRange[]).map((item) => <button type="button" key={item} aria-pressed={timeRange === item} onClick={() => setTimeRange(item)}>{item}</button>)}</div><div className="workspace-chart-grid"><TrendChart title={chartCopy.health} points={chart(workspace.charts.healthScore)} empty={chartCopy.empty} /><TrendChart title={chartCopy.connector} points={chart(workspace.charts.connectorResults)} empty={chartCopy.empty} binary /><TrendChart title={chartCopy.availability} points={chart(workspace.charts.availability)} empty={chartCopy.empty} binary /><TrendChart title={chartCopy.resources} points={chart(workspace.charts.resources)} empty={chartCopy.empty} /><TrendChart title={chartCopy.findings} points={chart(workspace.charts.findings)} empty={chartCopy.empty} /><TrendChart title={chartCopy.actions} points={chart(workspace.charts.actions)} empty={chartCopy.empty} binary /></div><div className="content-panel"><h2>{chartCopy.changes}</h2>{changes.length ? changes.slice(-8).reverse().map((item) => <div className="list-row" key={`${item.timestamp}-${item.label}`}>{item.label}<span>{date(item.timestamp)}</span></div>) : <p>{chartCopy.empty}</p>}</div></section>;
  }

  return (
    <section className="page-stack">
      <PageHeader title={overview.name} eyebrow="فضای کاری دستگاه" description={`${overview.vendor} / ${overview.platform}`} actions={<><Link className="secondary-link" to="/assets/devices">همه تجهیزات</Link>{workspace.device && <button className="secondary-button" type="button" onClick={startEditing}>ویرایش تجهیز</button>}<Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>تنظیم اتصال</Link>{workspace.device && <button className="danger-button" type="button" onClick={() => { setDeleteOpen(true); setDeleteName(""); }}>حذف تجهیز</button>}</>} />
      {editing && workspace.device && <section className="content-panel device-edit-panel" aria-label="ویرایش تجهیز"><header><div><p className="operator-eyebrow">ویرایش سریع</p><h2>اطلاعات اصلی تجهیز</h2></div><button className="secondary-button" type="button" onClick={() => setEditing(false)}>بستن</button></header><div className="device-edit-grid"><label>نام تجهیز<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>آدرس مدیریت<input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} required dir="ltr" /></label><label>پورت مدیریت<input type="number" min="1" max="65535" value={form.managementPort} onChange={(event) => setForm({ ...form, managementPort: event.target.value })} required /></label><label>پروتکل<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })}><option value="ssh">SSH</option><option value="api">API</option><option value="syslog">Syslog</option><option value="agent">Agent</option></select></label><label>محیط<select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}><option value="lab">آزمایشگاه</option><option value="production">Production</option><option value="staging">Staging</option></select></label><label>برچسب‌ها<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="linux, edge" /></label></div><div className="button-row"><button className="primary-button" type="button" disabled={saving || !form.name.trim() || !form.host.trim()} onClick={() => void saveDevice()}>{saving ? "در حال ذخیره…" : "ذخیره تغییرات"}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setEditing(false)}>انصراف</button></div></section>}
      {deleteOpen && workspace.device && <section className="destructive-confirm" role="alertdialog" aria-label="تأیید حذف تجهیز"><strong>حذف «{workspace.device.name}»</strong><p>برای جلوگیری از حذف اشتباه، نام تجهیز را وارد کنید. ActionPlanهای قبلی باقی می‌مانند اما ارتباط آن‌ها با تجهیز حذف می‌شود.</p><label>نام تجهیز<input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" /></label><div className="button-row"><button className="danger-button" type="button" disabled={saving || deleteName.trim() !== workspace.device.name} onClick={() => void removeDevice()}>{saving ? "در حال حذف…" : "حذف قطعی تجهیز"}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setDeleteOpen(false)}>انصراف</button></div></section>}
      <div className="summary-grid"><article><span>وضعیت</span><StatusBadge value={overview.availability} tone={overview.availability === "online" ? "good" : "warning"} /></article><article><span>IP مدیریت</span><strong>{value(overview.managementIp)}</strong></article><article><span>Connector</span><strong>{value(overview.connectorType)}</strong></article><article><span>آخرین تماس</span><strong>{date(overview.lastContact)}</strong></article></div>
      {workspace.device ? <DeviceVerificationPanel deviceId={deviceId} /> : null}
      <nav className="workspace-tabs" aria-label="بخش‌های فضای کاری">{sections.map(([key, label]) => <Link key={key} aria-current={section === key ? "page" : undefined} to={`/assets/devices/${deviceId}/${key}`}>{label}</Link>)}{workspace.vendor.sections.map((item) => <Link key={`vendor-${item.key}`} aria-current={section === item.key ? "page" : undefined} to={`/assets/devices/${deviceId}/${item.key}`}>{isFa ? item.titleFa : item.titleEn}</Link>)}</nav>
      {content}
    </section>
  );
}
