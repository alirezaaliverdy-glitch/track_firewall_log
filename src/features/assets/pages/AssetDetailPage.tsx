import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PlannedState } from "@/components/ui/PlannedState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAsset } from "../hooks/useAsset";

export default function AssetDetailPage({ params }: RouteComponentProps) {
  const { asset, topology, loading, error, refresh } = useAsset(params.assetId);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!asset) return <PlannedState title="دارایی پیدا نشد" description="شناسه دارایی در API موجود نیست." />;
  return (
    <section className="page-stack">
      <PageHeader title={asset.name} eyebrow="Asset Detail" description={`${asset.vendor?.name ?? "unknown"} / ${asset.platform?.name ?? "platform unknown"}`} actions={<a className="primary-link" href="/actions">Action Center</a>} />
      <div className="summary-grid">
        <article className="metric-panel"><span>IP</span><strong>{asset.managementIp ?? "-"}</strong></article>
        <article className="metric-panel"><span>Health</span><StatusBadge value={asset.healthState} tone={["online", "healthy"].includes(asset.healthState) ? "good" : "warning"} /></article>
        <article className="metric-panel"><span>Managed</span><StatusBadge value={asset.managedState} tone={asset.managedState === "managed" ? "good" : "warning"} /></article>
        <article className="metric-panel"><span>Site</span><strong>{asset.site?.name ?? "-"}</strong></article>
      </div>
      <div className="content-grid">
        <section className="content-panel"><h2>خلاصه</h2><p>{asset.device ? `متصل به Device: ${asset.device.name}` : "دارایی unmanaged است."}</p></section>
        <section className="content-panel"><h2>Interface و IP</h2><p>{asset.ipAddresses?.map((ip) => ip.address).join("، ") || "IP جداگانه ثبت نشده است."}</p></section>
        <section className="content-panel"><h2>ارتباطات</h2><p>{Object.keys(topology ?? {}).length ? "داده توپولوژی از API دریافت شد." : "ارتباطی ثبت نشده است."}</p></section>
        <PlannedState title="یافته های امنیتی، پایش، Actionها و تاریخچه" description="این تب ها در Milestoneهای بعدی به APIهای جزئی تر وصل می شوند." />
      </div>
    </section>
  );
}
