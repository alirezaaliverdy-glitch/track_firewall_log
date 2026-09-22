import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeviceVerificationPanel } from "@/features/assets/components/DeviceVerificationPanel";
import { DeviceConnectionChannels } from "@/features/assets/components/DeviceConnectionChannels";
import { CiscoAssetDashboard } from "@/features/assets/components/CiscoAssetDashboard";
import { deleteDevice, testDeviceConnection, updateDevice, type DeviceInput } from "@/lib/devices";
import { getDeviceWorkspace, type DeviceWorkspace, type WorkspaceChartPoint } from "@/lib/deviceOnboarding";
import { refreshDeviceVendorCapabilities } from "@/lib/vendors";
import { refreshLinuxMonitoringDevice } from "@/lib/linuxMonitoring";
import { Activity, AlertTriangle, ArrowUpLeft, CheckCircle2, Clock3, Database, Gauge, Network, RefreshCw, Server, ShieldCheck } from "lucide-react";
import "./AssetDetailPage.css";
import "./AssetDetailOverview.css";
import "../components/CiscoAssetDashboard.css";

const sections = [
  { key: "overview", labelKey: "workspace.tabs.overview" },
  { key: "interfaces", labelKey: "workspace.tabs.interfaces" },
  { key: "configuration", labelKey: "workspace.tabs.configuration" },
  { key: "actions", labelKey: "workspace.tabs.actions" },
  { key: "monitoring", labelKey: "workspace.tabs.monitoring" },
  { key: "history", labelKey: "workspace.tabs.history" }
] as const;

const primarySectionKeys = sections.map((item) => item.key);
const rangeHours = { "1h": 1, "6h": 6, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;

type PrimarySection = typeof sections[number]["key"];
type TimeRange = keyof typeof rangeHours;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function value(item: unknown, fallback: string) {
  return item === null || item === undefined || item === "" ? fallback : String(item);
}

function date(item: unknown, locale: string, fallback: string) {
  return item ? new Date(String(item)).toLocaleString(locale) : fallback;
}

function capabilityLabel(status: unknown, t: TFunction) {
  const key = String(status ?? "unknown").toLowerCase();
  const labels: Record<string, string> = {
    supported: t("workspace.values.supported"),
    read_only: t("workspace.values.readOnly"),
    write_supported: t("workspace.values.writeSupported"),
    not_configured: t("workspace.values.notConfigured"),
    not_supported: t("workspace.values.notSupported"),
    unknown: t("common.unknown"),
    requires_privilege: t("workspace.values.requiresPrivilege"),
    available: t("workspace.values.available"),
    collected: t("workspace.values.collected"),
    partial: t("workspace.values.partial"),
    failed: t("workspace.values.failed"),
    parser_partial: t("workspace.values.parserPartial"),
    command_failed: t("workspace.values.commandFailed")
  };
  return labels[key] ?? statusLabel(key, t);
}

function stateTone(status: unknown): "good" | "warning" | "danger" | "neutral" {
  const key = String(status ?? "unknown").toLowerCase();
  if (["supported", "read_only", "write_supported", "available", "collected", "verified", "online", "connected", "healthy"].includes(key)) return "good";
  if (["failed", "command_failed", "offline"].includes(key)) return "danger";
  if (["partial", "parser_partial", "requires_privilege", "not_configured", "unknown"].includes(key)) return "warning";
  return "neutral";
}

function summarizeHealth(health: Record<string, unknown>, fallback: string) {
  const parts = [
    health.cpuLoad ? `CPU ${String(health.cpuLoad)}` : "",
    health.memoryFree ? `Memory ${String(health.memoryFree)}` : "",
    health.cpu && typeof health.cpu === "object" ? `CPU ${String(asRecord(health.cpu).fiveSeconds ?? asRecord(health.cpu).oneMinute ?? fallback)}` : "",
    health.memory && typeof health.memory === "object" ? `Memory ${String(asRecord(health.memory).usedPercent ?? asRecord(health.memory).used ?? fallback)}` : "",
    health.flash && typeof health.flash === "object" ? `Flash ${String(asRecord(health.flash).free ?? asRecord(health.flash).freeBytes ?? fallback)}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}
function statusLabel(status: unknown, t: TFunction) {
  const valueText = String(status ?? "unknown");
  const known: Record<string, string> = {
    online: t("workspace.status.online", { defaultValue: "Online" }),
    offline: t("workspace.status.offline", { defaultValue: "Offline" }),
    unknown: t("common.unknown"),
    verified: t("workspace.values.verified"),
    unverified: t("workspace.values.pendingVerification"),
    active: t("workspace.status.active", { defaultValue: "Active" }),
    connected: t("workspace.status.connected"),
    needs_review: t("workspace.status.needsReview"),
    not_verified: t("workspace.status.notVerified"),
    connection_verified: t("workspace.status.connectionVerified"),
    platform_detected: t("workspace.status.platformDetected"),
    discovery_completed: t("workspace.status.discoveryCompleted"),
    preview_ready: t("workspace.status.previewReady")
  };
  return known[valueText] ?? valueText;
}

function interfaceState(row: Record<string, unknown>) {
  const operational = String(row.operationalStatus ?? row.protocolStatus ?? row.status ?? row.state ?? "unknown").toLowerCase();
  const administrative = String(row.administrativeStatus ?? row.adminStatus ?? "unknown").toLowerCase();
  return {
    operational: operational === "up" || operational === "connected" ? "up" : operational === "down" || operational === "notconnect" ? "down" : "unknown",
    administrative: administrative === "up" ? "up" : administrative.includes("down") || administrative === "disabled" ? "down" : "unknown"
  } as const;
}

function TrendChart({ title, points, empty, binary = false, locale }: { title: string; points: WorkspaceChartPoint[]; empty: string; binary?: boolean; locale: string }) {
  if (!points.length) return <article className="workspace-chart is-empty"><h3>{title}</h3><p>{empty}</p></article>;
  const width = 420;
  const height = 140;
  const values = points.map((item) => item.value);
  const min = binary ? 0 : Math.min(...values);
  const max = binary ? 1 : Math.max(...values);
  const spread = Math.max(1, max - min);
  const polyline = points.map((item, index) => `${points.length === 1 ? width / 2 : index * width / (points.length - 1)},${height - 12 - ((item.value - min) / spread) * (height - 24)}`).join(" ");
  const latest = points.at(-1);
  return <article className="workspace-chart"><div><h3>{title}</h3><span>{latest?.value}{latest?.unit ?? ""}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}><polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><p>{latest?.label ?? date(latest?.timestamp, locale, empty)}</p></article>;
}

export default function AssetDetailPage({ params }: RouteComponentProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("fa") ? "fa-IR" : "en-US";
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const reference = params.deviceId || params.assetId;
  const requestedSection = params.section || "overview";
  const section = (primarySectionKeys.includes(requestedSection as PrimarySection) ? requestedSection : "overview") as PrimarySection;
  const [workspace, setWorkspace] = useState<DeviceWorkspace | null>(null);
  const [error, setError] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [form, setForm] = useState({ name: "", host: "", managementPort: "22", protocol: "ssh", environment: "lab", tags: "" });
  const load = useCallback(() => getDeviceWorkspace(reference).then((nextWorkspace) => { setWorkspace(nextWorkspace); setError(""); }).catch((failure: Error) => setError(failure.message)), [reference]);
  useEffect(() => { void load(); }, [load]);
  if (!workspace && !error) return <LoadingState />;
  if (error || !workspace) return <ErrorState message={error || t("workspace.notFound")} onRetry={load} />;

  const currentWorkspace = workspace;
  const deviceId = workspace.device?.id || reference;
  const overview = workspace.overview;
  const fallback = t("common.notCollected");
  const facts = asRecord(currentWorkspace.capabilities?.facts);
  const detection = asRecord(currentWorkspace.capabilities?.detection);
  const capabilityMap = asRecord(currentWorkspace.capabilities?.capabilities);
  const capabilityList = asArray(currentWorkspace.capabilities?.capabilities).map(asRecord);
  const collection = asRecord(facts.collection);
  const healthFacts = asRecord(facts.health);
  const interfaces = asArray(facts.interfaces).length ? asArray(facts.interfaces) : asArray(facts.interfaceStatus).length ? asArray(facts.interfaceStatus) : asArray(capabilityMap.interfaces);
  const capabilityStatus = collection.capabilityStatus ?? (capabilityList.length ? "available" : "unknown");
  const healthSummary = summarizeHealth(healthFacts, fallback);
  const interfaceStates = interfaces.map((item) => interfaceState(asRecord(item)));
  const interfaceUpCount = interfaceStates.filter((item) => item.operational === "up").length;
  const interfaceDownCount = interfaceStates.filter((item) => item.operational === "down").length;
  const verifiedDevice = overview.verificationStatus === "verified" || overview.availability === "online";
  const since = Date.now() - rangeHours[timeRange] * 60 * 60 * 1000;
  const chart = (points: WorkspaceChartPoint[]) => points.filter((item) => new Date(item.timestamp).getTime() >= since);

  const startEditing = () => {
    if (!workspace.device) return;
    setForm({ name: workspace.device.name, host: workspace.device.host, managementPort: String(workspace.device.managementPort), protocol: workspace.device.protocol, environment: workspace.device.environment, tags: workspace.device.tags.join(", ") });
    setEditing(true); setError("");
  };

  const saveDevice = async () => {
    if (!workspace.device || !form.name.trim() || !form.host.trim() || !Number.isInteger(Number(form.managementPort))) return;
    setSaving(true); setError("");
    try {
      await updateDevice(workspace.device.id, { name: form.name.trim(), host: form.host.trim(), managementPort: Number(form.managementPort), protocol: form.protocol as DeviceInput["protocol"], environment: form.environment as DeviceInput["environment"], tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean) });
      await load(); setEditing(false);
    } catch { setError(t("workspace.errors.editFailed")); }
    finally { setSaving(false); }
  };

  const collectLiveData = async () => {
    if (!workspace.device) return;
    setCollecting(true); setError("");
    try {
      if (currentWorkspace.vendor.key === "cisco") {
        await refreshDeviceVendorCapabilities(workspace.device.id);
      } else {
        const result = await testDeviceConnection(workspace.device.id);
        if (result.connected !== true) throw new Error(result.message || t("onboarding.errors.connectionFailed"));
        if (currentWorkspace.vendor.key === "linux") await refreshLinuxMonitoringDevice(workspace.device.id);
      }
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("onboarding.errors.connectionFailed"));
    } finally {
      setCollecting(false);
    }
  };

  const removeDevice = async () => {
    if (!workspace.device || deleteName.trim() !== workspace.device.name) return;
    setSaving(true); setError("");
    try { await deleteDevice(workspace.device.id); navigate("/assets/devices", { replace: true }); }
    catch { setError(t("workspace.errors.deleteFailed")); setSaving(false); }
  };

  function AdvancedWorkspaceDetails() {
    const warnings = asArray(currentWorkspace.capabilities?.warnings);
    const hasDiagnostics = warnings.length > 0 || capabilityList.length > 0;
    return <details className="content-panel overview-advanced"><summary>{t("workspace.advanced.title")}</summary><dl className="detail-list"><dt>{t("workspace.labels.connector")}</dt><dd dir="ltr">{value(overview.connectorType, fallback)}</dd>{capabilityList.length ? <><dt>{t("workspace.labels.capabilityStatus")}</dt><dd>{capabilityLabel(capabilityStatus, t)}</dd></> : null}{currentWorkspace.collections.length ? <><dt>{t("workspace.labels.collectionHistory")}</dt><dd>{String(currentWorkspace.collections.length)}</dd></> : null}{overview.lastSuccessfulCollection || currentWorkspace.capabilities?.refreshedAt ? <><dt>{t("workspace.labels.lastSuccessfulCheck")}</dt><dd>{date(overview.lastSuccessfulCollection ?? currentWorkspace.capabilities?.refreshedAt, locale, fallback)}</dd></> : null}</dl><div className="button-row"><button className="secondary-button" type="button" disabled={collecting} onClick={() => void collectLiveData()}>{collecting ? t("common.loading") : t("workspace.actions.collectData")}</button><Link className="secondary-link" to={`/assets/devices/${deviceId}/monitoring`}>{t("workspace.actions.refreshHealth")}</Link></div>{currentWorkspace.vendor.sections.length ? <section><h3>{t("workspace.advanced.vendorSections")}</h3>{currentWorkspace.vendor.sections.map((item) => { const state = item.capabilityState ?? item.state; return <div className="list-row" key={item.key}><span>{isFa ? item.titleFa : item.titleEn}</span><StatusBadge value={capabilityLabel(state, t)} tone={stateTone(state)} /></div>; })}</section> : null}{hasDiagnostics ? <details><summary>{t("workspace.advanced.rawDiagnostics")}</summary><pre dir="ltr">{JSON.stringify({ platform: overview.platform, warnings, capabilities: capabilityList }, null, 2)}</pre></details> : null}</details>;
  }

  function OverviewFirstViewport() {
    const setupPath = `/assets/devices/${deviceId}/setup`;
    const nextPath = verifiedDevice ? `/actions?deviceId=${encodeURIComponent(deviceId)}` : setupPath;
    const optionalIdentity = ([
      [t("workspace.labels.hostname"), detection.hostname ?? facts.hostname ?? currentWorkspace.asset?.hostname],
      [t("workspace.labels.model"), detection.model ?? facts.model],
      [t("workspace.labels.serialNumber"), facts.serialNumber ?? facts.serial ?? detection.serialNumber],
      [t("workspace.labels.softwareVersion"), overview.version ?? facts.iosVersion ?? facts.version],
      [t("workspace.labels.uptime"), facts.uptime]
    ] as Array<[string, unknown]>).filter(([, item]) => item !== null && item !== undefined && item !== "");
    const isCisco = currentWorkspace.vendor.key === "cisco";
    const vendorOverview = currentWorkspace.vendorOverview;
    const latestFailedCollection = currentWorkspace.collections.find((item) => ["failed", "error"].includes(String(item.status).toLowerCase()));
    const latestFailedCheck = currentWorkspace.statusChecks.find((item) => ["failed", "offline", "error"].includes(String(item.status).toLowerCase()));
    const diagnosticReasons = Array.from(new Set([
      ...asArray(asRecord(currentWorkspace.health ?? {}).warningsJson).map(String),
      ...asArray(currentWorkspace.capabilities?.warnings).map(String),
      latestFailedCollection?.errorCode ? `${isFa ? "خطای جمع‌آوری" : "Collection error"}: ${String(latestFailedCollection.errorCode)}` : "",
      latestFailedCheck?.message ? String(latestFailedCheck.message) : ""
    ].map((item) => item.trim()).filter(Boolean)));
    const needsAttention = !["healthy", "online"].includes(String(overview.healthState).toLowerCase()) || diagnosticReasons.length > 0;
    const openFindings = currentWorkspace.findings.filter((item) => !["resolved", "closed", "false_positive"].includes(String(item.status ?? "open")));
    const dataTime = vendorOverview.collectedAt ?? overview.lastSuccessfulCollection ?? currentWorkspace.capabilities?.refreshedAt;
    return <section className="asset-device-overview">
      <section className={`asset-device-overview__hero is-${stateTone(overview.healthState)}`}>
        <div className="asset-device-overview__identity"><span><Server aria-hidden="true" /></span><div><small>{isFa ? "نمای کلی تجهیز" : "Device overview"}</small><h2>{overview.name}</h2><p dir="ltr">{overview.vendor} · {overview.platform} · {value(overview.managementIp ?? currentWorkspace.device?.host, fallback)}</p></div></div>
        <div className="asset-device-overview__live"><span><i />{verifiedDevice ? (isFa ? "اتصال تأییدشده" : "Verified connection") : (isFa ? "اتصال نیازمند بررسی" : "Connection needs review")}</span><small><Clock3 />{date(dataTime, locale, isFa ? "هنوز جمع‌آوری نشده" : "Not collected yet")}</small><button type="button" disabled={collecting} onClick={() => void collectLiveData()}>{collecting ? <RefreshCw className="is-spinning" /> : <RefreshCw />}{collecting ? (isFa ? "در حال جمع‌آوری" : "Collecting") : (isFa ? "جمع‌آوری جدید" : "Collect now")}</button></div>
      </section>

      {needsAttention ? <section className="asset-diagnostic-callout"><AlertTriangle aria-hidden="true" /><div><strong>{isFa ? "چرا این تجهیز نیازمند توجه است؟" : "Why does this device need attention?"}</strong>{diagnosticReasons.length ? <ul>{diagnosticReasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>{value(asRecord(currentWorkspace.health ?? {}).summary, isFa ? "وضعیت سلامت یا تازگی داده نیازمند بررسی است. یک جمع‌آوری جدید اجرا کنید." : "Health state or evidence freshness needs review. Run a new collection.")}</p>}<small>{isFa ? "جمع‌آوری جدید را اجرا کنید؛ اگر خطا باقی ماند، کانال اتصال و زمان آخرین موفقیت را بررسی کنید." : "Run a new collection; if the issue remains, review the channel and its last success time."}</small></div><Link to={`/assets/devices/${deviceId}/monitoring`}>{isFa ? "جزئیات سلامت" : "Health details"}<ArrowUpLeft /></Link></section> : null}

      <section className="asset-overview-kpis" aria-label={isFa ? "خلاصه وضعیت" : "Status summary"}>
        <article><span><ShieldCheck /></span><div><small>{isFa ? "وضعیت اتصال" : "Connection"}</small><strong>{statusLabel(overview.availability, t)}</strong></div></article>
        <article><span><Gauge /></span><div><small>{isFa ? "امتیاز سلامت" : "Health score"}</small><strong>{overview.healthScore === null ? "—" : `${overview.healthScore}%`}</strong></div></article>
        <article><span><AlertTriangle /></span><div><small>{isFa ? "یافته باز" : "Open findings"}</small><strong>{openFindings.length.toLocaleString(locale)}</strong></div></article>
        <article><span><Activity /></span><div><small>{isFa ? "اقدام در انتظار" : "Pending actions"}</small><strong>{overview.pendingActions.toLocaleString(locale)}</strong></div></article>
        <article><span><Database /></span><div><small>{isFa ? "منبع داده" : "Data source"}</small><strong>{vendorOverview.sections.length ? (isFa ? "Connector واقعی" : "Verified connector") : (isFa ? "فقط موجودی" : "Inventory only")}</strong></div></article>
      </section>

      <DeviceConnectionChannels deviceId={deviceId} channels={currentWorkspace.connections} isFa={isFa} locale={locale} onRefresh={load} />

      <section className="asset-overview-main-grid">
        <article className="asset-identity-card"><header><span><Server /></span><div><small>{isFa ? "هویت و مدیریت" : "Identity and management"}</small><h3>{t("workspace.cards.identity")}</h3></div></header><dl><div><dt>{t("workspace.labels.name")}</dt><dd>{overview.name}</dd></div><div><dt>{t("workspace.labels.vendorPlatform")}</dt><dd dir="ltr">{overview.vendor} / {overview.platform}</dd></div><div><dt>{t("workspace.labels.managementAddress")}</dt><dd dir="ltr">{value(overview.managementIp ?? currentWorkspace.device?.host, fallback)}</dd></div>{optionalIdentity.map(([label, item]) => <div key={String(label)}><dt>{label}</dt><dd dir="ltr">{String(item)}</dd></div>)}</dl></article>
        <article className="asset-health-card"><header><span><CheckCircle2 /></span><div><small>{isFa ? "سلامت و پوشش" : "Health and coverage"}</small><h3>{isFa ? "وضعیت قابل اقدام" : "Actionable status"}</h3></div></header><dl><div><dt>{t("workspace.labels.healthState")}</dt><dd>{statusLabel(overview.healthState, t)}</dd></div><div><dt>{t("workspace.labels.lastSuccessfulCheck")}</dt><dd>{date(dataTime, locale, fallback)}</dd></div><div><dt>{isFa ? "دامنه‌های خوانده‌شده" : "Collected domains"}</dt><dd>{vendorOverview.sections.length.toLocaleString(locale)}</dd></div><div><dt>{isFa ? "اینترفیس" : "Interfaces"}</dt><dd>{interfaces.length.toLocaleString(locale)}</dd></div></dl>{healthSummary !== fallback ? <p dir="ltr">{healthSummary}</p> : null}</article>
      </section>

      <section className="asset-vendor-overview">
        <header><div><span><Network /></span><div><small>{isFa ? "اطلاعات واقعی و نرمال‌شده" : "Verified normalized data"}</small><h2>{isFa ? `نمای کامل ${overview.vendor}` : `${overview.vendor} overview`}</h2><p>{isFa ? "اطلاعاتی که آخرین Connector موفق از دستگاه خوانده است." : "Information read by the latest successful connector collection."}</p></div></div><time><Clock3 />{date(dataTime, locale, fallback)}</time></header>
        {vendorOverview.summary.length ? <div className="asset-vendor-facts">{vendorOverview.summary.map((item) => <article key={item.key}><small>{isFa ? item.labelFa : item.labelEn}</small><strong dir="auto">{item.value}</strong></article>)}</div> : null}
        {vendorOverview.sections.length ? <div className="asset-vendor-sections">{vendorOverview.sections.map((vendorSection, index) => <details key={vendorSection.key} open={index === 0}><summary><span>{isFa ? vendorSection.titleFa : vendorSection.titleEn}</span><b>{vendorSection.count.toLocaleString(locale)}</b></summary><div>{vendorSection.items.map((item, itemIndex) => <article key={`${vendorSection.key}-${itemIndex}`}><strong dir="auto">{item.title}</strong>{item.fields.length ? <dl>{item.fields.map((field) => <div key={field.key}><dt>{field.key}</dt><dd dir="auto">{field.value}</dd></div>)}</dl> : null}</article>)}</div></details>)}</div> : <div className="asset-vendor-empty"><Database /><strong>{isFa ? "هنوز داده جامع وندور جمع‌آوری نشده است" : "No comprehensive vendor data yet"}</strong><p>{isFa ? "«جمع‌آوری جدید» را بزنید تا اطلاعات واقعی از دستگاه خوانده شود." : "Use Collect now to read verified data from the device."}</p></div>}
      </section>

      {isCisco && currentWorkspace.vendorDetails ? <details className="asset-cisco-expanded"><summary>{isFa ? "نمای تخصصی Cisco" : "Cisco technical view"}</summary><CiscoAssetDashboard details={currentWorkspace.vendorDetails} deviceId={deviceId} availability={overview.availability} lastCollected={dataTime} collecting={collecting} isFa={isFa} onCollect={() => void collectLiveData()} /></details> : null}

      <section className="asset-overview-actions"><div><h2>{t("workspace.cards.nextAction")}</h2><p>{verifiedDevice ? t("workspace.next.verified") : t("workspace.next.unverified")}</p></div><div><Link className="primary-link" to={nextPath}>{verifiedDevice ? t("workspace.actions.openActionCenter") : t("workspace.actions.testConnection")}</Link>{interfaces.length ? <Link className="secondary-link" to={`/assets/devices/${deviceId}/interfaces`}>{isFa ? "مشاهده اینترفیس‌ها" : "View interfaces"}</Link> : null}{isCisco ? <Link className="secondary-link" to={`/actions?deviceId=${encodeURIComponent(deviceId)}&catalog=cisco_run_backup`}>{t("workspace.actions.runBackup")}</Link> : null}</div></section>
      <AdvancedWorkspaceDetails />
    </section>;
  }

  function WorkspaceCharts() {
    const changes = currentWorkspace.charts.recentChanges.filter((item) => new Date(item.timestamp).getTime() >= since);
    return <section className="workspace-analytics" aria-label={t("workspace.chart.ranges")}><div className="workspace-range"><span>{t("workspace.chart.ranges")}</span>{(Object.keys(rangeHours) as TimeRange[]).map((item) => <button type="button" key={item} aria-pressed={timeRange === item} onClick={() => setTimeRange(item)}>{item}</button>)}</div><div className="workspace-chart-grid"><TrendChart title={t("workspace.chart.health")} points={chart(currentWorkspace.charts.healthScore)} empty={t("workspace.empty.verifiedData")} locale={locale} /><TrendChart title={t("workspace.chart.connector")} points={chart(currentWorkspace.charts.connectorResults)} empty={t("workspace.empty.verifiedData")} binary locale={locale} /><TrendChart title={t("workspace.chart.availability")} points={chart(currentWorkspace.charts.availability)} empty={t("workspace.empty.verifiedData")} binary locale={locale} /><TrendChart title={t("workspace.chart.resources")} points={chart(currentWorkspace.charts.resources)} empty={t("workspace.empty.verifiedData")} locale={locale} /><TrendChart title={t("workspace.chart.findings")} points={chart(currentWorkspace.charts.findings)} empty={t("workspace.empty.verifiedData")} locale={locale} /><TrendChart title={t("workspace.chart.actions")} points={chart(currentWorkspace.charts.actions)} empty={t("workspace.empty.verifiedData")} binary locale={locale} /></div><div className="content-panel"><h2>{t("workspace.chart.changes")}</h2>{changes.length ? changes.slice(-8).reverse().map((item) => <div className="list-row" key={`${item.timestamp}-${item.label}`}>{item.label}<span>{date(item.timestamp, locale, fallback)}</span></div>) : <p>{t("workspace.empty.verifiedData")}</p>}</div></section>;
  }

  const content = (() => {
    if (section === "overview") return <OverviewFirstViewport />;
    if (section === "interfaces") return <div className="content-grid"><section className="content-panel cisco-interface-panel"><header><div><h2>{t("workspace.interfaces.title")}</h2><p>{isFa ? `${interfaces.length} اینترفیس؛ ${interfaceUpCount} لینک فعال و ${interfaceDownCount} لینک قطع` : `${interfaces.length} interfaces; ${interfaceUpCount} links up and ${interfaceDownCount} links down`}</p></div><Link className="secondary-link" to={`/assets/topology?deviceId=${encodeURIComponent(deviceId)}`}>{isFa ? "نمای گرافیکی پورت‌ها" : "Graphical port view"}</Link></header>{interfaces.length ? <div className="cisco-interface-list">{interfaces.slice(0, 128).map((item, index) => { const row = asRecord(item); const state = interfaceState(row); const address = row.ipAddress ?? asArray(row.ipAddresses)[0]; const portMeta = [row.vlan ? `VLAN ${row.vlan}` : "", row.speed ? `${row.speed} Mbps` : "", row.duplex ? String(row.duplex) : ""].filter(Boolean).join(" · "); return <article className={`cisco-interface-row is-${state.operational}`} key={String(row.name ?? row.interface ?? index)}><i aria-hidden="true" /><div><strong dir="ltr">{value(row.name ?? row.interface ?? row.id, fallback)}</strong><small>{value(row.description, isFa ? "بدون توضیح" : "No description")}</small><small dir="ltr">{value(address, isFa ? "بدون IP" : "No IP")}</small>{portMeta ? <small dir="ltr">{portMeta}</small> : null}</div><span><small>{isFa ? "لینک" : "Link"}</small><b>{state.operational === "up" ? (isFa ? "فعال" : "Up") : state.operational === "down" ? (isFa ? "قطع" : "Down") : (isFa ? "نامشخص" : "Unknown")}</b></span><span><small>{isFa ? "مدیریتی" : "Admin"}</small><b>{state.administrative === "up" ? (isFa ? "روشن" : "Up") : state.administrative === "down" ? (isFa ? "خاموش" : "Down") : (isFa ? "نامشخص" : "Unknown")}</b></span></article>; })}</div> : <p>{t("workspace.empty.interfaces")}</p>}</section><AdvancedWorkspaceDetails /></div>;
    if (section === "configuration") return <div className="content-grid"><section className="content-panel"><h2>{t("workspace.configuration.title")}</h2><dl className="detail-list"><dt>{t("workspace.labels.configState")}</dt><dd>{value(overview.configBackup.state, fallback)}</dd><dt>{t("workspace.labels.lastBackup")}</dt><dd>{date(overview.configBackup.collectedAt, locale, fallback)}</dd></dl></section><section className="content-panel"><h2>{t("workspace.configuration.connectionTitle")}</h2><p>{t("workspace.values.credentialReference")}</p><dl className="detail-list"><dt>{t("workspace.labels.managementAddress")}</dt><dd dir="ltr">{value(currentWorkspace.device?.host ?? overview.managementIp, fallback)}</dd><dt>{t("workspace.labels.protocol")}</dt><dd>{value(currentWorkspace.device?.protocol, fallback)}</dd><dt>{t("workspace.labels.environment")}</dt><dd>{value(currentWorkspace.device?.environment, fallback)}</dd></dl><Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>{t("workspace.actions.openSetup")}</Link></section></div>;
    if (section === "actions") return <div className="content-grid"><section className="content-panel"><h2>{t("workspace.actions.title")}</h2>{currentWorkspace.actions.length ? currentWorkspace.actions.map((item) => <Link className="list-row" key={String(item.id)} to={`/actions/${item.id}`}>{value(item.actionType, fallback)}<span>{value(item.status, fallback)}</span></Link>) : <p>{t("workspace.empty.actions")}</p>}<Link className="primary-link" to={`/actions?deviceId=${encodeURIComponent(deviceId)}`}>{t("workspace.actions.reviewOrCreate")}</Link></section><section className="content-panel"><h2>{t("workspace.chart.findings")}</h2>{currentWorkspace.findings.length ? currentWorkspace.findings.map((item) => <div className="list-row" key={String(item.id)}>{value(item.title, fallback)}<span>{value(item.severity, fallback)}</span></div>) : <p>{t("workspace.empty.findings")}</p>}</section></div>;
    if (section === "monitoring") return <><div className="content-grid"><section className="content-panel"><h2>{t("workspace.monitoring.title")}</h2><dl className="detail-list"><dt>{t("workspace.labels.healthScore")}</dt><dd>{value(overview.healthScore, fallback)}</dd><dt>{t("workspace.labels.healthState")}</dt><dd>{value(overview.healthState, fallback)}</dd><dt>{t("workspace.labels.lastContact")}</dt><dd>{date(overview.lastContact, locale, fallback)}</dd><dt>{t("workspace.labels.lastSuccessfulCheck")}</dt><dd>{date(overview.lastSuccessfulCollection, locale, fallback)}</dd></dl></section><section className="content-panel"><h2>{t("workspace.cards.connection")}</h2>{currentWorkspace.statusChecks.length ? currentWorkspace.statusChecks.slice(0, 10).map((item) => <div className="list-row" key={String(item.id)}>{value(item.status, fallback)}<span>{date(item.checkedAt, locale, fallback)}</span></div>) : <p>{t("workspace.empty.statusChecks")}</p>}</section></div>{workspace.device ? <DeviceVerificationPanel deviceId={deviceId} /> : null}<WorkspaceCharts /></>;
    return <div className="content-grid"><section className="content-panel"><h2>{t("workspace.history.auditTitle")}</h2>{currentWorkspace.audit.length ? currentWorkspace.audit.map((item) => <div className="list-row" key={String(item.id)}>{value(item.action, fallback)}<span>{date(item.createdAt, locale, fallback)}</span></div>) : <p>{t("workspace.empty.audit")}</p>}</section><section className="content-panel"><h2>{t("workspace.history.collectionTitle")}</h2>{currentWorkspace.collections.length ? currentWorkspace.collections.map((item) => <div className="list-row" key={String(item.id)}>{value(item.provider, fallback)}<span>{value(item.status, fallback)}</span></div>) : <p>{t("workspace.empty.collections")}</p>}</section></div>;
  })();

  return (
    <section className="page-stack asset-detail-page">
      <PageHeader title={overview.name} eyebrow={t("workspace.eyebrow")} description={`${overview.vendor} / ${overview.platform}`} actions={<><Link className="secondary-link" to="/assets/devices">{t("workspace.backToDevices")}</Link>{workspace.device && <button className="secondary-button" type="button" onClick={startEditing}>{t("workspace.editDevice")}</button>}<Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>{t("workspace.setupConnection")}</Link>{workspace.device && <button className="danger-button" type="button" onClick={() => { setDeleteOpen(true); setDeleteName(""); }}>{t("workspace.deleteDevice")}</button>}</>} />
      {editing && workspace.device && <section className="content-panel device-edit-panel" aria-label={t("workspace.edit.aria")}><header><div><p className="operator-eyebrow">{t("workspace.edit.eyebrow")}</p><h2>{t("workspace.edit.title")}</h2></div><button className="secondary-button" type="button" onClick={() => setEditing(false)}>{t("workspace.actions.closeEdit")}</button></header><div className="device-edit-grid"><label>{t("workspace.labels.name")}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>{t("workspace.labels.managementAddress")}<input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} required dir="ltr" /></label><label>{t("onboarding.fields.port")}<input type="number" min="1" max="65535" value={form.managementPort} onChange={(event) => setForm({ ...form, managementPort: event.target.value })} required /></label><label>{t("workspace.labels.protocol")}<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })}><option value="ssh">SSH</option><option value="api">API</option><option value="syslog">Syslog</option><option value="agent">Agent</option></select></label><label>{t("workspace.labels.environment")}<select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}><option value="lab">Lab</option><option value="production">Production</option><option value="staging">Staging</option></select></label><label>{t("workspace.labels.tags")}<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="linux, edge" /></label></div><div className="button-row"><button className="primary-button" type="button" disabled={saving || !form.name.trim() || !form.host.trim()} onClick={() => void saveDevice()}>{saving ? t("common.saving") : t("common.saveChanges")}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setEditing(false)}>{t("common.cancel")}</button></div></section>}
      {deleteOpen && workspace.device && <section className="destructive-confirm" role="alertdialog" aria-label={t("workspace.delete.aria")}><strong>{t("workspace.delete.title", { name: workspace.device.name })}</strong><p>{t("workspace.delete.body")}</p><label>{t("workspace.labels.name")}<input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" /></label><div className="button-row"><button className="danger-button" type="button" disabled={saving || deleteName.trim() !== workspace.device.name} onClick={() => void removeDevice()}>{saving ? t("common.deleting") : t("workspace.actions.confirmDelete")}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</button></div></section>}
      <div className="summary-grid"><article><span>{t("workspace.labels.connectionStatus")}</span><StatusBadge value={statusLabel(overview.availability, t)} tone={overview.availability === "online" ? "good" : "warning"} /></article><article><span>{t("workspace.labels.managementAddress")}</span><strong dir="ltr">{value(overview.managementIp, fallback)}</strong></article><article><span>{t("workspace.labels.connector")}</span><strong>{value(overview.connectorType, fallback)}</strong></article><article><span>{t("workspace.labels.lastContact")}</span><strong>{date(overview.lastContact, locale, fallback)}</strong></article></div>
      <nav className="workspace-tabs" aria-label={t("workspace.tabs.label")}>{sections.map((item) => <Link key={item.key} aria-current={section === item.key ? "page" : undefined} to={`/assets/devices/${deviceId}/${item.key}`}>{t(item.labelKey)}</Link>)}</nav>
      {content}
    </section>
  );
}
