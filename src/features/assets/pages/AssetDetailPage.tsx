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
import { EsxiHostOverview } from "@/features/assets/components/EsxiHostOverview";
import { deleteDevice, testDeviceConnection, updateDevice, type DeviceInput } from "@/lib/devices";
import { getDeviceWorkspace, type DeviceWorkspace, type WorkspaceChartPoint } from "@/lib/deviceOnboarding";
import { refreshDeviceVendorCapabilities } from "@/lib/vendors";
import { refreshLinuxMonitoringDevice } from "@/lib/linuxMonitoring";
import { Activity, AlertTriangle, ArrowUpLeft, CheckCircle2, Clock3, Database, Gauge, Network, RefreshCw, Server, ShieldCheck } from "lucide-react";
import "./AssetDetailPage.css";
import "./AssetDetailOverview.css";
import "../components/CiscoAssetDashboard.css";

import { AssetChartPlot, orderedReadings } from "../components/AssetChartPlot";
import { AssetHistory } from "../components/AssetHistory";
import { AssetLiveCharts } from "../components/AssetLiveCharts";
import "./AssetWorkspace.css";
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

function diagnosticLabel(message: string, isFa: boolean, port?: number) {
  if (!isFa) return message;
  if (/SSH_(BANNER|HANDSHAKE)_TIMEOUT/.test(message)) return `SSH روی پورت ${port ?? 22} به‌موقع پاسخ نداده؛ محدودیت فایروال یا وضعیت سرویس را بررسی کنید.`;
  if (/SSH_AUTH_FAILED/.test(message)) return "ارتباط شبکه برقرار است اما اعتبارنامه SSH پذیرفته نشده است.";
  if (/SSH_SESSION_CLOSED/.test(message)) return "نشست پایش SSH قطع شده و برنامه در حال اتصال مجدد است.";
  if (/SSH_RECONNECT_BACKOFF/.test(message)) return "برنامه برای جلوگیری از محدودشدن توسط سرور، اتصال مجدد را با فاصله انجام می‌دهد.";
  return message;
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
  points = orderedReadings(points);
  if (!points.length) return <article className="workspace-chart is-empty"><h3>{title}</h3><p>{empty}</p></article>;
  const latest = points.at(-1);
  const reading = binary
    ? latest?.value === 1 ? (locale.startsWith("fa") ? "برقرار" : "Available") : latest?.value === 0 ? (locale.startsWith("fa") ? "قطع" : "Unavailable") : (locale.startsWith("fa") ? "نامشخص" : "Unknown")
    : `${latest?.value.toLocaleString(locale)}${latest?.unit === "percent" ? "%" : latest?.unit && latest.unit !== "count" ? ` ${latest.unit}` : ""}`;
  return <article className="workspace-chart"><div><h3>{title}</h3><span>{reading}</span></div><AssetChartPlot series={[{ points, label: title, color: "#69c9d5" }]} binary={binary} locale={locale} title={title} /><p>{date(latest?.timestamp, locale, empty)}</p></article>;
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
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !editing && !deleteOpen) void load();
    }, section === "history" ? 30_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [deleteOpen, editing, load, section]);
  if (!workspace && !error) return <LoadingState />;
  if (!workspace) return <ErrorState message={error || t("workspace.notFound")} onRetry={load} />;

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

  const supportsVendorCollection = ["cisco", "linux", "mikrotik", "fortigate", "sophos", "esxi"].includes(currentWorkspace.vendor.key);
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

  // Ordinary render helpers preserve DOM identity and open details across polling updates.
  function renderAdvancedWorkspaceDetails() {
    const warnings = asArray(currentWorkspace.capabilities?.warnings);
    const hasDiagnostics = warnings.length > 0 || capabilityList.length > 0;
    return <details className="content-panel overview-advanced"><summary>{t("workspace.advanced.title")}</summary><dl className="detail-list"><dt>{t("workspace.labels.connector")}</dt><dd dir="ltr">{value(overview.connectorType, fallback)}</dd>{capabilityList.length ? <><dt>{t("workspace.labels.capabilityStatus")}</dt><dd>{capabilityLabel(capabilityStatus, t)}</dd></> : null}{currentWorkspace.collections.length ? <><dt>{t("workspace.labels.collectionHistory")}</dt><dd>{String(currentWorkspace.collections.length)}</dd></> : null}{overview.lastSuccessfulCollection || currentWorkspace.capabilities?.refreshedAt ? <><dt>{t("workspace.labels.lastSuccessfulCheck")}</dt><dd>{date(overview.lastSuccessfulCollection ?? currentWorkspace.capabilities?.refreshedAt, locale, fallback)}</dd></> : null}</dl><div className="button-row"><button className="secondary-button" type="button" disabled={collecting} onClick={() => void collectLiveData()}>{collecting ? t("common.loading") : t("workspace.actions.collectData")}</button><Link className="secondary-link" to={`/assets/devices/${deviceId}/monitoring`}>{t("workspace.actions.refreshHealth")}</Link></div>{currentWorkspace.vendor.sections.length ? <section><h3>{t("workspace.advanced.vendorSections")}</h3>{currentWorkspace.vendor.sections.map((item) => { const state = item.capabilityState ?? item.state; return <div className="list-row" key={item.key}><span>{isFa ? item.titleFa : item.titleEn}</span><StatusBadge value={capabilityLabel(state, t)} tone={stateTone(state)} /></div>; })}</section> : null}{hasDiagnostics ? <details><summary>{t("workspace.advanced.rawDiagnostics")}</summary><pre dir="ltr">{JSON.stringify({ platform: overview.platform, warnings, capabilities: capabilityList }, null, 2)}</pre></details> : null}</details>;
  }

  function renderSensorReadings() {
    const readings = currentWorkspace.sensors ?? [];
    const now = Date.now();
    const connectionOffline = readings.some((item) => item.key === "reachability" && ["offline", "error", "degraded"].includes(String(item.value).toLowerCase()));
    const sensorValue = (reading: typeof readings[number]) => {
      if (reading.key === "firewall.enabled") return Number(reading.value) === 1 ? (isFa ? "فعال" : "Enabled") : (isFa ? "غیرفعال" : "Disabled");
      const statuses: Record<string, string> = isFa
        ? { online: "آنلاین", offline: "آفلاین", verified: "تأییدشده", completed: "موفق", failed: "ناموفق", error: "خطا", degraded: "ناپایدار" }
        : { online: "Online", offline: "Offline", verified: "Verified", completed: "Completed", failed: "Failed", error: "Error", degraded: "Degraded" };
      Object.assign(statuses, isFa
        ? { warning: "نیازمند توجه", healthy: "سالم", critical: "بحرانی", available: "در دسترس", configured: "تنظیم‌شده" }
        : { warning: "Needs attention", healthy: "Healthy", critical: "Critical", available: "Available", configured: "Configured" });
      if (typeof reading.value === "string") return statuses[reading.value.toLowerCase()] ?? reading.value;
      return `${reading.value.toLocaleString(locale)}${reading.unit === "percent" ? "%" : reading.unit && reading.unit !== "count" && reading.unit !== "boolean" ? ` ${reading.unit}` : ""}`;
    };
    return <section className="asset-sensor-panel" aria-label={isFa ? "سنسورهای تجهیز" : "Device sensors"}>
      <header><div><span className="asset-sensor-panel__icon"><Activity aria-hidden="true" /></span><div><small>{isFa ? "بر پایه داده واقعی" : "Measured evidence"}</small><h2>{isFa ? "وضعیت و سنسورها" : "Status and sensors"}</h2></div></div><Link to={`/assets/devices/${deviceId}/monitoring`}>{isFa ? "تاریخچه پایش" : "Monitoring history"}<ArrowUpLeft aria-hidden="true" /></Link></header>
      {readings.length ? <div className="asset-sensor-grid">{readings.map((reading) => {
        const measured = reading.measuredAt ? new Date(reading.measuredAt).getTime() : Number.NaN;
        const maxAge = ["reachability", "management"].includes(reading.key) ? 90_000 : 15 * 60_000;
        const stale = !Number.isFinite(measured) || now - measured > maxAge || (connectionOffline && !["reachability", "management"].includes(reading.key));
        return <article className={`asset-sensor is-${stale ? "stale" : reading.state === "attention" ? "attention" : "ok"}`} key={reading.key}>
          <div><span className="asset-sensor__dot" aria-hidden="true" /><small>{isFa ? reading.titleFa : reading.titleEn}</small></div>
          <strong dir="auto">{sensorValue(reading)}</strong>
          <time dateTime={reading.measuredAt ?? undefined}>{stale ? (isFa ? "داده قدیمی" : "Stale data") : (isFa ? "به‌روز" : "Current")} · {date(reading.measuredAt, locale, fallback)}</time>
        </article>;
      })}</div> : <div className="asset-sensor-empty"><Database aria-hidden="true" /><p>{isFa ? "هنوز نمونه معتبری ثبت نشده است. اتصال را بررسی و جمع‌آوری جدید اجرا کنید." : "No verified samples yet. Check the connection and collect data."}</p></div>}
      <footer><Link className="secondary-link" to={`/assets/devices/${deviceId}/setup`}>{isFa ? "بررسی اتصال" : "Check connection"}</Link><button className="secondary-button" type="button" disabled={collecting || !currentWorkspace.device} onClick={() => void collectLiveData()}>{collecting ? (isFa ? "در حال بررسی…" : "Checking…") : supportsVendorCollection ? (isFa ? "جمع‌آوری تازه" : "Collect now") : (isFa ? "تست اتصال" : "Test connection")}</button><Link className="primary-link" to={`/actions?deviceId=${encodeURIComponent(deviceId)}`}>{isFa ? "اقدامات این تجهیز" : "Device actions"}</Link></footer>
    </section>;
  }

  function renderOverviewTrends() {
    const traffic = currentWorkspace.traffic ?? { interface: null, method: "counter_delta", rx: [], tx: [] };
    const resource = (key: string) => chart(currentWorkspace.charts.resources.filter(item => item.label === key));
    return <section className="asset-overview-trends" aria-label={isFa ? "نمودارهای زندهٔ تجهیز" : "Device live charts"}>
      <header><div><small>{isFa ? "پایش تجهیز" : "Device monitoring"}</small><h2>{isFa ? "منابع و دسترسی" : "Resources & availability"}</h2></div><div className="asset-overview-trends__tools"><div role="group" aria-label={isFa ? "بازه زمانی" : "Time range"}>{(["1h", "6h", "24h", "7d"] as TimeRange[]).map(range => <button key={range} type="button" aria-pressed={timeRange === range} onClick={() => setTimeRange(range)}>{({ "1h": isFa ? "۱ ساعت" : "1h", "6h": isFa ? "۶ ساعت" : "6h", "24h": isFa ? "۲۴ ساعت" : "24h", "7d": isFa ? "۷ روز" : "7d" } as Record<string, string>)[range]}</button>)}</div><Link to={`/assets/devices/${deviceId}/monitoring`}>{isFa ? "همهٔ سنسورها" : "All sensors"}<ArrowUpLeft aria-hidden="true" /></Link></div></header>
      <AssetLiveCharts cpu={resource("cpu.usage_percent")} memory={resource("memory.usage_percent")} availability={chart(currentWorkspace.charts.availability)} traffic={{ ...traffic, rx: chart(traffic.rx), tx: chart(traffic.tx) }} connection={overview.availability} isFa={isFa} refreshFailed={!!error} />
    </section>;
  }

  function renderOverviewFirstViewport() {
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
    const latestCollection = currentWorkspace.collections[0];
    const latestFailedCollection = latestCollection && ["failed", "error"].includes(String(latestCollection.status).toLowerCase()) ? latestCollection : null;
    const latestCheck = currentWorkspace.statusChecks[0];
    const latestFailedCheck = latestCheck && ["failed", "offline", "error"].includes(String(latestCheck.status).toLowerCase()) ? latestCheck : null;
    const diagnosticReasons = Array.from(new Set([
      ...asArray(asRecord(currentWorkspace.health ?? {}).warningsJson).map(String),
      ...asArray(currentWorkspace.capabilities?.warnings).map(String),
      latestFailedCollection?.errorCode ? `${isFa ? "خطای جمع‌آوری" : "Collection error"}: ${String(latestFailedCollection.errorCode)}` : "",
      latestFailedCheck?.message ? diagnosticLabel(String(latestFailedCheck.message), isFa, currentWorkspace.device?.managementPort) : ""
    ].map((item) => item.trim()).filter(Boolean)));
    const needsAttention = !["healthy", "online"].includes(String(overview.healthState).toLowerCase()) || diagnosticReasons.length > 0;
    const openFindings = currentWorkspace.findings.filter((item) => !["resolved", "closed", "false_positive"].includes(String(item.status ?? "open")));
    const dataTime = vendorOverview.collectedAt ?? overview.lastSuccessfulCollection ?? currentWorkspace.capabilities?.refreshedAt;
    return <section className="asset-device-overview">
      {renderOverviewTrends()}
      <section className={`asset-device-overview__hero is-${stateTone(overview.healthState)}`}>
        <div className="asset-device-overview__identity"><Clock3 aria-hidden="true" /><strong>{isFa ? "آخرین جمع‌آوری" : "Latest collection"}</strong></div>
        <div className={`asset-device-overview__live is-${overview.availability}`}><span><i />{statusLabel(overview.availability, t)}</span><small><Clock3 />{date(dataTime, locale, isFa ? "هنوز جمع‌آوری نشده" : "Not collected yet")}</small><button type="button" disabled={collecting} onClick={() => void collectLiveData()}>{collecting ? <RefreshCw className="is-spinning" /> : <RefreshCw />}{collecting ? (isFa ? "در حال بررسی" : "Checking") : supportsVendorCollection ? (isFa ? "جمع‌آوری جدید" : "Collect now") : (isFa ? "تست اتصال" : "Test connection")}</button></div>
      </section>

      {needsAttention ? <section className="asset-diagnostic-callout"><AlertTriangle aria-hidden="true" /><div><strong>{isFa ? "چرا این تجهیز نیازمند توجه است؟" : "Why does this device need attention?"}</strong>{diagnosticReasons.length ? <ul>{diagnosticReasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>{value(asRecord(currentWorkspace.health ?? {}).summary, isFa ? "وضعیت سلامت یا تازگی داده نیازمند بررسی است. یک جمع‌آوری جدید اجرا کنید." : "Health state or evidence freshness needs review. Run a new collection.")}</p>}<small>{isFa ? "جمع‌آوری جدید را اجرا کنید؛ اگر خطا باقی ماند، کانال اتصال و زمان آخرین موفقیت را بررسی کنید." : "Run a new collection; if the issue remains, review the channel and its last success time."}</small></div><Link to={`/assets/devices/${deviceId}/monitoring`}>{isFa ? "جزئیات سلامت" : "Health details"}<ArrowUpLeft /></Link></section> : null}

      <section className="asset-overview-kpis" aria-label={isFa ? "خلاصه وضعیت" : "Status summary"}>
        <article><span><ShieldCheck /></span><div><small>{isFa ? "وضعیت اتصال" : "Connection"}</small><strong>{statusLabel(overview.availability, t)}</strong></div></article>
        <article><span><Gauge /></span><div><small>{isFa ? "امتیاز سلامت" : "Health score"}</small><strong>{overview.healthScore === null ? "—" : `${overview.healthScore}%`}</strong></div></article>
        <article><span><AlertTriangle /></span><div><small>{isFa ? "یافته باز" : "Open findings"}</small><strong>{openFindings.length.toLocaleString(locale)}</strong></div></article>
        <article><span><Activity /></span><div><small>{isFa ? "اقدام در انتظار" : "Pending actions"}</small><strong>{overview.pendingActions.toLocaleString(locale)}</strong></div></article>
      </section>

      {currentWorkspace.vendor.key === "esxi" ? <EsxiHostOverview facts={facts} deviceId={deviceId} isFa={isFa} locale={locale} ssh={currentWorkspace.capabilities?.connectorType === "esxi-ssh" || currentWorkspace.device?.protocol === "ssh"} available={overview.availability === "online"} /> : null}

      <details className="asset-overview-technical"><summary>{isFa ? "مسیرهای اتصال دستگاه" : "Device connection channels"}</summary><DeviceConnectionChannels deviceId={deviceId} channels={currentWorkspace.connections} isFa={isFa} locale={locale} onRefresh={load} /></details>

      <section className="asset-overview-main-grid">
        <article className="asset-identity-card"><header><span><Server /></span><div><small>{isFa ? "هویت و مدیریت" : "Identity and management"}</small><h3>{t("workspace.cards.identity")}</h3></div></header><dl><div><dt>{t("workspace.labels.name")}</dt><dd>{overview.name}</dd></div><div><dt>{t("workspace.labels.vendorPlatform")}</dt><dd dir="ltr">{overview.vendor} / {overview.platform}</dd></div><div><dt>{t("workspace.labels.managementAddress")}</dt><dd dir="ltr">{value(overview.managementIp ?? currentWorkspace.device?.host, fallback)}</dd></div>{optionalIdentity.map(([label, item]) => <div key={String(label)}><dt>{label}</dt><dd dir="ltr">{String(item)}</dd></div>)}</dl></article>
        <article className="asset-health-card"><header><span><CheckCircle2 /></span><div><small>{isFa ? "سلامت و پوشش" : "Health and coverage"}</small><h3>{isFa ? "وضعیت قابل اقدام" : "Actionable status"}</h3></div></header><dl><div><dt>{t("workspace.labels.healthState")}</dt><dd>{statusLabel(overview.healthState, t)}</dd></div><div><dt>{t("workspace.labels.lastSuccessfulCheck")}</dt><dd>{date(dataTime, locale, fallback)}</dd></div><div><dt>{isFa ? "دامنه‌های خوانده‌شده" : "Collected domains"}</dt><dd>{vendorOverview.sections.length.toLocaleString(locale)}</dd></div><div><dt>{isFa ? "اینترفیس" : "Interfaces"}</dt><dd>{interfaces.length.toLocaleString(locale)}</dd></div></dl>{healthSummary !== fallback ? <p dir="ltr">{healthSummary}</p> : null}</article>
      </section>

      {currentWorkspace.vendor.key !== "esxi" ? <details className="asset-vendor-overview"><summary>{isFa ? "اطلاعات تخصصی وندور" : "Vendor inventory"}</summary>
        <header><div><span><Network /></span><div><small>{isFa ? "اطلاعات واقعی و نرمال‌شده" : "Verified normalized data"}</small><h2>{isFa ? `نمای کامل ${overview.vendor}` : `${overview.vendor} overview`}</h2><p>{isFa ? "اطلاعاتی که آخرین Connector موفق از دستگاه خوانده است." : "Information read by the latest successful connector collection."}</p></div></div><time><Clock3 />{date(dataTime, locale, fallback)}</time></header>
        {vendorOverview.summary.length ? <div className="asset-vendor-facts">{vendorOverview.summary.map((item) => <article key={item.key}><small>{isFa ? item.labelFa : item.labelEn}</small><strong dir="auto">{item.value}</strong></article>)}</div> : null}
        {vendorOverview.sections.length ? <details className="asset-vendor-more"><summary>{isFa ? "مشاهدهٔ اطلاعات تخصصی" : "Show technical inventory"}</summary><div className="asset-vendor-sections">{vendorOverview.sections.map((vendorSection) => <details key={vendorSection.key}><summary><span>{isFa ? vendorSection.titleFa : vendorSection.titleEn}</span><b>{vendorSection.count.toLocaleString(locale)}</b></summary><div>{vendorSection.items.map((item, itemIndex) => <article key={`${vendorSection.key}-${itemIndex}`}><strong dir="auto">{item.title}</strong>{item.fields.length ? <dl>{item.fields.map((field) => <div key={field.key}><dt>{field.key}</dt><dd dir="auto">{field.value}</dd></div>)}</dl> : null}</article>)}</div></details>)}</div></details> : <div className="asset-vendor-empty"><Database /><strong>{isFa ? "هنوز داده جامع وندور جمع‌آوری نشده است" : "No comprehensive vendor data yet"}</strong><p>{isFa ? "برای دیدن جزئیات، یک‌بار اطلاعات دستگاه را جمع‌آوری کنید." : "Collect device data to see details."}</p></div>}
      </details> : null}

      {isCisco && currentWorkspace.vendorDetails ? <details className="asset-cisco-expanded"><summary>{isFa ? "نمای تخصصی Cisco" : "Cisco technical view"}</summary><CiscoAssetDashboard details={currentWorkspace.vendorDetails} deviceId={deviceId} availability={overview.availability} lastCollected={dataTime} collecting={collecting} isFa={isFa} onCollect={() => void collectLiveData()} /></details> : null}

      <details className="asset-overview-technical asset-sensors-disclosure"><summary>{isFa ? "همهٔ سنسورها و زمان اندازه‌گیری" : "All sensors and measurement times"}</summary>{renderSensorReadings()}</details>
      <section className="asset-overview-actions"><div><h2>{t("workspace.cards.nextAction")}</h2><p>{verifiedDevice ? t("workspace.next.verified") : t("workspace.next.unverified")}</p></div><div><Link className="primary-link" to={nextPath}>{verifiedDevice ? t("workspace.actions.openActionCenter") : t("workspace.actions.testConnection")}</Link>{interfaces.length ? <Link className="secondary-link" to={`/assets/devices/${deviceId}/interfaces`}>{isFa ? "مشاهده اینترفیس‌ها" : "View interfaces"}</Link> : null}{isCisco ? <Link className="secondary-link" to={`/actions?deviceId=${encodeURIComponent(deviceId)}&catalog=cisco_run_backup`}>{t("workspace.actions.runBackup")}</Link> : null}</div></section>
      {renderAdvancedWorkspaceDetails()}
    </section>;
  }

  function renderWorkspaceCharts() {
    const changes = currentWorkspace.charts.recentChanges.filter((item) => new Date(item.timestamp).getTime() >= since);
    const resourceLabels: Record<string, [string, string]> = { "cpu.usage_percent": ["مصرف CPU", "CPU usage"], "memory.usage_percent": ["مصرف حافظه", "Memory usage"], "disk.usage_percent": ["مصرف دیسک", "Disk usage"], "cpu.load_1m": ["بار CPU", "CPU load"] };
    const resources = Object.entries(resourceLabels).map(([key, labels]) => ({ key, title: labels[isFa ? 0 : 1], points: chart(currentWorkspace.charts.resources.filter((item) => item.label === key)) })).filter((item) => item.points.length);
    return <section className="workspace-analytics" aria-label={t("workspace.chart.ranges")}><div className="workspace-range"><span>{t("workspace.chart.ranges")}</span>{(Object.keys(rangeHours) as TimeRange[]).map((item) => <button type="button" key={item} aria-pressed={timeRange === item} onClick={() => setTimeRange(item)}>{item}</button>)}</div><div className="workspace-chart-grid"><TrendChart title={t("workspace.chart.health")} points={chart(currentWorkspace.charts.healthScore)} empty={t("workspace.empty.verifiedData")} locale={locale} /><TrendChart title={t("workspace.chart.availability")} points={chart(currentWorkspace.charts.availability)} empty={t("workspace.empty.verifiedData")} binary locale={locale} />{resources.map((item) => <TrendChart key={item.key} title={item.title} points={item.points} empty={t("workspace.empty.verifiedData")} locale={locale} />)}</div><div className="content-panel"><h2>{t("workspace.chart.changes")}</h2>{changes.length ? changes.slice(-8).reverse().map((item) => <div className="list-row" key={`${item.timestamp}-${item.label}`}>{item.label}<span>{date(item.timestamp, locale, fallback)}</span></div>) : <p>{t("workspace.empty.verifiedData")}</p>}</div></section>;
  }

  const content = (() => {
    if (section === "overview") return renderOverviewFirstViewport();
    if (section === "interfaces") return <div className="content-grid"><section className="content-panel cisco-interface-panel"><header><div><h2>{t("workspace.interfaces.title")}</h2><p>{isFa ? `${interfaces.length} اینترفیس؛ ${interfaceUpCount} لینک فعال و ${interfaceDownCount} لینک قطع` : `${interfaces.length} interfaces; ${interfaceUpCount} links up and ${interfaceDownCount} links down`}</p></div><Link className="secondary-link" to={`/assets/topology?deviceId=${encodeURIComponent(deviceId)}`}>{isFa ? "نمای گرافیکی پورت‌ها" : "Graphical port view"}</Link></header>{interfaces.length ? <div className="cisco-interface-list">{interfaces.slice(0, 128).map((item, index) => { const row = asRecord(item); const state = interfaceState(row); const address = row.ipAddress ?? asArray(row.ipAddresses)[0]; const portMeta = [row.vlan ? `VLAN ${row.vlan}` : "", row.speed ? `${row.speed} Mbps` : "", row.duplex ? String(row.duplex) : ""].filter(Boolean).join(" · "); return <article className={`cisco-interface-row is-${state.operational}`} key={String(row.name ?? row.interface ?? index)}><i aria-hidden="true" /><div><strong dir="ltr">{value(row.name ?? row.interface ?? row.id, fallback)}</strong><small>{value(row.description, isFa ? "بدون توضیح" : "No description")}</small><small dir="ltr">{value(address, isFa ? "بدون IP" : "No IP")}</small>{portMeta ? <small dir="ltr">{portMeta}</small> : null}</div><span><small>{isFa ? "لینک" : "Link"}</small><b>{state.operational === "up" ? (isFa ? "فعال" : "Up") : state.operational === "down" ? (isFa ? "قطع" : "Down") : (isFa ? "نامشخص" : "Unknown")}</b></span><span><small>{isFa ? "مدیریتی" : "Admin"}</small><b>{state.administrative === "up" ? (isFa ? "روشن" : "Up") : state.administrative === "down" ? (isFa ? "خاموش" : "Down") : (isFa ? "نامشخص" : "Unknown")}</b></span></article>; })}</div> : <p>{t("workspace.empty.interfaces")}</p>}</section>{renderAdvancedWorkspaceDetails()}</div>;
    if (section === "configuration") return <div className="content-grid"><section className="content-panel"><h2>{t("workspace.configuration.title")}</h2><dl className="detail-list"><dt>{t("workspace.labels.configState")}</dt><dd>{value(overview.configBackup.state, fallback)}</dd><dt>{t("workspace.labels.lastBackup")}</dt><dd>{date(overview.configBackup.collectedAt, locale, fallback)}</dd></dl></section><section className="content-panel"><h2>{t("workspace.configuration.connectionTitle")}</h2><p>{t("workspace.values.credentialReference")}</p><dl className="detail-list"><dt>{t("workspace.labels.managementAddress")}</dt><dd dir="ltr">{value(currentWorkspace.device?.host ?? overview.managementIp, fallback)}</dd><dt>{t("workspace.labels.protocol")}</dt><dd>{value(currentWorkspace.device?.protocol, fallback)}</dd><dt>{t("workspace.labels.environment")}</dt><dd>{value(currentWorkspace.device?.environment, fallback)}</dd></dl><Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>{t("workspace.actions.openSetup")}</Link></section></div>;
    if (section === "actions") return <div className="content-grid"><section className="content-panel"><h2>{t("workspace.actions.title")}</h2>{currentWorkspace.actions.length ? currentWorkspace.actions.map((item) => <Link className="list-row" key={String(item.id)} to={`/actions/${item.id}`}>{value(item.actionType, fallback)}<span>{value(item.status, fallback)}</span></Link>) : <p>{t("workspace.empty.actions")}</p>}<Link className="primary-link" to={`/actions?deviceId=${encodeURIComponent(deviceId)}`}>{t("workspace.actions.reviewOrCreate")}</Link></section><section className="content-panel"><h2>{t("workspace.chart.findings")}</h2>{currentWorkspace.findings.length ? currentWorkspace.findings.map((item) => <div className="list-row" key={String(item.id)}>{value(item.title, fallback)}<span>{value(item.severity, fallback)}</span></div>) : <p>{t("workspace.empty.findings")}</p>}</section></div>;
    if (section === "monitoring") return <>{renderSensorReadings()}{workspace.device ? <DeviceVerificationPanel deviceId={deviceId} /> : null}{renderWorkspaceCharts()}</>;
    return <AssetHistory audit={currentWorkspace.audit} collections={currentWorkspace.collections} isFa={isFa} locale={locale} />;
  })();

  return (
    <section className="page-stack asset-detail-page">
      {error ? <div className="content-panel asset-refresh-notice" role="status"><span>{isFa ? "به‌روزرسانی انجام نشد؛ آخرین اطلاعات دریافتی نمایش داده می‌شود." : "Refresh failed; showing the last received data."}</span><button className="secondary-button" type="button" onClick={() => void load()}>{isFa ? "تلاش دوباره" : "Try again"}</button></div> : null}
      <PageHeader title={overview.name} description={`${value(overview.managementIp ?? currentWorkspace.device?.host, fallback)} · ${overview.vendor} / ${overview.platform}`} actions={<><Link className="secondary-link" to="/assets/devices">{t("workspace.backToDevices")}</Link><Link className="primary-link" to={`/assets/devices/${deviceId}/setup`}>{t("workspace.setupConnection")}</Link>{workspace.device && <details className="asset-header-menu"><summary>{isFa ? "مدیریت تجهیز" : "Manage device"}</summary><button className="secondary-button" type="button" onClick={startEditing}>{t("workspace.editDevice")}</button><button className="danger-button" type="button" onClick={() => { setDeleteOpen(true); setDeleteName(""); }}>{t("workspace.deleteDevice")}</button></details>}</>} />
      {editing && workspace.device && <section className="content-panel device-edit-panel" aria-label={t("workspace.edit.aria")}><header><div><p className="operator-eyebrow">{t("workspace.edit.eyebrow")}</p><h2>{t("workspace.edit.title")}</h2></div><button className="secondary-button" type="button" onClick={() => setEditing(false)}>{t("workspace.actions.closeEdit")}</button></header><div className="device-edit-grid"><label>{t("workspace.labels.name")}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>{t("workspace.labels.managementAddress")}<input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} required dir="ltr" /></label><label>{t("onboarding.fields.port")}<input type="number" min="1" max="65535" value={form.managementPort} onChange={(event) => setForm({ ...form, managementPort: event.target.value })} required /></label><label>{t("workspace.labels.protocol")}<select value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })}><option value="ssh">SSH</option><option value="api">API</option><option value="syslog">Syslog</option><option value="agent">Agent</option></select></label><label>{t("workspace.labels.environment")}<select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}><option value="lab">Lab</option><option value="production">Production</option><option value="staging">Staging</option></select></label><label>{t("workspace.labels.tags")}<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="linux, edge" /></label></div><div className="button-row"><button className="primary-button" type="button" disabled={saving || !form.name.trim() || !form.host.trim()} onClick={() => void saveDevice()}>{saving ? t("common.saving") : t("common.saveChanges")}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setEditing(false)}>{t("common.cancel")}</button></div></section>}
      {deleteOpen && workspace.device && <section className="destructive-confirm" role="alertdialog" aria-label={t("workspace.delete.aria")}><strong>{t("workspace.delete.title", { name: workspace.device.name })}</strong><p>{t("workspace.delete.body")}</p><label>{t("workspace.labels.name")}<input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} autoComplete="off" /></label><div className="button-row"><button className="danger-button" type="button" disabled={saving || deleteName.trim() !== workspace.device.name} onClick={() => void removeDevice()}>{saving ? t("common.deleting") : t("workspace.actions.confirmDelete")}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</button></div></section>}
      <nav className="workspace-tabs" aria-label={t("workspace.tabs.label")}>{sections.map((item) => <Link key={item.key} aria-current={section === item.key ? "page" : undefined} to={`/assets/devices/${deviceId}/${item.key}`}>{t(item.labelKey)}</Link>)}</nav>
      {content}
    </section>
  );
}
