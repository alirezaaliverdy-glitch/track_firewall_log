import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { NetworkDefenseMotion } from "@/components/dashboard/NetworkDefenseMotion";
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
  Activity,
  ArrowUpLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import "./DashboardPage.css";

type MetricRow = { metricKey?: unknown; value?: unknown };
type DashboardTone = "good" | "warning" | "danger" | "neutral";

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

function localizedActionTitle(item: DashboardActionItem, isFa: boolean) {
  return (isFa ? item.titleFa : item.titleEn) || item.title;
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

function needsHealthCollection(device: LinuxMonitoringDevice) {
  const snapshot = device.latestHealth;
  if (!snapshot || !hasResourceMetrics(snapshot)) return true;
  const staleAt = snapshot.staleAt ? new Date(snapshot.staleAt).getTime() : Number.NaN;
  if (Number.isFinite(staleAt) && staleAt <= Date.now()) return true;
  const collectedAt = new Date(snapshot.collectedAt).getTime();
  return Number.isFinite(collectedAt) && Date.now() - collectedAt > 15 * 60 * 1000;
}

function stateTone(state: string): DashboardTone {
  if (state === "healthy") return "good";
  if (["critical", "offline"].includes(state)) return "danger";
  if (["warning", "stale"].includes(state)) return "warning";
  return "neutral";
}

function stateColor(state: string) {
  if (state === "healthy") return "#2dd4bf";
  if (state === "warning") return "#fbbf24";
  if (["critical", "offline"].includes(state)) return "#fb7185";
  if (state === "stale") return "#a78bfa";
  return "#64748b";
}

function Ring({ radius, value, color, width, delay = 0 }: { radius: number; value: number | null; color: string; width: number; delay?: number }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  const style = {
    "--ring-offset": String(100 - safe),
    "--ring-color": color,
    "--ring-delay": `${delay}ms`,
  } as CSSProperties;

  return (
    <>
      <circle className="linux-ring__track" cx="100" cy="100" r={radius} pathLength="100" strokeWidth={width} />
      {value !== null ? <circle className="linux-ring__value" cx="100" cy="100" r={radius} pathLength="100" strokeWidth={width} style={style} /> : null}
    </>
  );
}

function LinuxServerChart({ device, language, t }: { device: LinuxMonitoringDevice; language: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const snapshot = device.latestHealth;
  const healthState = device.healthState ?? snapshot?.state ?? "unknown";
  const score = snapshot ? Math.max(0, Math.min(100, snapshot.score)) : null;
  const cpu = metricValue(snapshot, "cpu.usage_percent");
  const memory = metricValue(snapshot, "memory.usage_percent");
  const disk = metricValue(snapshot, "disk.usage_percent");
  const label = [
    `${t("dashboard.linux.healthScore")}: ${score === null ? t("dashboard.common.unknown") : number(score, language)}`,
    `${t("dashboard.linux.cpu")}: ${cpu === null ? t("dashboard.common.unknown") : `${number(Math.round(cpu), language)}%`}`,
    `${t("dashboard.linux.memory")}: ${memory === null ? t("dashboard.common.unknown") : `${number(Math.round(memory), language)}%`}`,
    `${t("dashboard.linux.disk")}: ${disk === null ? t("dashboard.common.unknown") : `${number(Math.round(disk), language)}%`}`,
  ].join("، ");

  const legend = [
    { key: "cpu", label: t("dashboard.linux.cpu"), value: cpu, color: "#22d3ee" },
    { key: "memory", label: t("dashboard.linux.memory"), value: memory, color: "#a78bfa" },
    { key: "disk", label: t("dashboard.linux.disk"), value: disk, color: "#f59e0b" },
  ];

  return (
    <article className={`linux-server-card linux-server-card--${stateTone(healthState)}`} data-testid="linux-server-chart">
      <header className="linux-server-card__header">
        <div>
          <h3>{device.name}</h3>
          <span dir="ltr">{device.host}</span>
        </div>
        <span className={`dashboard-status dashboard-status--${stateTone(healthState)}`}>{t(`dashboard.state.${healthState}`)}</span>
      </header>

      <div className="linux-ring" role="img" aria-label={label}>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <g transform="rotate(-90 100 100)">
            <Ring radius={78} value={score} color={stateColor(healthState)} width={12} />
            <Ring radius={61} value={cpu} color="#22d3ee" width={6} delay={100} />
            <Ring radius={51} value={memory} color="#a78bfa" width={6} delay={180} />
            <Ring radius={41} value={disk} color="#f59e0b" width={6} delay={260} />
          </g>
        </svg>
        <div className="linux-ring__center">
          <strong>{score === null ? "—" : number(score, language)}</strong>
          <span>{t("dashboard.linux.healthScore")}</span>
        </div>
      </div>

      <dl className="linux-metric-legend">
        {legend.map((item) => (
          <div key={item.key}>
            <dt><i style={{ background: item.color }} />{item.label}</dt>
            <dd>{item.value === null ? "—" : `${number(Math.round(item.value), language)}%`}</dd>
          </div>
        ))}
      </dl>

      <footer>
        <span><Clock3 size={14} />{shortDate(snapshot?.collectedAt, language, t("dashboard.common.notRecorded"))}</span>
        <Link to={`/monitoring/linux/${device.id}`}>{t("dashboard.actions.viewDetails")}<ArrowUpLeft size={15} /></Link>
      </footer>
    </article>
  );
}

function KpiCard({ icon, label, value, detail, tone = "neutral" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: DashboardTone }) {
  return (
    <article className={`dashboard-kpi dashboard-kpi--${tone}`}>
      <div className="dashboard-kpi__icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function ActionRows({ items, language, isFa, empty, t }: { items: DashboardActionItem[]; language: string; isFa: boolean; empty: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  if (!items.length) return <div className="dashboard-empty"><CheckCircle2 size={20} /><p>{empty}</p></div>;
  return (
    <ul className="dashboard-activity-list">
      {items.slice(0, 6).map((item) => (
        <li key={item.id}>
          <span className={`dashboard-activity-list__mark dashboard-activity-list__mark--${item.outcome === "succeeded" ? "good" : item.status === "failed" ? "danger" : "neutral"}`} />
          <div>
            <Link to={item.actionCenterPath}>{localizedActionTitle(item, isFa)}</Link>
            <span>{item.device?.name ?? t("dashboard.common.noTarget")} · {t(`dashboard.actionStatus.${item.status}`, { defaultValue: item.status })}</span>
          </div>
          <time>{shortDate(item.updatedAt, language, t("dashboard.common.notRecorded"))}</time>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? "fa";
  const isFa = language.startsWith("fa");
  const assets = useAssets();
  const findings = useFindings();
  const [linux, setLinux] = useState<LinuxSummary | null>(null);
  const [activity, setActivity] = useState<OperationalDashboardActivity | null>(null);
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

  useEffect(() => { void loadLinuxHealth(); }, [loadLinuxHealth]);
  useEffect(() => {
    getOperationalDashboardActivity().then((next) => { setActivity(next); setActivityError(false); }).catch(() => setActivityError(true));
  }, []);

  const linuxAttention = linux ? linux.warning + linux.critical + linux.offline + linux.stale + linux.unknown : 0;
  const failedActions = activity?.summary.failedActions ?? 0;
  const pendingApprovals = activity?.summary.pendingApprovals ?? 0;
  const criticalFindings = findings.stats.critical;
  const overallTone: DashboardTone = failedActions > 0 || criticalFindings > 0 ? "danger" : pendingApprovals > 0 || linuxAttention > 0 || assets.stats.needsReview > 0 ? "warning" : "good";
  const overallLabel = overallTone === "good" ? t("dashboard.health.normal") : overallTone === "danger" ? t("dashboard.health.critical") : t("dashboard.health.attention");
  const activeDevices = activity?.summary.activeDevices ?? assets.stats.total;
  const urgentItems = criticalFindings + failedActions;
  const visibleLinuxDevices = useMemo(() => {
    const rank: Record<DashboardTone, number> = { danger: 0, warning: 1, neutral: 2, good: 3 };
    return [...(linux?.devices ?? [])]
      .sort((left, right) => rank[stateTone(left.healthState ?? left.latestHealth?.state ?? "unknown")] - rank[stateTone(right.healthState ?? right.latestHealth?.state ?? "unknown")])
      .slice(0, 3);
  }, [linux]);
  const hiddenLinuxDevices = Math.max(0, (linux?.devices.length ?? 0) - visibleLinuxDevices.length);

  const priorities = useMemo(() => [
    { key: "failed", count: failedActions, icon: <Siren size={20} />, tone: "danger" as DashboardTone, title: t("dashboard.priority.failedTitle"), detail: t("dashboard.priority.failedDetail"), path: "/actions?view=history&status=failed" },
    { key: "approval", count: pendingApprovals, icon: <Clock3 size={20} />, tone: "warning" as DashboardTone, title: t("dashboard.priority.approvalTitle"), detail: t("dashboard.priority.approvalDetail"), path: "/actions?view=pending" },
    { key: "finding", count: criticalFindings, icon: <ShieldAlert size={20} />, tone: "danger" as DashboardTone, title: t("dashboard.priority.findingTitle"), detail: t("dashboard.priority.findingDetail"), path: "/security/findings" },
    { key: "linux", count: linuxAttention, icon: <Server size={20} />, tone: "warning" as DashboardTone, title: t("dashboard.priority.linuxTitle"), detail: t("dashboard.priority.linuxDetail"), path: "/monitoring/linux" },
  ].filter((item) => item.count > 0), [criticalFindings, failedActions, linuxAttention, pendingApprovals, t]);

  if ((assets.loading || findings.loading) && !activity) return <LoadingState label={t("dashboard.loading")} />;
  if (assets.error) return <ErrorState title={t("dashboard.errors.title")} message={t("dashboard.errors.assets")} onRetry={assets.refresh} />;
  if (findings.error) return <ErrorState title={t("dashboard.errors.title")} message={t("dashboard.errors.findings")} onRetry={findings.refresh} />;

  return (
    <section className="page-stack operational-dashboard dashboard-v2">
      <header className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <span className="dashboard-hero__eyebrow"><Activity size={15} />{t("dashboard.eyebrow")}</span>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.description")}</p>
          <div className="dashboard-hero__meta">
            <span><i className={`dashboard-live-dot dashboard-live-dot--${activityError ? "danger" : "good"}`} />{activityError ? t("dashboard.apiUnavailable") : t("dashboard.liveData")}</span>
            <span>{t("dashboard.lastUpdate")}: {shortDate(activity?.generatedAt, language, t("dashboard.common.notRecorded"))}</span>
          </div>
          <div className="dashboard-hero__actions">
            <Link to="/actions" className="primary-link">{t("dashboard.actions.actionCenter")}</Link>
            <Link to="/assets/devices/new" className="secondary-link">{t("dashboard.actions.registerDevice")}</Link>
          </div>
        </div>
        <NetworkDefenseMotion
          tone={overallTone}
          isFa={isFa}
          activeDevices={activeDevices}
          activeAlerts={criticalFindings}
        />
      </header>

      <section className="dashboard-kpi-grid" aria-label={t("dashboard.kpi.title")}>
        <KpiCard icon={overallTone === "good" ? <ShieldCheck /> : <CircleAlert />} label={t("dashboard.kpi.overallHealth")} value={overallLabel} detail={t("dashboard.kpi.overallDetail")} tone={overallTone} />
        <KpiCard icon={<Server />} label={t("dashboard.kpi.activeDevices")} value={number(activeDevices, language)} detail={t("dashboard.kpi.activeDetail")} />
        <KpiCard icon={<Clock3 />} label={t("dashboard.kpi.pendingApprovals")} value={number(pendingApprovals, language)} detail={t("dashboard.kpi.pendingDetail")} tone={pendingApprovals ? "warning" : "good"} />
        <KpiCard icon={<ShieldAlert />} label={isFa ? "موارد فوری" : "Urgent items"} value={number(urgentItems, language)} detail={t("dashboard.kpi.findingsDetail")} tone={urgentItems ? "danger" : "good"} />
      </section>

      <div className="dashboard-main-grid">
        <section className="dashboard-section dashboard-priority">
          <div className="dashboard-section__heading">
            <div><span>{t("dashboard.priority.eyebrow")}</span><h2>{t("dashboard.priority.title")}</h2></div>
          </div>
          {priorities.length ? (
            <div className="dashboard-priority-grid">
              {priorities.map((item) => (
                <Link key={item.key} to={item.path} className={`dashboard-priority-card dashboard-priority-card--${item.tone}`}>
                  <span className="dashboard-priority-card__icon">{item.icon}</span>
                  <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                  <b>{number(item.count, language)}</b>
                </Link>
              ))}
            </div>
          ) : <div className="dashboard-all-clear"><CheckCircle2 size={23} /><div><strong>{t("dashboard.priority.clearTitle")}</strong><span>{t("dashboard.priority.clearDetail")}</span></div></div>}
        </section>

        <section className="dashboard-section dashboard-recent">
          <div className="dashboard-section__heading dashboard-section__heading--inline">
            <div><span>{t("dashboard.recent.eyebrow")}</span><h2>{t("dashboard.recent.title")}</h2></div>
            <Link to="/actions" className="dashboard-text-link">{t("dashboard.recent.viewAll")}<ArrowUpLeft size={15} /></Link>
          </div>
          <ActionRows items={activity?.recentExecutions ?? []} language={language} isFa={isFa} empty={t("dashboard.recent.empty")} t={t} />
        </section>
      </div>

      <section className="dashboard-section dashboard-linux-section">
        <div className="dashboard-section__heading dashboard-section__heading--inline">
          <div><span>{t("dashboard.linux.eyebrow")}</span><h2>{t("dashboard.linux.title")}</h2><p>{t("dashboard.linux.description")}</p></div>
          <div className="dashboard-linux-tools">
            <div className="linux-fleet-summary" aria-label={t("dashboard.linux.fleetSummary")}>
              <span className="is-good">{t("dashboard.state.healthy")} <b>{number(linux?.healthy ?? 0, language)}</b></span>
              <span className="is-warning">{t("dashboard.state.warning")} <b>{number((linux?.warning ?? 0) + (linux?.stale ?? 0), language)}</b></span>
              <span className="is-danger">{t("dashboard.state.critical")} <b>{number((linux?.critical ?? 0) + (linux?.offline ?? 0), language)}</b></span>
              <span>{t("dashboard.state.unknown")} <b>{number(linux?.unknown ?? 0, language)}</b></span>
            </div>
            <button className="dashboard-refresh-button" type="button" disabled={linuxRefreshing} onClick={() => void loadLinuxHealth(true)}>
              <RefreshCw size={15} className={linuxRefreshing ? "is-spinning" : undefined} />
              {linuxRefreshing ? t("dashboard.linux.refreshing") : t("dashboard.linux.refresh")}
            </button>
            <Link className="dashboard-linux-link" to="/monitoring/linux">{t("dashboard.actions.viewDetails")}<ArrowUpLeft size={14} /></Link>
          </div>
        </div>

        {linuxError ? <div className="dashboard-inline-warning"><CircleAlert size={18} />{t("dashboard.errors.linux")}</div> : null}
        {!linuxError && linuxRefreshError ? <div className="dashboard-inline-warning"><CircleAlert size={18} />{t("dashboard.errors.linuxRefresh")}</div> : null}
        {!linuxError && visibleLinuxDevices.length ? (
          <div className="linux-server-grid">
            {visibleLinuxDevices.map((device) => <LinuxServerChart key={device.id} device={device} language={language} t={t} />)}
          </div>
        ) : !linuxError ? (
          <div className="dashboard-empty dashboard-empty--large"><Server size={28} /><div><strong>{t("dashboard.linux.emptyTitle")}</strong><p>{t("dashboard.linux.emptyDetail")}</p></div><Link className="secondary-link" to="/assets/devices/new">{t("dashboard.actions.registerDevice")}</Link></div>
        ) : null}
        {hiddenLinuxDevices > 0 ? <div className="dashboard-linux-more"><Link to="/monitoring/linux">{isFa ? `مشاهده ${number(hiddenLinuxDevices, language)} سرور دیگر` : `View ${number(hiddenLinuxDevices, language)} more servers`}<ArrowUpLeft size={14} /></Link></div> : null}
      </section>
    </section>
  );
}
