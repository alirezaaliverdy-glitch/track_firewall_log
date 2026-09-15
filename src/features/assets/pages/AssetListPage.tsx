import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssetTable } from "../components/AssetTable";
import { useAssets } from "../hooks/useAssets";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

export default function AssetListPage() {
  const { t } = useTranslation();
  const { assets, loading, error, refresh } = useAssets();
  const [query, setQuery] = useState("");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const filtered = useMemo(() => assets.filter((asset) => !hiddenIds.includes(asset.id) && [asset.name, asset.hostname, asset.managementIp, asset.vendor?.name, asset.site?.name].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [assets, hiddenIds, query]);
  if (loading) return <LoadingState label={t("assets.loading")} />;
  if (error) return <ErrorState title={t("assets.errors.title")} message={error} onRetry={refresh} />;
  return (
    <section className="page-stack asset-list-page">
      <PageHeader title={t("assets.devices.title")} eyebrow={t("assets.devices.eyebrow")} description={t("assets.devices.description")} actions={<><Link className="secondary-link" to="/assets">{t("assets.actions.overview")}</Link><Link className="primary-link" to="/assets/devices/new">{t("assets.actions.register")}</Link></>} />
      <div className="asset-list-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("assets.searchPlaceholder")} aria-label={t("assets.searchLabel")} /><span>{t("assets.devices.resultCount", { count: filtered.length })}</span></div>
      {filtered.length ? <AssetTable assets={filtered} onRemoved={(assetId) => setHiddenIds((current) => [...current, assetId])} /> : <EmptyState title={t("assets.empty.title")} description={t("assets.empty.description")} />}
    </section>
  );
}
