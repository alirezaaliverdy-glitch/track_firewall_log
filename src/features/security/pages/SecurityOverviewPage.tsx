import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Activity,
  BookOpenCheck,
  Boxes,
  ChevronLeft,
  CircleGauge,
  Crosshair,
  FileSearch2,
  LifeBuoy,
  LockKeyhole,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useSecurityOperations } from "../hooks/useSecurityOperations";
import type { SecurityFinding } from "@/lib/platform";
import { securityDisplayText } from "../securityPresentation";

const severityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function findingPriority(finding: SecurityFinding) {
  return (severityWeight[finding.severity] ?? 0) * 1_000_000_000_000 + new Date(finding.lastSeen || 0).getTime();
}

function severityClass(severity: string) {
  return ["critical", "high", "medium", "low"].includes(severity) ? severity : "unknown";
}

function FrameworkCard({ icon, title, code, description, metric, state, to }: { icon: ReactNode; title: string; code: string; description: string; metric: string; state: "operational" | "partial" | "unmeasured"; to?: string }) {
  const body = <><header><span>{icon}</span><div><small>{code}</small><h3>{title}</h3></div><i className={`security-framework-state security-framework-state--${state}`} /></header><p>{description}</p><footer><strong>{metric}</strong>{to ? <ChevronLeft size={16} /> : null}</footer></>;
  return to ? <Link className={`security-framework-card security-framework-card--${state}`} to={to}>{body}</Link> : <article className={`security-framework-card security-framework-card--${state}`}>{body}</article>;
}

export default function SecurityOverviewPage() {
  const { t, i18n } = useTranslation();
  const { findings, rules, incidents, assets, stats, loading, refreshing, lastUpdatedAt, monitoring, emailSettings, error, refresh } = useSecurityOperations();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa") ? "fa-IR" : "en-US";

  const priorityFindings = useMemo(() => [...stats.openFindings].sort((a, b) => findingPriority(b) - findingPriority(a)).slice(0, 6), [stats.openFindings]);
  const totalOpen = stats.openCount;
  const otherOpen = Math.max(0, totalOpen - stats.critical - stats.high);
  const criticalEnd = totalOpen ? (stats.critical / totalOpen) * 360 : 0;
  const highEnd = totalOpen ? criticalEnd + (stats.high / totalOpen) * 360 : 0;
  const riskTone = stats.critical || stats.openIncidents.some((item) => item.severity === "critical") ? "critical" : stats.high || stats.openIncidents.some((item) => item.severity === "high") ? "high" : totalOpen || stats.openIncidents.length ? "medium" : "stable";
  const activeIncidents = stats.openIncidents.slice(0, 4);
  const lastObservedAt = [...findings.map((item) => item.lastSeen), ...incidents.map((item) => item.updatedAt)].filter(Boolean).sort().at(-1);
  const ringStyle = { "--security-critical-end": `${criticalEnd}deg`, "--security-high-end": `${highEnd}deg` } as CSSProperties;
  const now = Date.now();
  const visibleDeviceIds = new Set(assets.map((asset) => asset.device?.id).filter(Boolean));
  const monitoredCollectors = monitoring?.collectors.devices.filter((device) => visibleDeviceIds.has(device.deviceId) && device.enabled).length ?? 0;
  const freshCollectors = monitoring?.collectors.devices.filter((device) => visibleDeviceIds.has(device.deviceId) && device.enabled && device.consecutiveFailures === 0 && device.lastSuccessAt && now - new Date(device.lastSuccessAt).getTime() < Math.max(device.effectiveIntervalSeconds * 2, 120) * 1000).length ?? 0;
  const monitorReady = Boolean(monitoring?.enabled && monitoring.running && monitoring.detection.enabledRules && monitoredCollectors > 0 && freshCollectors === monitoredCollectors);
  const emailReady = Boolean(emailSettings?.enabled && emailSettings.smtpConfigured && (emailSettings.recipients?.some((recipient) => recipient.enabled) ?? Boolean(emailSettings.recipientEmails.length)));
  const emailDeliveryProblem = Boolean(emailSettings?.lastErrorCode || emailSettings?.deliveries.some((delivery) => delivery.status === "failed"));
  const dataLimited = totalOpen > findings.length;

  if (loading) return <LoadingState />;
  if (error && !lastUpdatedAt) return <ErrorState message={error} onRetry={refresh} />;

  const framework = [
    { key: "govern", icon: <BookOpenCheck size={21} />, code: "GV", metric: t("security.framework.govern.metric"), state: "operational" as const, to: "/actions" },
    { key: "identify", icon: <Boxes size={21} />, code: "ID", metric: t("security.framework.identify.metric", { count: assets.length.toLocaleString(locale) }), state: assets.length ? "operational" as const : "partial" as const, to: "/assets" },
    { key: "protect", icon: <LockKeyhole size={21} />, code: "PR", metric: t("security.framework.protect.metric"), state: "operational" as const, to: "/actions" },
    { key: "detect", icon: <Radar size={21} />, code: "DE", metric: t("security.framework.detect.metric", { enabled: stats.enabledRules.toLocaleString(locale), total: rules.length.toLocaleString(locale) }), state: monitorReady ? "operational" as const : "partial" as const, to: "/security/rules" },
    { key: "respond", icon: <Siren size={21} />, code: "RS", metric: t("security.framework.respond.metric", { count: stats.openIncidents.length.toLocaleString(locale) }), state: "operational" as const, to: "/security/findings" },
    { key: "recover", icon: <LifeBuoy size={21} />, code: "RC", metric: t("security.framework.recover.metric"), state: "unmeasured" as const },
  ];

  return (
    <section className="page-stack security-operations-page">
      <PageHeader
        title={t("security.overview.title")}
        eyebrow={t("security.overview.eyebrow")}
        description={t("security.overview.description")}
        actions={<><button type="button" className="secondary-button security-refresh-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} />{refreshing ? t("security.live.refreshing") : t("security.actions.refresh")}</button><Link className="primary-link" to="/security/findings"><FileSearch2 size={16} />{t("security.actions.openQueue")}</Link></>}
      />

      <div className="security-live-status" aria-live="polite">
        <span className={monitorReady ? "is-ready" : "is-warning"}><i />{monitoring ? monitorReady ? t("security.live.monitorReady", { count: freshCollectors.toLocaleString(locale) }) : t("security.live.monitorNotReady") : t("security.live.monitorUnknown")}</span>
        <Link to="/security/email-alerts" className={emailReady && !emailDeliveryProblem ? "is-ready" : "is-warning"}>{emailSettings ? emailDeliveryProblem ? t("security.live.emailProblem") : emailReady ? t("security.live.emailReady") : t("security.live.emailNotReady") : t("security.live.emailUnknown")}<ChevronLeft size={14} /></Link>
        <small>{lastUpdatedAt ? t("security.live.lastRefresh", { date: new Date(lastUpdatedAt).toLocaleString(locale) }) : t("security.live.noRefresh")}</small>
      </div>
      {error ? <div className="security-live-warning" role="alert">{t("security.live.refreshFailed")} <button type="button" onClick={() => void refresh()}>{t("security.detail.retry")}</button></div> : null}
      {dataLimited ? <div className="security-live-warning" role="status">{t("security.live.limitedResults")}</div> : null}

      <section className={`security-posture-hero security-posture-hero--${riskTone}`}>
        <div className="security-posture-copy">
          <span><ShieldCheck size={16} />{t("security.posture.eyebrow")}</span>
          <h2>{t(`security.posture.${riskTone}.title`)}</h2>
          <p>{!monitorReady && riskTone === "stable" ? t("security.live.noCoverageClaim") : t(`security.posture.${riskTone}.description`)}</p>
          <div className="security-posture-meta"><span><Activity size={14} />{t("security.posture.sources", { findings: totalOpen.toLocaleString(locale), incidents: incidents.length.toLocaleString(locale) })}</span><span><RefreshCw size={14} />{lastObservedAt ? t("security.posture.lastObserved", { date: new Date(lastObservedAt).toLocaleString(locale) }) : t("security.posture.noObservation")}</span></div>
        </div>
        <div className="security-risk-ring" style={ringStyle} role="img" aria-label={t("security.posture.ringLabel", { count: totalOpen })}>
          <div><strong>{totalOpen.toLocaleString(locale)}</strong><span>{t("security.metrics.open")}</span></div>
        </div>
        <div className="security-risk-legend">
          <span className="is-critical"><i />{t("security.severity.critical")}<strong>{stats.critical.toLocaleString(locale)}</strong></span>
          <span className="is-high"><i />{t("security.severity.high")}<strong>{stats.high.toLocaleString(locale)}</strong></span>
          <span className="is-other"><i />{t("security.severity.other")}<strong>{otherOpen.toLocaleString(locale)}</strong></span>
        </div>
      </section>

      <div className="security-metric-grid">
        <Link to="/security/findings" className="security-metric-card security-metric-card--danger"><span><ShieldAlert size={20} /></span><div><small>{t("security.metrics.urgent")}</small><strong>{(stats.critical + stats.high).toLocaleString(locale)}</strong><p>{t("security.metrics.urgentHelp")}</p></div></Link>
        <Link to="/assets" className="security-metric-card security-metric-card--cyan"><span><Crosshair size={20} /></span><div><small>{t("security.metrics.affectedAssets")}</small><strong>{stats.affectedAssets.toLocaleString(locale)}</strong><p>{t("security.metrics.affectedAssetsHelp")}</p></div></Link>
        <Link to="/security/rules" className="security-metric-card security-metric-card--violet"><span><CircleGauge size={20} /></span><div><small>{t("security.metrics.detectionCoverage")}</small><strong>{rules.length ? `${stats.ruleCoverage.toLocaleString(locale)}٪` : "—"}</strong><p>{t("security.metrics.detectionCoverageHelp", { enabled: stats.enabledRules, total: rules.length })}</p></div></Link>
        <article className="security-metric-card security-metric-card--amber"><span><Siren size={20} /></span><div><small>{t("security.metrics.openIncidents")}</small><strong>{stats.openIncidents.length.toLocaleString(locale)}</strong><p>{t("security.metrics.openIncidentsHelp")}</p></div></article>
      </div>

      <section className="security-framework-section">
        <header><div><span>{t("security.framework.eyebrow")}</span><h2>{t("security.framework.title")}</h2><p>{t("security.framework.description")}</p></div><div className="security-framework-legend"><span className="is-operational"><i />{t("security.framework.operational")}</span><span className="is-partial"><i />{t("security.framework.partial")}</span><span className="is-unmeasured"><i />{t("security.framework.unmeasured")}</span></div></header>
        <div className="security-framework-grid">{framework.map((item) => <FrameworkCard key={item.key} icon={item.icon} title={t(`security.framework.${item.key}.title`)} code={item.code} description={t(`security.framework.${item.key}.description`)} metric={item.metric} state={item.state} to={item.to} />)}</div>
        <footer><ShieldAlert size={15} />{t("security.framework.disclaimer")}</footer>
      </section>

      <div className="security-work-grid">
        <section className="security-priority-panel">
          <header><div><span>{t("security.queue.eyebrow")}</span><h2>{t("security.queue.title")}</h2><p>{t("security.queue.description")}</p></div><Link to="/security/findings">{t("security.queue.viewAll")}<ChevronLeft size={16} /></Link></header>
          {priorityFindings.length ? <div className="security-priority-list">{priorityFindings.map((finding, index) => <Link key={finding.id} to={`/security/findings/${finding.id}`} className="security-priority-row"><span className={`security-priority-rank security-priority-rank--${severityClass(finding.severity)}`}>{(index + 1).toLocaleString(locale)}</span><div><strong>{securityDisplayText(finding.title, i18n.resolvedLanguage ?? i18n.language)}</strong><p>{securityDisplayText(finding.summary, i18n.resolvedLanguage ?? i18n.language)}</p><small>{finding.asset?.name ?? finding.device?.name ?? t("security.queue.unknownAsset")}</small></div><span className={`security-severity security-severity--${severityClass(finding.severity)}`}>{t(`security.severity.${severityClass(finding.severity)}`, { defaultValue: finding.severity })}</span><time>{finding.lastSeen ? new Date(finding.lastSeen).toLocaleString(locale) : "—"}</time><span className="security-priority-open">{t("security.queue.reviewAndResolve")}<ChevronLeft size={16} /></span></Link>)}</div> : <div className="security-inline-empty"><ShieldCheck size={30} /><div><strong>{t("security.queue.emptyTitle")}</strong><p>{t("security.queue.emptyDescription")}</p></div></div>}
        </section>

        <aside className="security-side-stack">
          <section className="security-readiness-panel">
            <header><span><Radar size={19} /></span><div><small>{t("security.detection.eyebrow")}</small><h2>{t("security.detection.title")}</h2></div></header>
            <div className="security-coverage-bar"><span><b>{t("security.detection.enabled")}</b><strong>{stats.enabledRules.toLocaleString(locale)} / {rules.length.toLocaleString(locale)}</strong></span><div><i style={{ width: `${stats.ruleCoverage}%` }} /></div></div>
            <p>{t("security.detection.description")}</p>
            <Link to="/security/rules">{t("security.detection.manage")}<ChevronLeft size={16} /></Link>
          </section>
          <section className="security-incidents-panel">
            <header><span><Siren size={19} /></span><div><small>{t("security.incidents.eyebrow")}</small><h2>{t("security.incidents.title")}</h2></div></header>
            {activeIncidents.length ? <ul>{activeIncidents.map((incident) => <li key={incident.id}><span className={`security-severity-dot security-severity-dot--${severityClass(incident.severity)}`} /><div><strong>{securityDisplayText(incident.title, i18n.resolvedLanguage ?? i18n.language)}</strong><small>{t(`security.incidentStatus.${incident.status}`, { defaultValue: incident.status })} · {incident.eventCount.toLocaleString(locale)} {t("security.incidents.events")}</small></div></li>)}</ul> : <div className="security-compact-empty"><ShieldCheck size={21} /><span>{t("security.incidents.empty")}</span></div>}
          </section>
        </aside>
      </div>
    </section>
  );
}
