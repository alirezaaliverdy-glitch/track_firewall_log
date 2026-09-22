import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAssets } from "@/features/assets/hooks/useAssets";
import { useFindings } from "@/features/security/hooks/useFindings";
import {
  getOperationalDashboardActivity,
  type DashboardActionItem,
  type OperationalDashboardActivity,
} from "@/lib/dashboard";
import {
  getLinuxMonitoringSummary,
  refreshLinuxMonitoringDevice,
  type LinuxHealthSnapshot,
  type LinuxMonitoringDevice,
  type LinuxSummary,
} from "@/lib/linuxMonitoring";
import {
  getSecurityMonitoringStatus,
  type PlatformAsset,
  type SecurityFinding,
  type SecurityMonitoringStatus,
} from "@/lib/platform";
import {
  getSecurityEventsSummary,
  type EventsSummary,
} from "@/lib/securityEvents";
import {
  Activity,
  ArrowUpLeft,
  BellRing,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./DashboardPage.css";
import "./DashboardCommandCenter.css";

type MetricRow = { metricKey?: unknown; value?: unknown };
type DashboardTone = "good" | "warning" | "danger" | "neutral";
type AttentionItem = { id: string; title: string; reason: string; detail: string; route: string; tone: DashboardTone };

const EMPTY_EVENT_SUMMARY: EventsSummary = {
  totalEvents: 0,
  storedRows: 0,
  latestEventAt: null,
  window: { from: null, to: null },
  countBySeverity: [],
  countByAction: [],
  topSourceIps: [],
  topDestinationPorts: [],
  topSources: [],
  topDevices: [],
};

const OPEN_FINDING_STATUSES = new Set(["open", "new", "investigating", "acknowledged"]);

function copy(isFa: boolean, fa: string, en: string) {
  return isFa ? fa : en;
}

function localeFor(language: string) {
  return language.startsWith("fa") ? "fa-IR" : "en-US";
}

function number(value: number, language: string) {
  return new Intl.NumberFormat(localeFor(language)).format(value);
}

function shortDate(value: string | null | undefined, language: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function relativeDate(value: string | null | undefined, language: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return fallback;
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60_000));
  const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: "auto" });
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

function metrics(snapshot: LinuxHealthSnapshot | null) {
  if (!Array.isArray(snapshot?.metricsJson)) return [];
  return snapshot.metricsJson.filter((item): item is MetricRow => Boolean(item) && typeof item === "object");
}

function metricValue(snapshot: LinuxHealthSnapshot | null, key: string) {
  const row = metrics(snapshot).find((item) => item.metricKey === key);
  const value = Number(row?.value);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function hasResourceMetrics(snapshot: LinuxHealthSnapshot | null) {
  const keys = new Set(metrics(snapshot).map((item) => item.metricKey));
  return ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent"].every((key) => keys.has(key));
}

function snapshotWarnings(snapshot: LinuxHealthSnapshot | null) {
  return Array.isArray(snapshot?.warningsJson)
    ? snapshot.warningsJson.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function linuxAttentionReason(device: LinuxMonitoringDevice, isFa: boolean) {
  const snapshot = device.latestHealth;
  const warning = snapshotWarnings(snapshot)[0];
  if (warning) return warning;
  const state = device.healthState ?? snapshot?.state ?? "unknown";
  if (state === "offline") return copy(isFa, "ارتباط با سرور برقرار نیست؛ ابتدا مسیر شبکه و اعتبارنامه را بررسی کنید.", "The server is unreachable; check its network path and credential first.");
  if (state === "stale") return copy(isFa, "داده سلامت منقضی شده است؛ یک جمع‌آوری جدید اجرا کنید.", "Health data is stale; run a new collection.");
  if (state === "critical") return snapshot?.summary || copy(isFa, "یکی از شاخص‌های سلامت از محدوده بحرانی عبور کرده است.", "A health metric crossed its critical threshold.");
  if (state === "warning") return snapshot?.summary || copy(isFa, "یکی از شاخص‌های سلامت نیازمند بازبینی است.", "A health metric needs review.");
  return copy(isFa, "هنوز Snapshot معتبر سلامت برای این سرور ثبت نشده است.", "No valid health snapshot has been recorded for this server yet.");
}

function needsHealthCollection(device: LinuxMonitoringDevice) {
  const snapshot = device.latestHealth;
  if (!snapshot || !hasResourceMetrics(snapshot)) return true;
  const staleAt = snapshot.staleAt ? new Date(snapshot.staleAt).getTime() : Number.NaN;
  if (Number.isFinite(staleAt) && staleAt <= Date.now()) return true;
  const collectedAt = new Date(snapshot.collectedAt).getTime();
  return Number.isFinite(collectedAt) && Date.now() - collectedAt > 15 * 60 * 1000;
}

function stateTone(state: string): DashboardTone {
  if (["healthy", "online", "connected"].includes(state)) return "good";
  if (["critical", "offline", "error"].includes(state)) return "danger";
  if (["warning", "stale", "degraded"].includes(state)) return "warning";
  return "neutral";
}

function stateColor(state: string) {
  if (stateTone(state) === "good") return "#2dd4bf";
  if (stateTone(state) === "danger") return "#fb7185";
  if (stateTone(state) === "warning") return "#fbbf24";
  return "#64748b";
}

function stateLabel(state: string, isFa: boolean) {
  const labels: Record<string, [string, string]> = {
    healthy: ["سالم", "Healthy"], online: ["آنلاین", "Online"], connected: ["متصل", "Connected"],
    warning: ["هشدار", "Warning"], stale: ["داده قدیمی", "Stale"], degraded: ["افت کیفیت", "Degraded"],
    critical: ["بحرانی", "Critical"], offline: ["آفلاین", "Offline"], error: ["خطا", "Error"],
  };
  const label = labels[state] ?? ["نامشخص", "Unknown"];
  return isFa ? label[0] : label[1];
}


function localizedActionTitle(item: DashboardActionItem, isFa: boolean) {
  return (isFa ? item.titleFa : item.titleEn) || item.title;
}

function isOpenFinding(finding: SecurityFinding) {
  return OPEN_FINDING_STATUSES.has(finding.status) || !["resolved", "false_positive", "accepted_risk", "suppressed"].includes(finding.status);
}

function vendorName(asset: PlatformAsset) {
  return asset.vendor?.name || asset.platform?.name || asset.device?.type || "Unknown";
}

const PORT_SERVICES: Record<string, string> = {
  "20": "FTP data",
  "21": "FTP",
  "22": "SSH",
  "25": "SMTP",
  "53": "DNS",
  "67": "DHCP",
  "68": "DHCP",
  "80": "HTTP",
  "110": "POP3",
  "123": "NTP",
  "143": "IMAP",
  "161": "SNMP",
  "389": "LDAP",
  "443": "HTTPS",
  "445": "SMB",
  "514": "Syslog",
  "636": "LDAPS",
  "993": "IMAPS",
  "995": "POP3S",
  "1433": "MSSQL",
  "1521": "Oracle",
  "3306": "MySQL",
  "3389": "RDP",
  "5432": "PostgreSQL",
  "6379": "Redis",
  "8080": "HTTP Alt",
  "8443": "HTTPS Alt",
  "22022": "SSH Alt",
};

function portService(port: string, isFa: boolean) {
  return PORT_SERVICES[port] ?? copy(isFa, "سرویس سفارشی", "Custom service");
}

function LinuxServerChart({ device, language, isFa }: { device: LinuxMonitoringDevice; language: string; isFa: boolean }) {
  const snapshot = device.latestHealth;
  const healthState = device.healthState ?? snapshot?.state ?? "unknown";
  const score = snapshot ? Math.max(0, Math.min(100, snapshot.score)) : null;
  const cpu = metricValue(snapshot, "cpu.usage_percent");
  const memory = metricValue(snapshot, "memory.usage_percent");
  const disk = metricValue(snapshot, "disk.usage_percent");
  const legend = [
    { key: "cpu", label: "CPU", value: cpu, color: "#22d3ee", icon: <Cpu /> },
    { key: "memory", label: copy(isFa, "حافظه", "Memory"), value: memory, color: "#a78bfa", icon: <MemoryStick /> },
    { key: "disk", label: copy(isFa, "دیسک", "Disk"), value: disk, color: "#f59e0b", icon: <HardDrive /> },
  ];
  const dialStyle = {
    "--health-angle": `${(score ?? 0) * 3.6}deg`,
    "--health-color": stateColor(healthState),
  } as CSSProperties;
  return (
    <article className={`linux-server-card command-linux-card linux-server-card--${stateTone(healthState)}`}>
      <header className="linux-server-card__header"><div><h3>{device.name}</h3><span dir="ltr">{device.host}</span></div><span className={`dashboard-status dashboard-status--${stateTone(healthState)}`}>{stateLabel(healthState, isFa)}</span></header>
      <div className="linux-health-visual">
        <div className="linux-health-dial" style={dialStyle} role="img" aria-label={`${copy(isFa, "امتیاز سلامت", "Health score")}: ${score ?? "—"}`}>
          <div><span>{copy(isFa, "امتیاز سلامت", "Health score")}</span><strong>{score === null ? "—" : number(score, language)}<small>/ {number(100, language)}</small></strong><em><i />{snapshot ? copy(isFa, "تله‌متری متصل", "Telemetry connected") : copy(isFa, "منتظر داده", "Awaiting data")}</em></div>
        </div>
        <dl className="linux-resource-chart">{legend.map((item) => {
          const value = item.value === null ? 0 : Math.round(item.value);
          return <div key={item.key} style={{ "--metric-color": item.color } as CSSProperties}>
            <dt><span>{item.icon}</span><b>{item.label}</b><strong>{item.value === null ? "—" : `${number(value, language)}%`}</strong></dt>
            <dd><i style={{ width: `${value}%` }} /></dd>
          </div>;
        })}</dl>
      </div>
      <footer><span><Clock3 size={14} />{shortDate(snapshot?.collectedAt, language, copy(isFa, "ثبت نشده", "Not recorded"))}</span><Link to={`/monitoring/linux/${device.id}`}>{copy(isFa, "جزئیات", "Details")}<ArrowUpLeft size={15} /></Link></footer>
    </article>
  );
}


function TrendTooltip({ active, payload, label, isFa, language }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string; isFa: boolean; language: string }) {
  if (!active || !payload?.length) return null;
  return <div className="command-chart-tooltip"><strong>{label}</strong>{payload.map((item) => <span key={item.name} style={{ color: item.color }}><i style={{ background: item.color }} />{item.name}: {number(item.value ?? 0, language)}</span>)}<small>{copy(isFa, "بر پایه زمان آخرین مشاهده یافته‌ها", "Based on finding last-seen time")}</small></div>;
}

function buildFindingTrend(findings: SecurityFinding[], isFa: boolean) {
  const now = Date.now();
  const bucketMs = 4 * 60 * 60 * 1000;
  return Array.from({ length: 6 }, (_, index) => {
    const start = now - (6 - index) * bucketMs;
    const end = start + bucketMs;
    const rows = findings.filter((finding) => {
      const value = new Date(finding.lastSeen).getTime();
      return isOpenFinding(finding) && Number.isFinite(value) && value >= start && value < end;
    });
    return {
      label: new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(end)),
      critical: rows.filter((item) => item.severity === "critical").length,
      high: rows.filter((item) => item.severity === "high").length,
      medium: rows.filter((item) => item.severity === "medium").length,
      low: rows.filter((item) => !["critical", "high", "medium"].includes(item.severity)).length,
    };
  });
}

function ActionRows({ items, language, isFa }: { items: DashboardActionItem[]; language: string; isFa: boolean }) {
  if (!items.length) return <div className="command-empty"><CheckCircle2 size={20} /><p>{copy(isFa, "هنوز اجرای عملیاتی ثبت نشده است.", "No operational execution is recorded yet.")}</p></div>;
  return <ul className="command-action-list">{items.slice(0, 5).map((item) => <li key={item.id}><span className={`command-action-list__mark command-action-list__mark--${item.outcome === "succeeded" ? "good" : item.status === "failed" ? "danger" : "neutral"}`} /><div><Link to={item.actionCenterPath}>{localizedActionTitle(item, isFa)}</Link><span>{item.device?.name ?? copy(isFa, "بدون تجهیز هدف", "No target")} · {item.status}</span></div><time>{relativeDate(item.updatedAt, language, "—")}</time></li>)}</ul>;
}

export default function DashboardPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? "fa";
  const isFa = language.startsWith("fa");
  const assets = useAssets();
  const findings = useFindings();
  const [linux, setLinux] = useState<LinuxSummary | null>(null);
  const [activity, setActivity] = useState<OperationalDashboardActivity | null>(null);
  const [monitoring, setMonitoring] = useState<SecurityMonitoringStatus | null>(null);
  const [eventSummary, setEventSummary] = useState<EventsSummary>(EMPTY_EVENT_SUMMARY);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [linuxError, setLinuxError] = useState(false);
  const [linuxRefreshing, setLinuxRefreshing] = useState(false);
  const [linuxRefreshError, setLinuxRefreshError] = useState(false);

  const loadLinuxHealth = useCallback(async (collectAll = false) => {
    try {
      const current = await getLinuxMonitoringSummary();
      setLinux(current);
      setLinuxError(false);
      const targets = collectAll ? current.devices : current.devices.filter(needsHealthCollection);
      if (!targets.length) return;
      setLinuxRefreshing(true);
      setLinuxRefreshError(false);
      const results = await Promise.allSettled(targets.map((device) => refreshLinuxMonitoringDevice(device.id)));
      setLinuxRefreshError(results.some((result) => result.status === "rejected"));
      setLinux(await getLinuxMonitoringSummary());
    } catch {
      setLinuxError(true);
    } finally {
      setLinuxRefreshing(false);
    }
  }, []);

  const loadOperationalData = useCallback(async (showBusy = false) => {
    if (showBusy) setDataRefreshing(true);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const [activityResult, monitoringResult, summaryResult] = await Promise.allSettled([
      getOperationalDashboardActivity(), getSecurityMonitoringStatus(), getSecurityEventsSummary({ from }),
    ]);
    if (activityResult.status === "fulfilled") { setActivity(activityResult.value); setActivityError(false); } else setActivityError(true);
    if (monitoringResult.status === "fulfilled") setMonitoring(monitoringResult.value);
    if (summaryResult.status === "fulfilled") setEventSummary(summaryResult.value);
    setDataRefreshing(false);
  }, []);

  useEffect(() => { void loadLinuxHealth(); }, [loadLinuxHealth]);
  useEffect(() => {
    void loadOperationalData();
    const interval = window.setInterval(() => void loadOperationalData(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadOperationalData]);

  const openFindings = useMemo(() => findings.findings.filter(isOpenFinding), [findings.findings]);
  const criticalFindings = openFindings.filter((item) => item.severity === "critical").length;
  const highFindings = openFindings.filter((item) => item.severity === "high").length;
  const findings24h = openFindings.filter((item) => Date.now() - new Date(item.lastSeen).getTime() <= 86_400_000).length;
  const failedActions = activity?.summary.failedActions ?? 0;
  const pendingApprovals = activity?.summary.pendingApprovals ?? 0;
  const linuxAttention = linux ? linux.warning + linux.critical + linux.offline + linux.stale + linux.unknown : 0;
  const overallTone: DashboardTone = failedActions > 0 || criticalFindings > 0 ? "danger" : pendingApprovals > 0 || linuxAttention > 0 || assets.stats.needsReview > 0 ? "warning" : "good";
  const activeDevices = activity?.summary.activeDevices ?? assets.stats.total;
  const trend = useMemo(() => buildFindingTrend(findings.findings, isFa), [findings.findings, isFa]);
  const topTrendValue = Math.max(1, ...trend.map((item) => item.critical + item.high + item.medium + item.low));

  const vendorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assets.assets.forEach((asset) => counts.set(vendorName(asset), (counts.get(vendorName(asset)) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [assets.assets]);

  const visibleAssets = useMemo(() => [...assets.assets].sort((a, b) => {
    const rank: Record<DashboardTone, number> = { danger: 0, warning: 1, neutral: 2, good: 3 };
    return rank[stateTone(a.healthState)] - rank[stateTone(b.healthState)];
  }).slice(0, 6), [assets.assets]);

  const latestFindings = useMemo(() => [...openFindings].sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()).slice(0, 5), [openFindings]);
  const visibleLinuxDevices = useMemo(() => [...(linux?.devices ?? [])].sort((a, b) => {
    const rank: Record<DashboardTone, number> = { danger: 0, warning: 1, neutral: 2, good: 3 };
    return rank[stateTone(a.healthState ?? a.latestHealth?.state ?? "unknown")] - rank[stateTone(b.healthState ?? b.latestHealth?.state ?? "unknown")];
  }).slice(0, 3), [linux]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const linuxIds = new Set<string>();
    for (const device of linux?.devices ?? []) {
      const state = device.healthState ?? device.latestHealth?.state ?? "unknown";
      if (stateTone(state) === "good") continue;
      linuxIds.add(device.id);
      items.push({
        id: `linux-${device.id}`,
        title: device.name,
        reason: linuxAttentionReason(device, isFa),
        detail: `${stateLabel(state, isFa)} · ${shortDate(device.latestHealth?.collectedAt, language, copy(isFa, "بدون داده سلامت", "No health data"))}`,
        route: `/monitoring/linux/${device.id}`,
        tone: stateTone(state),
      });
    }
    for (const asset of assets.assets) {
      if (stateTone(asset.healthState) === "good" || (asset.device?.id && linuxIds.has(asset.device.id))) continue;
      const state = asset.healthState || "unknown";
      items.push({
        id: `asset-${asset.id}`,
        title: asset.name,
        reason: state === "offline"
          ? copy(isFa, "آخرین بررسی اتصال ناموفق بوده است؛ اتصال مدیریت و اعتبارنامه را آزمایش کنید.", "The latest connection check failed; test the management channel and credential.")
          : state === "error"
            ? copy(isFa, "جمع‌آوری یا اتصال دستگاه با خطا تمام شده است؛ جزئیات آخرین بررسی را باز کنید.", "Device collection or connection failed; open the latest check details.")
            : copy(isFa, "وضعیت معتبر و تازه‌ای از این تجهیز در دسترس نیست؛ جمع‌آوری جدید لازم است.", "No fresh, verified state is available; a new collection is required."),
        detail: `${vendorName(asset)} · ${shortDate(asset.lastSeenAt, language, copy(isFa, "بدون تماس موفق", "No successful contact"))}`,
        route: asset.device?.id ? `/assets/devices/${asset.device.id}` : "/assets",
        tone: stateTone(state),
      });
    }
    for (const collector of monitoring?.collectors.devices ?? []) {
      if (!collector.lastErrorCode || collector.consecutiveFailures < 1) continue;
      items.push({
        id: `collector-${collector.deviceId}`,
        title: collector.deviceName,
        reason: copy(isFa, `جمع‌آورنده ${collector.sourceType} با خطای ${collector.lastErrorCode} متوقف شده است.`, `${collector.sourceType} collector failed with ${collector.lastErrorCode}.`),
        detail: copy(isFa, `${number(collector.consecutiveFailures, language)} خطای متوالی`, `${number(collector.consecutiveFailures, language)} consecutive failures`),
        route: `/assets/devices/${collector.deviceId}`,
        tone: "danger",
      });
    }
    return items.slice(0, 8);
  }, [assets.assets, isFa, language, linux, monitoring]);

  const dailyChecks = [
    { label: copy(isFa, "وضعیت تجهیزات", "Device health"), ok: assets.stats.needsReview === 0, value: `${number(assets.stats.online, language)} / ${number(assets.stats.total, language)}` },
    { label: copy(isFa, "موتور تشخیص", "Detection engine"), ok: Boolean(monitoring?.running), value: monitoring?.running ? copy(isFa, "فعال", "Running") : copy(isFa, "متوقف", "Stopped") },
    { label: copy(isFa, "جمع‌آورنده‌ها", "Collectors"), ok: Boolean(monitoring) && (monitoring?.collectors.failed ?? 0) === 0, value: `${number(monitoring?.collectors.succeeded ?? 0, language)} / ${number(monitoring?.collectors.configured ?? 0, language)}` },
    { label: copy(isFa, "سرویس عملیات", "Operations service"), ok: !activityError, value: activityError ? copy(isFa, "قطع", "Unavailable") : copy(isFa, "متصل", "Connected") },
  ];
  const dailyHealthy = dailyChecks.every((item) => item.ok) && criticalFindings === 0;

  const maxPortCount = Math.max(1, ...eventSummary.topDestinationPorts.map((item) => item.count));
  const observedPortEvents = eventSummary.topDestinationPorts.reduce((sum, item) => sum + item.count, 0);

  const refreshAll = () => {
    assets.refresh();
    findings.refresh();
    void loadOperationalData(true);
    void loadLinuxHealth(false);
  };

  if ((assets.loading || findings.loading) && !activity) return <LoadingState label={copy(isFa, "در حال آماده‌سازی مرکز فرمان...", "Preparing command center...")} />;
  if (assets.error) return <ErrorState title={copy(isFa, "داشبورد در دسترس نیست", "Dashboard unavailable")} message={copy(isFa, "دریافت اطلاعات تجهیزات ناموفق بود.", "Could not load equipment data.")} onRetry={assets.refresh} />;
  if (findings.error) return <ErrorState title={copy(isFa, "داشبورد در دسترس نیست", "Dashboard unavailable")} message={copy(isFa, "دریافت یافته‌های امنیتی ناموفق بود.", "Could not load security findings.")} onRetry={findings.refresh} />;

  return (
    <section className="page-stack dashboard-command-center">
      <header className="command-center-header">
        <div><span><Activity size={15} />{copy(isFa, "مرکز فرمان زنده", "Live command center")}</span><h1>{copy(isFa, "داشبورد عملیات امنیت", "Security Operations Dashboard")}</h1></div>
        <div className="command-center-header__tools"><span><i className={activityError ? "is-danger" : ""} />{activityError ? copy(isFa, "بخشی از داده‌ها در دسترس نیست", "Some data is unavailable") : copy(isFa, "داده عملیاتی متصل", "Operational data connected")}</span><small>{copy(isFa, "آخرین به‌روزرسانی", "Updated")}: {shortDate(activity?.generatedAt, language, "—")}</small><button type="button" onClick={refreshAll} disabled={dataRefreshing || linuxRefreshing}><RefreshCw size={16} className={dataRefreshing ? "is-spinning" : undefined} />{copy(isFa, "تازه‌سازی", "Refresh")}</button></div>
      </header>

      <div className="command-workspace-shell">
        <div className="command-primary-workspace">
      <div className="command-overview-grid">
        <article className={`command-panel daily-check-panel command-panel--${dailyHealthy ? "good" : overallTone}`}>
          <header><span className="command-panel__icon"><ShieldCheck /></span><div><h2>{copy(isFa, "بررسی روزانه امنیت", "Daily security check")}</h2><p>{copy(isFa, "خلاصه زنده سرویس‌های کلیدی", "Live summary of critical services")}</p></div>{dailyHealthy ? <em>{copy(isFa, "سالم", "Healthy")}</em> : <a className="daily-check-panel__attention-link" href="#dashboard-attention">{copy(isFa, "مشاهده علت‌ها", "See causes")}<ArrowUpLeft size={14} /></a>}</header>
          <ul>{dailyChecks.map((item) => <li key={item.label}><span><i className={item.ok ? "is-ok" : "is-alert"}>{item.ok ? <Check /> : <CircleAlert />}</i>{item.label}</span><b className={item.ok ? "is-ok" : "is-alert"}>{item.value}</b></li>)}</ul>
          <footer><Clock3 size={14} />{copy(isFa, "چرخه پایش", "Monitoring cycle")}: {shortDate(monitoring?.lastCycleAt, language, copy(isFa, "ثبت نشده", "Not recorded"))}</footer>
        </article>

        <article className="command-panel device-count-panel">
          <header><span className="command-panel__icon"><Server /></span><div><h2>{copy(isFa, "تجهیزات", "Devices")}</h2><p>{copy(isFa, "موجودی فعال", "Active inventory")}</p></div></header>
          <div className="device-count-panel__value"><strong>{number(activeDevices, language)}</strong><span>{number(assets.stats.online, language)} {copy(isFa, "آنلاین", "online")}</span></div>
          <div className="device-online-track"><i style={{ width: `${assets.stats.total ? Math.round((assets.stats.online / assets.stats.total) * 100) : 0}%` }} /></div>
          <ul>{vendorCounts.length ? vendorCounts.map(([vendor, count]) => <li key={vendor}><span><i />{vendor}</span><b>{number(count, language)}</b></li>) : <li className="is-empty">{copy(isFa, "تجهیزی ثبت نشده", "No devices registered")}</li>}</ul>
        </article>

        <article className="command-panel alert-count-panel">
          <header><span className="command-panel__icon"><BellRing /></span><div><h2>{copy(isFa, "هشدارها", "Alerts")}</h2><p>{copy(isFa, "یافته‌های باز", "Open findings")}</p></div></header>
          <strong>{number(openFindings.length, language)}</strong><span>{number(findings24h, language)} {copy(isFa, "در ۲۴ ساعت گذشته", "in the last 24 hours")}</span>
          <div className="alert-count-panel__bars" aria-hidden="true">{trend.map((item, index) => <i key={item.label} style={{ height: `${Math.max(8, ((item.critical + item.high + item.medium + item.low) / topTrendValue) * 100)}%`, "--bar-delay": `${index * 70}ms` } as CSSProperties} />)}</div>
          <dl><div><dt><i className="is-critical" />{copy(isFa, "بحرانی", "Critical")}</dt><dd>{number(criticalFindings, language)}</dd></div><div><dt><i className="is-high" />{copy(isFa, "مهم", "High")}</dt><dd>{number(highFindings, language)}</dd></div><div><dt><i className="is-info" />{copy(isFa, "سایر", "Other")}</dt><dd>{number(Math.max(0, openFindings.length - criticalFindings - highFindings), language)}</dd></div></dl>
        </article>
      </div>

      {attentionItems.length ? <article id="dashboard-attention" className="command-panel dashboard-attention-panel">
        <header className="command-panel-heading"><div><span className="command-panel__icon"><CircleAlert /></span><div><h2>{copy(isFa, "علت‌های نیازمند توجه", "Attention causes")}</h2><p>{copy(isFa, "علت ثبت‌شده، زمان آخرین داده و مسیر بررسی هر تجهیز", "Recorded cause, latest evidence time, and review path for each device")}</p></div></div><span>{number(attentionItems.length, language)} {copy(isFa, "مورد", "items")}</span></header>
        <div className="dashboard-attention-list">{attentionItems.map((item) => <Link key={item.id} to={item.route} className={`dashboard-attention-item is-${item.tone}`}>
          <span className="dashboard-attention-item__state"><CircleAlert /></span>
          <span><strong>{item.title}</strong><small>{item.reason}</small><em>{item.detail}</em></span>
          <b>{copy(isFa, "بررسی و رفع", "Review and resolve")}<ArrowUpLeft /></b>
        </Link>)}</div>
      </article> : null}

      <article className="command-panel alert-trend-panel">
        <header className="command-panel-heading"><div><span className="command-panel__icon"><Activity /></span><div><h2>{copy(isFa, "روند هشدارها", "Alert trend")}</h2><p>{copy(isFa, "یافته‌های باز بر اساس آخرین مشاهده در ۲۴ ساعت گذشته", "Open findings by last-seen time over 24 hours")}</p></div></div><Link to="/security/findings">{copy(isFa, "همه یافته‌ها", "All findings")}<ArrowUpLeft size={14} /></Link></header>
        <div className="alert-trend-chart" dir="ltr">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={trend} barCategoryGap="25%"><CartesianGrid vertical={false} stroke="rgba(110,145,170,.13)" strokeDasharray="3 5" /><XAxis dataKey="label" tick={{ fill: "#617b8e", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#617b8e", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "rgba(56,189,248,.035)" }} content={<TrendTooltip isFa={isFa} language={language} />} /><Bar dataKey="critical" name={copy(isFa, "بحرانی", "Critical")} stackId="alerts" fill="#fb5d77" radius={[3, 3, 0, 0]} /><Bar dataKey="high" name={copy(isFa, "مهم", "High")} stackId="alerts" fill="#ff9f43" /><Bar dataKey="medium" name={copy(isFa, "هشدار", "Medium")} stackId="alerts" fill="#8b6df6" /><Bar dataKey="low" name={copy(isFa, "اطلاع", "Low")} stackId="alerts" fill="#3bbbd4" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        <div className="alert-trend-legend"><span><i className="is-critical" />{copy(isFa, "بحرانی", "Critical")}</span><span><i className="is-high" />{copy(isFa, "مهم", "High")}</span><span><i className="is-medium" />{copy(isFa, "هشدار", "Medium")}</span><span><i className="is-info" />{copy(isFa, "اطلاع", "Low")}</span></div>
      </article>

      <div className="command-detail-grid">
        <article className="command-panel device-status-panel">
          <header className="command-panel-heading"><div><span className="command-panel__icon"><Server /></span><div><h2>{copy(isFa, "وضعیت تجهیزات", "Device status")}</h2><p>{copy(isFa, "دارایی‌های نیازمند توجه ابتدا نمایش داده می‌شوند", "Assets needing attention appear first")}</p></div></div><Link to="/assets">{copy(isFa, "همه تجهیزات", "All devices")}<ArrowUpLeft size={14} /></Link></header>
          {visibleAssets.length ? <div className="device-status-table"><div className="device-status-table__head"><span>{copy(isFa, "تجهیز", "Device")}</span><span>{copy(isFa, "سازنده", "Vendor")}</span><span>{copy(isFa, "وضعیت", "Status")}</span><span>{copy(isFa, "آخرین مشاهده", "Last seen")}</span></div>{visibleAssets.map((asset) => <Link to={asset.device?.id ? `/assets/devices/${asset.device.id}` : "/assets"} key={asset.id} className="device-status-table__row"><span><i className={`is-${stateTone(asset.healthState)}`} /><b>{asset.name}</b><small dir="ltr">{asset.managementIp ?? asset.hostname ?? "—"}</small></span><span>{vendorName(asset)}</span><span><em className={`is-${stateTone(asset.healthState)}`}>{stateLabel(asset.healthState, isFa)}</em></span><time>{relativeDate(asset.lastSeenAt, language, "—")}</time></Link>)}</div> : <div className="command-empty"><Server /><p>{copy(isFa, "هنوز تجهیزی ثبت نشده است.", "No device has been registered yet.")}</p></div>}
        </article>

        <div className="command-side-stack">
          <article className="command-panel top-traffic-panel">
            <header className="command-panel-heading"><div><span className="command-panel__icon"><Network /></span><div><h2>{copy(isFa, "پورت‌های پرترافیک واقعی", "Live high-traffic ports")}</h2><p>{copy(isFa, "بر پایه رخدادهای جمع‌آوری‌شده در ۲۴ ساعت اخیر", "Based on collected events from the last 24 hours")}</p></div></div><Link to="/monitoring">{copy(isFa, "رخدادها", "Events")}<ArrowUpLeft size={14} /></Link></header>
            {eventSummary.topDestinationPorts.length ? <ul>{eventSummary.topDestinationPorts.slice(0, 5).map((item, index) => {
              const share = observedPortEvents ? Math.round((item.count / observedPortEvents) * 100) : 0;
              return <li key={item.value}>
                <span className="top-traffic-panel__rank">{number(index + 1, language)}</span>
                <span className="top-traffic-panel__identity"><b dir="ltr">:{item.value}</b><small>{portService(item.value, isFa)}</small></span>
                <span className="top-traffic-panel__meter"><i><b style={{ width: `${Math.max(5, (item.count / maxPortCount) * 100)}%` }} /></i><small>{number(share, language)}%</small></span>
                <strong>{number(item.count, language)}<small>{copy(isFa, "رخداد", "events")}</small></strong>
              </li>;
            })}</ul> : <div className="command-empty command-empty--compact"><Activity /><p>{copy(isFa, "در ۲۴ ساعت اخیر رخداد دارای پورت ثبت نشده است.", "No port-bearing event was recorded in the last 24 hours.")}</p></div>}
            <footer><span><i />{copy(isFa, "داده واقعی Collector", "Live collector data")}</span><span>{copy(isFa, "آخرین رخداد", "Latest")}: <b>{relativeDate(eventSummary.latestEventAt, language, "—")}</b></span><span>{copy(isFa, "کل رخدادها", "Total")}: <b>{number(eventSummary.totalEvents, language)}</b></span></footer>
          </article>

          <article className="command-panel latest-findings-panel">
            <header className="command-panel-heading"><div><span className="command-panel__icon"><ShieldAlert /></span><div><h2>{copy(isFa, "آخرین یافته‌ها", "Latest findings")}</h2><p>{copy(isFa, "نیازمند بررسی امنیتی", "Awaiting security review")}</p></div></div><Link to="/security/findings">{copy(isFa, "مشاهده همه", "View all")}<ArrowUpLeft size={14} /></Link></header>
            {latestFindings.length ? <ul>{latestFindings.map((finding) => <li key={finding.id}><i className={`is-${finding.severity}`} /><div><Link to={`/security/findings/${finding.id}`}>{finding.title}</Link><span>{finding.device?.name ?? finding.asset?.name ?? finding.vendor}</span></div><time>{relativeDate(finding.lastSeen, language, "—")}</time></li>)}</ul> : <div className="command-empty command-empty--compact"><CheckCircle2 /><p>{copy(isFa, "یافته بازی وجود ندارد.", "No open findings.")}</p></div>}
          </article>
        </div>
      </div>
        </div>
      </div>

      <div className="command-operations-grid">
        <article className="command-panel operator-priority-panel">
          <header className="command-panel-heading"><div><span className="command-panel__icon"><Siren /></span><div><h2>{copy(isFa, "اولویت اپراتور", "Operator priority")}</h2><p>{copy(isFa, "مواردی که اکنون به تصمیم نیاز دارند", "Items requiring a decision now")}</p></div></div></header>
          <div className="operator-priority-grid">
            <Link to="/actions?view=history&status=failed" className={failedActions ? "is-danger" : "is-good"}><span><Siren /></span><div><strong>{copy(isFa, "اقدام ناموفق", "Failed actions")}</strong><small>{copy(isFa, "شواهد Connector را بررسی کنید", "Review connector evidence")}</small></div><b>{number(failedActions, language)}</b></Link>
            <Link to="/actions?view=pending" className={pendingApprovals ? "is-warning" : "is-good"}><span><Clock3 /></span><div><strong>{copy(isFa, "در انتظار تأیید", "Pending approvals")}</strong><small>{copy(isFa, "پیش‌نمایش آماده بررسی", "Preview ready for review")}</small></div><b>{number(pendingApprovals, language)}</b></Link>
            <Link to="/security/findings" className={criticalFindings ? "is-danger" : "is-good"}><span><ShieldAlert /></span><div><strong>{copy(isFa, "یافته بحرانی", "Critical findings")}</strong><small>{copy(isFa, "دامنه اثر را بررسی کنید", "Review impact scope")}</small></div><b>{number(criticalFindings, language)}</b></Link>
          </div>
        </article>
        <article className="command-panel recent-actions-panel"><header className="command-panel-heading"><div><span className="command-panel__icon"><CheckCircle2 /></span><div><h2>{copy(isFa, "آخرین اجراها", "Recent executions")}</h2><p>{copy(isFa, "ردپای واقعی Action Center", "Real Action Center trail")}</p></div></div><Link to="/actions">{copy(isFa, "مرکز اقدام", "Action Center")}<ArrowUpLeft size={14} /></Link></header><ActionRows items={activity?.recentExecutions ?? []} language={language} isFa={isFa} /></article>
      </div>

      <section className="command-linux-section">
        <header className="command-section-heading"><div><span>{copy(isFa, "تله‌متری واقعی", "Real telemetry")}</span><h2>{copy(isFa, "سلامت سرورهای Linux", "Linux server health")}</h2><p>{copy(isFa, "امتیاز کلی و مصرف واقعی CPU، حافظه و دیسک از آخرین Snapshot معتبر، در یک نمای مقایسه‌پذیر.", "Overall score and real CPU, memory and disk usage from the latest valid snapshot in one comparable view.")}</p></div><div><button type="button" onClick={() => void loadLinuxHealth(true)} disabled={linuxRefreshing}><RefreshCw size={15} className={linuxRefreshing ? "is-spinning" : undefined} />{linuxRefreshing ? copy(isFa, "در حال دریافت...", "Collecting...") : copy(isFa, "دریافت داده زنده", "Collect live data")}</button><Link to="/monitoring/linux">{copy(isFa, "پایش Linux", "Linux monitoring")}<ArrowUpLeft size={14} /></Link></div></header>
        {linuxError ? <div className="command-warning"><CircleAlert />{copy(isFa, "وضعیت سرورهای Linux در دسترس نیست.", "Linux server health is unavailable.")}</div> : null}
        {linuxRefreshError ? <div className="command-warning"><CircleAlert />{copy(isFa, "داده برخی سرورها تازه نشد؛ آخرین Snapshot معتبر نمایش داده می‌شود.", "Some servers did not refresh; the latest valid snapshot is shown.")}</div> : null}
        {!linuxError && visibleLinuxDevices.length ? <div className="linux-server-grid command-linux-grid">{visibleLinuxDevices.map((device) => <LinuxServerChart key={device.id} device={device} language={language} isFa={isFa} />)}</div> : !linuxError ? <div className="command-empty command-empty--large"><Server /><div><strong>{copy(isFa, "هنوز سرور Linux ثبت نشده است", "No Linux server registered")}</strong><p>{copy(isFa, "پس از ثبت و جمع‌آوری، نمودار واقعی اینجا ظاهر می‌شود.", "After registration and collection, real charts appear here.")}</p></div><Link to="/assets/devices/new">{copy(isFa, "ثبت تجهیز", "Register device")}</Link></div> : null}
      </section>
    </section>
  );
}
