import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAssets } from "@/features/assets/hooks/useAssets";
import { useFindings } from "@/features/security/hooks/useFindings";
import { useEffect, useState } from "react";
import { getLinuxMonitoringSummary, type LinuxSummary } from "@/lib/linuxMonitoring";

export default function DashboardPage() {
  const assets = useAssets();
  const findings = useFindings();
  const [linux, setLinux] = useState<LinuxSummary | null>(null);
  useEffect(() => { getLinuxMonitoringSummary().then(setLinux).catch(() => setLinux(null)); }, []);
  if (assets.loading || findings.loading) return <LoadingState />;
  if (assets.error) return <ErrorState message={assets.error} onRetry={assets.refresh} />;
  if (findings.error) return <ErrorState message={findings.error} onRetry={findings.refresh} />;
  return (
    <section className="page-stack">
      <PageHeader
        title="داشبورد"
        eyebrow="Command Center"
        description="نمای خلوت عملیاتی؛ جزئیات در صفحات تخصصی باز می شوند."
        actions={<a href="/assets/devices/new" className="primary-link">ثبت دستگاه جدید</a>}
      />
      <section className="content-panel">
        <h2>اقدام‌های سریع</h2>
        <div className="button-row">
          <a href="/assets/devices/new" className="primary-link">ثبت دستگاه جدید</a>
          <a href="/tools/network-check" className="secondary-link">تست سریع شبکه</a>
          <a href="/tools" className="secondary-link">بررسی دامنه یا IP</a>
          <a href="/tools/nmap" className="secondary-link">Nmap</a>
          <a href="/tools/monitors" className="secondary-link">مانیتورها</a>
          <a href="/assets/devices" className="secondary-link">مشاهده دستگاه‌ها</a>
        </div>
      </section>
      <div className="summary-grid dashboard-summary">
        <article className="metric-panel"><span>سلامت شبکه</span><strong>{assets.stats.needsReview ? "نیازمند بررسی" : "عادی"}</strong></article>
        <article className="metric-panel"><span>دارایی های فعال</span><strong>{assets.stats.total}</strong></article>
        <article className="metric-panel"><span>یافته‌های بحرانی</span><strong>{findings.stats.critical}</strong></article>
        <article className="metric-panel"><span>هشدارهای جدید</span><strong>{findings.findings.length}</strong></article>
        <article className="metric-panel"><span>سلامت Linux</span><strong>{linux ? `${linux.healthy}/${linux.total}` : "نامشخص"}</strong></article>
        <article className="metric-panel"><span>Connectorها</span><strong>بررسی در پایش</strong></article>
      </div>
      <div className="content-grid">
        <section className="content-panel"><h2>موارد فوری</h2><p>{findings.stats.open ? `${findings.stats.open} یافته باز وجود دارد.` : "مورد فوری ثبت نشده است."}</p><a href="/security/findings" className="primary-link">مشاهده یافته ها</a></section>
        <section className="content-panel"><h2>سلامت سرورهای Linux</h2><p>{linux ? `${linux.warning + linux.critical + linux.offline + linux.stale + linux.unknown} سرور نیازمند بررسی یا داده تازه است.` : "خلاصه Linux هنوز در دسترس نیست."}</p><a href="/monitoring/linux" className="primary-link">مشاهده پایش Linux</a></section>
        <section className="content-panel"><h2>آخرین اقدام‌ها</h2><p>برای بازبینی، تایید و مشاهده نتیجه واقعی به مرکز اقدام بروید.</p><a href="/actions" className="primary-link">مرکز اقدام</a></section>
      </div>
    </section>
  );
}
