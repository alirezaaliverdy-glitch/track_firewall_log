import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useFindings } from "../hooks/useFindings";

export default function SecurityOverviewPage() {
  const { findings, stats, loading, error, refresh } = useFindings();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="امنیت" eyebrow="Security Operations" description="نمای خلاصه یافته ها، شدت و اقدام های اخیر بدون جدول خام رویداد." />
      <div className="summary-grid">
        <article className="metric-panel"><span>یافته های باز</span><strong>{stats.open}</strong></article>
        <article className="metric-panel"><span>Critical</span><strong>{stats.critical}</strong></article>
        <article className="metric-panel"><span>High</span><strong>{stats.high}</strong></article>
        <article className="metric-panel"><span>دارایی های درگیر</span><strong>{stats.affectedAssets}</strong></article>
        <article className="metric-panel"><span>جدید 24 ساعت</span><strong>{findings.length}</strong></article>
      </div>
      <div className="content-grid">
        <section className="content-panel">
          <h2>موارد فوری</h2>
          {findings.slice(0, 5).map((finding) => <a key={finding.id} href={`/security/findings/${finding.id}`} className="list-row">{finding.title}<span>{finding.severity}</span></a>)}
          {!findings.length ? <EmptyState title="یافته ای ثبت نشده است" description="بعد از ورود event و اجرای detection، موارد اینجا دیده می شوند." /> : null}
        </section>
        <section className="content-panel"><h2>توزیع شدت</h2><p>Critical: {stats.critical} / High: {stats.high}</p></section>
        <section className="content-panel"><h2>آخرین اقدام ها</h2><p>ActionPlanهای ساخته شده از Finding فقط برای بازبینی هستند و اجرا فقط در Action Center انجام می شود.</p></section>
      </div>
    </section>
  );
}
