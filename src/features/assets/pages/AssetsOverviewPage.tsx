import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssetSummaryCards } from "../components/AssetSummaryCards";
import { useAssets } from "../hooks/useAssets";

export default function AssetsOverviewPage() {
  const { assets, stats, loading, error, refresh } = useAssets();
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="دارایی ها" eyebrow="دید عملیاتی دارایی" description="نمای فشرده دارایی های شناخته شده، وضعیت سلامت و آخرین همگام سازی." actions={<a className="primary-link" href="/assets/devices/new">ثبت دستگاه</a>} />
      <AssetSummaryCards stats={stats} />
      <div className="content-grid">
        <section className="content-panel">
          <h2>وضعیت سلامت</h2>
          <p>{stats.needsReview ? `${stats.needsReview} دارایی نیازمند بررسی است.` : "دارایی بحرانی تایید شده ای در این نما وجود ندارد."}</p>
        </section>
        <section className="content-panel">
          <h2>دارایی های نیازمند اقدام</h2>
          {assets.filter((asset) => !["online", "healthy"].includes(asset.healthState)).slice(0, 5).map((asset) => (
            <a key={asset.id} href={`/assets/devices/${asset.device?.id ?? asset.id}`} className="list-row">{asset.name}<span>{asset.healthState}</span></a>
          ))}
          {!stats.needsReview ? <EmptyState title="مورد فوری وجود ندارد" description="بعد از همگام سازی یا ورود رویداد، موارد نیازمند بررسی اینجا دیده می شوند." /> : null}
        </section>
        <section className="content-panel">
          <h2>آخرین تغییرات یا همگام سازی</h2>
          <p>همگام سازی های آزمایشی فقط با برچسب Mock در بخش یکپارچه سازی و همگام سازی نمایش داده می شوند.</p>
          <a href="/assets/sync" className="primary-link">رفتن به همگام سازی</a>
        </section>
      </div>
    </section>
  );
}
