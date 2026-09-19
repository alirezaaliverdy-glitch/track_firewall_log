import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Network, Router, Search, ServerCog, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { listDevices, type Device } from "@/lib/devices";
import { listVendorFindingProfiles, type VendorFindingProfile } from "@/lib/platform";
import { FindingTable } from "../components/FindingTable";
import { useFindings } from "../hooks/useFindings";
import { securityDisplayText } from "../securityPresentation";
import { canonicalVendor, findingVendor, sourceLabel, vendorLabel } from "../vendorSecurityPresentation";

const closedStatuses = new Set(["resolved", "false_positive", "accepted_risk", "suppressed"]);
const primaryVendorOrder = ["linux", "mikrotik", "fortigate", "pfsense", "cisco"];

function vendorIcon(vendor: string) {
  if (vendor === "linux") return ServerCog;
  if (vendor === "mikrotik") return Router;
  if (vendor === "fortigate") return ShieldCheck;
  return Network;
}

export default function FindingsPage() {
  const { t, i18n } = useTranslation();
  const { findings, loading, error, refresh } = useFindings();
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<VendorFindingProfile[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("all");
  const language = i18n.resolvedLanguage ?? i18n.language;
  const locale = language.startsWith("fa") ? "fa-IR" : "en-US";
  const vendorCounts = useMemo(() => findings.reduce<Record<string, number>>((counts, finding) => {
    const vendor = findingVendor(finding);
    counts[vendor] = (counts[vendor] ?? 0) + 1;
    return counts;
  }, {}), [findings]);
  const availableVendors = useMemo(() => {
    const findingVendors = Object.keys(vendorCounts).filter((vendor) => !primaryVendorOrder.includes(vendor));
    return [...primaryVendorOrder, ...findingVendors.sort((a, b) => vendorCounts[b] - vendorCounts[a])];
  }, [vendorCounts]);

  useEffect(() => {
    listVendorFindingProfiles().then((result) => setProfiles(result.profiles ?? [])).catch(() => setProfiles([]));
    listDevices().then(setDevices).catch(() => setDevices([]));
  }, []);
  useEffect(() => {
    if ((!selectedVendor || !availableVendors.includes(selectedVendor)) && availableVendors.length) setSelectedVendor(availableVendors[0]);
  }, [availableVendors, selectedVendor]);

  const selectedProfile = profiles.find((profile) => profile.vendorId === selectedVendor);
  const vendorFindings = useMemo(() => findings.filter((finding) => findingVendor(finding) === selectedVendor), [findings, selectedVendor]);
  const vendorDevices = useMemo(() => {
    const options = new Map<string, { id: string; name: string; address: string; count: number }>();
    for (const device of devices) {
      const identity = `${device.vendor} ${device.type}`.toLowerCase();
      const vendor = identity.includes("linux") ? "linux" : canonicalVendor(device.vendor || device.type);
      if (vendor === selectedVendor) options.set(device.id, { id: device.id, name: device.name, address: device.host, count: 0 });
    }
    for (const finding of vendorFindings) {
      const current = options.get(finding.deviceId);
      options.set(finding.deviceId, {
        id: finding.deviceId,
        name: finding.device?.name ?? finding.asset?.name ?? current?.name ?? t("security.queue.unknownAsset"),
        address: finding.device?.host ?? finding.asset?.managementIp ?? current?.address ?? "—",
        count: (current?.count ?? 0) + 1
      });
    }
    return [...options.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [devices, selectedVendor, t, vendorFindings]);
  useEffect(() => {
    if (selectedDevice !== "all" && !vendorDevices.some((device) => device.id === selectedDevice)) setSelectedDevice("all");
  }, [selectedDevice, vendorDevices]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return findings.filter((finding) => {
      const vendorMatch = Boolean(selectedVendor) && findingVendor(finding) === selectedVendor;
      const deviceMatch = selectedDevice === "all" || finding.deviceId === selectedDevice;
      const severityMatch = severity === "all" || finding.severity === severity;
      const statusMatch = status === "all" || (status === "open" ? !closedStatuses.has(finding.status) : finding.status === status);
      const searchable = `${finding.title} ${finding.summary} ${securityDisplayText(finding.title, language)} ${securityDisplayText(finding.summary, language)} ${finding.category} ${finding.source} ${finding.asset?.name ?? ""} ${finding.device?.name ?? ""}`.toLocaleLowerCase();
      return vendorMatch && deviceMatch && severityMatch && statusMatch && (!normalized || searchable.includes(normalized));
    });
  }, [findings, language, query, selectedDevice, selectedVendor, severity, status]);
  const scopedFindings = selectedDevice === "all" ? vendorFindings : vendorFindings.filter((finding) => finding.deviceId === selectedDevice);
  const open = scopedFindings.filter((finding) => !closedStatuses.has(finding.status)).length;
  const critical = scopedFindings.filter((finding) => finding.severity === "critical" && !closedStatuses.has(finding.status)).length;
  const high = scopedFindings.filter((finding) => finding.severity === "high" && !closedStatuses.has(finding.status)).length;
  const VendorIcon = vendorIcon(selectedVendor);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <section className="page-stack security-findings-page">
      <PageHeader title={t("security.findings.title")} eyebrow={t("security.findings.eyebrow")} description={t("security.findings.description")} />
      {availableVendors.length ? <section className="security-vendor-switcher" aria-label={t("security.vendor.selectorLabel")}>
        <header><div><span>{t("security.vendor.eyebrow")}</span><h2>{t("security.vendor.title")}</h2><p>{t("security.vendor.description")}</p></div><Activity size={28} /></header>
        <div role="tablist">{availableVendors.map((vendor) => {
          const Icon = vendorIcon(vendor);
          return <button key={vendor} type="button" role="tab" aria-selected={selectedVendor === vendor} onClick={() => { setSelectedVendor(vendor); setSelectedDevice("all"); }}><span><Icon size={19} /></span><strong>{vendorLabel(vendor, profiles)}</strong><small>{(vendorCounts[vendor] ?? 0).toLocaleString(locale)} {t("security.vendor.findingCount")}</small></button>;
        })}</div>
      </section> : null}
      {vendorDevices.length ? <section className="security-device-switcher" aria-label={t("security.device.selectorLabel")}>
        <header><div><span>{t("security.device.eyebrow")}</span><h2>{t("security.device.title", { vendor: vendorLabel(selectedVendor, profiles) })}</h2><p>{t("security.device.description")}</p></div><ServerCog size={25} /></header>
        <div role="tablist"><button type="button" role="tab" aria-selected={selectedDevice === "all"} onClick={() => setSelectedDevice("all")}><span><Network size={18} /></span><strong>{t("security.device.all")}</strong><small>{vendorFindings.length.toLocaleString(locale)} {t("security.vendor.findingCount")}</small></button>{vendorDevices.map((device) => <button key={device.id} type="button" role="tab" aria-selected={selectedDevice === device.id} onClick={() => setSelectedDevice(device.id)}><span><ServerCog size={18} /></span><strong>{device.name}</strong><small dir="ltr">{device.address} · {device.count.toLocaleString(locale)}</small></button>)}</div>
      </section> : null}
      {selectedProfile ? <section className={`security-vendor-coverage security-vendor-coverage--${canonicalVendor(selectedProfile.vendorId)}`}>
        <span className="security-vendor-coverage__icon"><VendorIcon size={24} /></span>
        <div><span>{t("security.vendor.coverageEyebrow")}</span><h2>{vendorLabel(selectedProfile.vendorId, profiles)}</h2><p>{t("security.vendor.coverageDescription", { count: selectedProfile.rules.length.toLocaleString(locale) })}</p></div>
        <div className="security-vendor-source-groups"><section><strong>{t("security.vendor.liveSources")}</strong><div>{selectedProfile.liveSources.map((source) => <span key={source}>{sourceLabel(source, language)}</span>)}</div></section><section><strong>{t("security.vendor.snapshotSources")}</strong><div>{selectedProfile.snapshotSources.map((source) => <span key={source}>{sourceLabel(source, language)}</span>)}</div></section></div>
      </section> : null}
      <div className="security-findings-summary">
        <article className="is-open"><span><ShieldAlert size={18} /></span><div><small>{t("security.metrics.open")}</small><strong>{open.toLocaleString(locale)}</strong></div></article>
        <article className="is-critical"><span><ShieldAlert size={18} /></span><div><small>{t("security.severity.critical")}</small><strong>{critical.toLocaleString(locale)}</strong></div></article>
        <article className="is-high"><span><ShieldAlert size={18} /></span><div><small>{t("security.severity.high")}</small><strong>{high.toLocaleString(locale)}</strong></div></article>
        <article className="is-filtered"><span><ShieldCheck size={18} /></span><div><small>{t("security.findings.visible")}</small><strong>{filtered.length.toLocaleString(locale)}</strong></div></article>
      </div>
      <section className="security-findings-toolbar" aria-label={t("security.findings.filters")}>
        <label className="security-findings-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("security.findings.searchPlaceholder")} /></label>
        <div className="security-severity-filters">{["all", "critical", "high", "medium", "low"].map((item) => <button key={item} type="button" aria-pressed={severity === item} onClick={() => setSeverity(item)}>{item === "all" ? t("security.filters.allSeverities") : t(`security.severity.${item}`)}</button>)}</div>
        <label className="security-status-filter"><span>{t("security.filters.status")}</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">{t("security.filters.open")}</option><option value="all">{t("security.filters.allStatuses")}</option><option value="investigating">{t("security.findingStatus.investigating")}</option><option value="acknowledged">{t("security.findingStatus.acknowledged")}</option><option value="resolved">{t("security.findingStatus.resolved")}</option></select></label>
      </section>
      {filtered.length ? <FindingTable findings={filtered} profiles={profiles} /> : <div className="security-page-empty"><ShieldCheck size={34} />{scopedFindings.length ? <><h2>{t("security.findings.emptyTitle")}</h2><p>{t("security.findings.emptyDescription")}</p><button type="button" className="secondary-button" onClick={() => { setSeverity("all"); setStatus("all"); setQuery(""); }}>{t("security.findings.clearFilters")}</button></> : selectedDevice !== "all" ? <><h2>{t("security.findings.deviceEmptyTitle")}</h2><p>{t("security.findings.deviceEmptyDescription")}</p></> : <><h2>{t("security.findings.vendorEmptyTitle", { vendor: vendorLabel(selectedVendor, profiles) })}</h2><p>{t("security.findings.vendorEmptyDescription", { vendor: vendorLabel(selectedVendor, profiles) })}</p></>}</div>}
    </section>
  );
}
