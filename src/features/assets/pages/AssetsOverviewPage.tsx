import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { PlatformAsset } from "@/lib/platform";
import { ArrowUpLeft, CircleAlert, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIdentityIcon } from "../components/AssetIdentityIcon";
import { AssetSummaryCards } from "../components/AssetSummaryCards";
import { useAssets } from "../hooks/useAssets";

type InventoryFilter = "all" | "online" | "attention" | "unmanaged";

function isOnline(asset: PlatformAsset) {
  return ["online", "healthy"].includes(asset.healthState);
}

function matchesFilter(asset: PlatformAsset, filter: InventoryFilter) {
  if (filter === "online") return isOnline(asset);
  if (filter === "attention") return !isOnline(asset);
  if (filter === "unmanaged") return asset.managedState !== "managed";
  return true;
}

function statusTone(asset: PlatformAsset) {
  if (isOnline(asset)) return "good";
  if (["offline", "error"].includes(asset.healthState)) return "danger";
  return "warning";
}

export default function AssetsOverviewPage() {
  const { t, i18n } = useTranslation();
  const { assets, stats, loading, error, refresh } = useAssets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const language = i18n.resolvedLanguage ?? i18n.language ?? "fa";
  const locale = language.startsWith("fa") ? "fa-IR" : "en-US";

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language);
    return assets.filter((asset) => {
      if (!matchesFilter(asset, filter)) return false;
      if (!needle) return true;
      return [asset.name, asset.hostname, asset.managementIp, asset.vendor?.name, asset.platform?.name, asset.site?.name]
        .some((value) => String(value ?? "").toLocaleLowerCase(language).includes(needle));
    });
  }, [assets, filter, language, query]);

  if (loading) return <LoadingState label={t("assets.loading")} />;
  if (error) return <ErrorState title={t("assets.errors.title")} message={error} onRetry={refresh} />;

  const filters: Array<{ key: InventoryFilter; label: string; count: number }> = [
    { key: "all", label: t("assets.filters.all"), count: stats.total },
    { key: "online", label: t("assets.filters.online"), count: stats.online },
    { key: "attention", label: t("assets.filters.attention"), count: stats.needsReview },
    { key: "unmanaged", label: t("assets.filters.unmanaged"), count: stats.unmanaged },
  ];

  return (
    <section className="page-stack assets-overview">
      <PageHeader
        title={t("assets.title")}
        eyebrow={t("assets.eyebrow")}
        description={t("assets.description")}
        actions={<><Link className="secondary-link" to="/assets/devices">{t("assets.actions.devices")}</Link><Link className="primary-link" to="/assets/devices/new">{t("assets.actions.register")}</Link></>}
      />

      <AssetSummaryCards stats={stats} />

      {stats.needsReview > 0 ? (
        <Link to="/assets/devices" className="asset-attention-strip">
          <span className="asset-attention-strip__icon"><CircleAlert size={20} /></span>
          <div><strong>{t("assets.attention.title", { count: stats.needsReview })}</strong><span>{t("assets.attention.description")}</span></div>
          <ArrowUpLeft size={18} />
        </Link>
      ) : null}

      <section className="asset-inventory-panel">
        <header className="asset-inventory-panel__header">
          <div><span>{t("assets.inventory.eyebrow")}</span><h2>{t("assets.inventory.title")}</h2><p>{t("assets.inventory.description")}</p></div>
          <button className="asset-refresh-button" type="button" onClick={refresh}><RefreshCw size={15} />{t("assets.actions.refresh")}</button>
        </header>

        <div className="asset-inventory-toolbar">
          <label className="asset-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("assets.searchPlaceholder")} aria-label={t("assets.searchLabel")} /></label>
          <div className="asset-filter-pills" aria-label={t("assets.filters.label")}>
            {filters.map((item) => <button type="button" key={item.key} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<b>{item.count.toLocaleString(locale)}</b></button>)}
          </div>
        </div>

        {filtered.length ? (
          <div className="asset-inventory-list" data-testid="asset-inventory-list">
            {filtered.map((asset) => {
              const openPath = `/assets/devices/${asset.device?.id ?? asset.id}`;
              const lastSeen = asset.lastSeenAt ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(asset.lastSeenAt)) : t("assets.notCollected");
              return (
                <article className="asset-inventory-row" key={asset.id} data-testid="asset-inventory-row">
                  <AssetIdentityIcon asset={asset} />
                  <div className="asset-inventory-row__identity"><Link to={openPath}>{asset.name}</Link><span>{[asset.vendor?.name, asset.platform?.name].filter(Boolean).join(" / ") || t("assets.unknownPlatform")}</span></div>
                  <div className="asset-inventory-row__address"><span>{t("assets.labels.managementIp")}</span><b dir="ltr">{asset.managementIp ?? asset.hostname ?? "—"}</b></div>
                  <div className="asset-inventory-row__seen"><span>{t("assets.labels.lastSeen")}</span><b>{lastSeen}</b></div>
                  <span className={`asset-health asset-health--${statusTone(asset)}`}><i />{t(`assets.health.${asset.healthState}`, { defaultValue: asset.healthState })}</span>
                  <Link className="asset-open-link" to={openPath}>{t("assets.actions.open")}<ArrowUpLeft size={15} /></Link>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title={t("assets.empty.title")} description={t("assets.empty.description")} />}
      </section>
    </section>
  );
}
