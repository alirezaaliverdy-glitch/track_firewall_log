import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssetTable } from "../components/AssetTable";
import { useAssets } from "../hooks/useAssets";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { ACTIVE_COMPANY_STORAGE_KEY, listCompanies, type Company } from "@/lib/companies";
import { CompanyManager } from "../components/CompanyManager";

export default function AssetListPage() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [archivedCompanies, setArchivedCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) ?? "");
  const { assets, loading, error, refresh } = useAssets(selectedCompanyId || undefined);
  const [query, setQuery] = useState("");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const filtered = useMemo(() => assets.filter((asset) => !hiddenIds.includes(asset.id) && [asset.name, asset.hostname, asset.managementIp, asset.vendor?.name, asset.site?.name].some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))), [assets, hiddenIds, query]);
  const refreshCompanies = useCallback(async () => {
    const [active, deleted] = await Promise.all([listCompanies("active"), listCompanies("deleted")]);
    setCompanies(active); setArchivedCompanies(deleted);
    setSelectedCompanyId((current) => {
      const next = active.some((company) => company.id === current) ? current : active[0]?.id ?? "";
      if (next) localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, next); else localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
      return next;
    });
  }, []);
  useEffect(() => { void refreshCompanies(); }, [refreshCompanies]);
  function selectCompany(id: string) { setSelectedCompanyId(id); localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, id); setHiddenIds([]); }
  if (loading) return <LoadingState label={t("assets.loading")} />;
  if (error) return <ErrorState title={t("assets.errors.title")} message={error} onRetry={refresh} />;
  return (
    <section className="page-stack asset-list-page">
      <PageHeader title={t("assets.devices.title")} eyebrow={t("assets.devices.eyebrow")} description={t("assets.devices.description")} actions={<><Link className="secondary-link" to="/assets">{t("assets.actions.overview")}</Link><Link className="primary-link" to="/assets/devices/new">{t("assets.actions.register")}</Link></>} />
      <CompanyManager companies={companies} archived={archivedCompanies} selectedId={selectedCompanyId} onSelect={selectCompany} onChanged={async () => { await refreshCompanies(); refresh(); }} />
      <div className="asset-list-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("assets.searchPlaceholder")} aria-label={t("assets.searchLabel")} /><span>{t("assets.devices.resultCount", { count: filtered.length })}</span></div>
      {filtered.length ? <AssetTable assets={filtered} onRemoved={(assetId) => setHiddenIds((current) => [...current, assetId])} /> : <EmptyState title={t("assets.empty.title")} description={t("assets.empty.description")} />}
    </section>
  );
}
