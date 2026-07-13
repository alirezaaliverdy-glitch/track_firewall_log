import { useEffect, useState } from "react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getDeviceWorkspace, type DeviceWorkspace } from "@/lib/deviceOnboarding";

const sections = [
  ["overview", "نمای کلی"], ["health", "سلامت"], ["inventory", "موجودی"], ["capabilities", "قابلیت‌ها"],
  ["findings", "یافته‌ها"], ["actions", "اقدام‌ها"], ["history", "تاریخچه"], ["configuration", "پیکربندی"]
] as const;

function value(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString() : "—"; }

export default function AssetDetailPage({ params }: RouteComponentProps) {
  const reference = params.deviceId || params.assetId;
  const section = params.section || "overview";
  const [workspace, setWorkspace] = useState<DeviceWorkspace | null>(null);
  const [error, setError] = useState("");
  const load = () => getDeviceWorkspace(reference).then(setWorkspace).catch((failure: Error) => setError(failure.message));
  useEffect(() => { void load(); }, [reference]);
  if (!workspace && !error) return <LoadingState />;
  if (error || !workspace) return <ErrorState message={error || "فضای کاری دستگاه پیدا نشد."} onRetry={load} />;
  const deviceId = workspace.device?.id || reference;
  const overview = workspace.overview;

  const content = (() => {
    if (section === "health") return <div className="content-grid"><section className="content-panel"><h2>آخرین سلامت</h2><dl className="detail-list"><dt>امتیاز</dt><dd>{value(overview.healthScore)}</dd><dt>وضعیت</dt><dd>{overview.healthState}</dd><dt>آخرین تماس</dt><dd>{date(overview.lastContact)}</dd><dt>آخرین جمع‌آوری موفق</dt><dd>{date(overview.lastSuccessfulCollection)}</dd></dl></section><section className="content-panel"><h2>بررسی‌های اتصال</h2>{workspace.statusChecks.length ? workspace.statusChecks.map((item) => <div className="list-row" key={String(item.id)}>{value(item.status)}<span>{date(item.checkedAt)}</span></div>) : <p>بررسی اتصالی ثبت نشده است.</p>}</section></div>;
    if (section === "inventory") return <div className="content-grid"><section className="content-panel"><h2>شناسه دارایی</h2><dl className="detail-list"><dt>نام</dt><dd>{overview.name}</dd><dt>Vendor</dt><dd>{overview.vendor}</dd><dt>Platform</dt><dd>{overview.platform}</dd><dt>Version</dt><dd>{value(overview.version)}</dd><dt>IP مدیریت</dt><dd>{value(overview.managementIp)}</dd><dt>Site</dt><dd>{value(overview.site)}</dd><dt>Location</dt><dd>{value(overview.location)}</dd></dl></section><section className="content-panel"><h2>مدیریت</h2><p>{workspace.device ? "این دارایی به Device Registry متصل است." : "این دارایی هنوز unmanaged است؛ برای فعال‌سازی Connector آن را ثبت کنید."}</p>{!workspace.device ? <a className="primary-link" href={`/assets/onboarding?asset=${workspace.asset?.id ?? reference}`}>ثبت Device برای این دارایی</a> : null}</section></div>;
    if (section === "capabilities") return <section className="content-panel"><h2>قابلیت‌های تاییدشده</h2><dl className="detail-list"><dt>Connector</dt><dd>{value(overview.connectorType)}</dd><dt>Platform</dt><dd>{value(workspace.capabilities?.platformKey)}</dd><dt>آخرین refresh</dt><dd>{date(workspace.capabilities?.refreshedAt)}</dd><dt>وضعیت</dt><dd>{workspace.capabilities ? "کشف شده" : "هنوز کشف نشده"}</dd></dl><p>فقط قابلیت‌هایی که Backend و Connector برای این دستگاه تایید کرده‌اند قابل استفاده خواهند بود.</p></section>;
    if (section === "findings") return <section className="content-panel"><h2>یافته‌های امنیتی</h2>{workspace.findings.length ? workspace.findings.map((item) => <div className="list-row" key={String(item.id)}>{value(item.title)}<span>{value(item.severity)}</span></div>) : <p>یافته‌ای برای این دستگاه ثبت نشده است.</p>}</section>;
    if (section === "actions") return <section className="content-panel"><h2>اقدام‌های مرتبط</h2>{workspace.actions.length ? workspace.actions.map((item) => <a className="list-row" key={String(item.id)} href={`/actions/${item.id}`}>{value(item.actionType)}<span>{value(item.status)}</span></a>) : <p>ActionPlan مرتبطی وجود ندارد.</p>}</section>;
    if (section === "history") return <div className="content-grid"><section className="content-panel"><h2>تغییرات ثبت‌شده</h2>{workspace.audit.length ? workspace.audit.map((item) => <div className="list-row" key={String(item.id)}>{value(item.action)}<span>{date(item.createdAt)}</span></div>) : <p>رویداد Audit ثبت نشده است.</p>}</section><section className="content-panel"><h2>جمع‌آوری‌ها</h2>{workspace.collections.length ? workspace.collections.map((item) => <div className="list-row" key={String(item.id)}>{value(item.provider)}<span>{value(item.status)}</span></div>) : <p>جمع‌آوری ثبت نشده است.</p>}</section></div>;
    if (section === "configuration") return <div className="content-grid"><section className="content-panel"><h2>پشتیبان پیکربندی</h2><dl className="detail-list"><dt>وضعیت</dt><dd>{value(overview.configBackup.state)}</dd><dt>آخرین پشتیبان</dt><dd>{date(overview.configBackup.collectedAt)}</dd></dl></section><section className="content-panel"><h2>تنظیم اتصال</h2><p>Credential فقط به‌صورت مرجع ذخیره‌شده نمایش داده می‌شود.</p><a className="primary-link" href={`/assets/devices/${deviceId}/setup`}>باز کردن راه‌اندازی اتصال</a></section></div>;
    return <div className="content-grid"><section className="content-panel"><h2>وضعیت عملیاتی</h2><dl className="detail-list"><dt>دسترسی</dt><dd>{overview.availability}</dd><dt>سلامت</dt><dd>{overview.healthState}</dd><dt>امتیاز</dt><dd>{value(overview.healthScore)}</dd><dt>Connector</dt><dd>{value(overview.connectorType)} / {overview.connectorState}</dd><dt>تایید</dt><dd>{overview.verificationStatus}</dd></dl></section><section className="content-panel"><h2>ریسک و اقدام</h2><dl className="detail-list"><dt>یافته بحرانی</dt><dd>{overview.findingsBySeverity.critical ?? 0}</dd><dt>یافته مهم</dt><dd>{overview.findingsBySeverity.high ?? 0}</dd><dt>اقدام منتظر</dt><dd>{overview.pendingActions}</dd><dt>پشتیبان تنظیمات</dt><dd>{value(overview.configBackup.state)}</dd></dl></section><section className="content-panel"><h2>آخرین وضعیت</h2><p>آخرین تماس: {date(overview.lastContact)}</p><p>آخرین جمع‌آوری موفق: {date(overview.lastSuccessfulCollection)}</p><p>سایت: {value(overview.site)} / {value(overview.location)}</p></section></div>;
  })();

  return (
    <section className="page-stack">
      <PageHeader title={overview.name} eyebrow="فضای کاری دستگاه" description={`${overview.vendor} / ${overview.platform}`} actions={<><a className="secondary-link" href="/assets/devices">همه تجهیزات</a><a className="primary-link" href={`/assets/devices/${deviceId}/setup`}>تنظیم اتصال</a></>} />
      <div className="summary-grid"><article><span>وضعیت</span><StatusBadge value={overview.availability} tone={overview.availability === "online" ? "good" : "warning"} /></article><article><span>IP مدیریت</span><strong>{value(overview.managementIp)}</strong></article><article><span>Connector</span><strong>{value(overview.connectorType)}</strong></article><article><span>آخرین تماس</span><strong>{date(overview.lastContact)}</strong></article></div>
      <nav className="workspace-tabs" aria-label="بخش‌های فضای کاری">{sections.map(([key, label]) => <a key={key} aria-current={section === key ? "page" : undefined} href={`/assets/devices/${deviceId}/${key}`}>{label}</a>)}</nav>
      {content}
    </section>
  );
}
