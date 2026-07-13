import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssetTable } from "../components/AssetTable";
import { useAssets } from "../hooks/useAssets";

export default function AssetListPage() {
  const { assets, loading, error, refresh } = useAssets();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => assets.filter((asset) => [asset.name, asset.hostname, asset.managementIp, asset.vendor?.name, asset.site?.name].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [assets, query]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack">
      <PageHeader title="تجهیزات" eyebrow="دارایی ها / تجهیزات" description="جدول دارایی های متصل به API با جست وجوی سبک و مسیر جزئیات." actions={<a className="primary-link" href="/assets/devices/new">ثبت دستگاه</a>} />
      <div className="filter-bar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست وجو بر اساس نام، IP، وندور یا سایت" /></div>
      {filtered.length ? <AssetTable assets={filtered} /> : <EmptyState title="دارایی پیدا نشد" description="فیلترها را تغییر دهید یا sync را اجرا کنید." />}
    </section>
  );
}
