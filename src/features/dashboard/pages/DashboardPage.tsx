import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAssets } from "@/features/assets/hooks/useAssets";
import { useFindings } from "@/features/security/hooks/useFindings";

export default function DashboardPage() {
  const assets = useAssets();
  const findings = useFindings();
  if (assets.loading || findings.loading) return <LoadingState />;
  if (assets.error) return <ErrorState message={assets.error} onRetry={assets.refresh} />;
  if (findings.error) return <ErrorState message={findings.error} onRetry={findings.refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="داشبورد" eyebrow="Command Center" description="نمای خلوت عملیاتی؛ جزئیات در صفحات تخصصی باز می شوند." />
      <div className="summary-grid dashboard-summary">
        <article className="metric-panel"><span>سلامت شبکه</span><strong>{assets.stats.needsReview ? "نیازمند بررسی" : "عادی"}</strong></article>
        <article className="metric-panel"><span>دارایی های فعال</span><strong>{assets.stats.total}</strong></article>
        <article className="metric-panel"><span>Findings بحرانی</span><strong>{findings.stats.critical}</strong></article>
        <article className="metric-panel"><span>هشدارهای جدید</span><strong>{findings.findings.length}</strong></article>
        <article className="metric-panel"><span>ActionPlan</span><strong>Action Center</strong></article>
        <article className="metric-panel"><span>Connector</span><strong>بررسی در پایش</strong></article>
      </div>
      <div className="content-grid">
        <section className="content-panel"><h2>موارد فوری</h2><p>{findings.stats.open ? `${findings.stats.open} یافته باز وجود دارد.` : "مورد فوری ثبت نشده است."}</p><a href="/security/findings" className="primary-link">مشاهده یافته ها</a></section>
        <section className="content-panel"><h2>وضعیت دارایی ها</h2><p>{assets.stats.managed} دارایی مدیریت شده از {assets.stats.total} دارایی.</p><a href="/assets/devices" className="primary-link">مشاهده تجهیزات</a></section>
        <section className="content-panel"><h2>آخرین Actionها</h2><p>برای بازبینی، تایید و مشاهده نتیجه واقعی به Action Center بروید.</p><a href="/actions" className="primary-link">Action Center</a></section>
      </div>
    </section>
  );
}
