import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAssets } from "@/features/assets/hooks/useAssets";
import { useFindings } from "@/features/security/hooks/useFindings";
import { useEffect, useState } from "react";
import { getLinuxMonitoringSummary, type LinuxSummary } from "@/lib/linuxMonitoring";
import { getOperationalDashboardActivity, type DashboardActionItem, type DashboardConfigurationChange, type DashboardDeviceRegistration, type OperationalDashboardActivity } from "@/lib/dashboard";
import { Link } from "react-router-dom";

function shortDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function deviceLabel(device: DashboardActionItem["device"]) {
  return device ? `${device.name} (${device.host})` : "No target device";
}

function ActionRows({ items, empty }: { items: DashboardActionItem[]; empty: string }) {
  if (!items.length) return <p>{empty}</p>;
  return <ul className="operational-feed">{items.map((item) => <li key={item.id}><div><Link to={item.actionCenterPath}>{item.title}</Link><span>{deviceLabel(item.device)} · {item.status} · {item.connectorInvoked ? "connector evidence" : "no connector evidence"}</span></div><time>{shortDate(item.updatedAt)}</time></li>)}</ul>;
}

function DeviceRows({ items }: { items: DashboardDeviceRegistration[] }) {
  if (!items.length) return <p>No device registration has been recorded yet.</p>;
  return <ul className="operational-feed">{items.map((item) => <li key={item.id}><div><Link to={item.path}>{item.name}</Link><span>{item.vendor} / {item.platform} · {item.host} · {item.verified ? "verified" : "unverified"}</span></div><time>{shortDate(item.createdAt)}</time></li>)}</ul>;
}

function ChangeRows({ items }: { items: DashboardConfigurationChange[] }) {
  if (!items.length) return <p>No confirmed configuration change is recorded in the recent activity window.</p>;
  return <ul className="operational-feed">{items.map((item) => <li key={item.id}><div><Link to={item.path}>{item.title}</Link><span>{item.device ? `${item.device.name} · ` : ""}{item.actionType} · {item.source}</span></div><time>{shortDate(item.timestamp)}</time></li>)}</ul>;
}

export default function DashboardPage() {
  const assets = useAssets();
  const findings = useFindings();
  const [linux, setLinux] = useState<LinuxSummary | null>(null);
  const [activity, setActivity] = useState<OperationalDashboardActivity | null>(null);
  const [activityError, setActivityError] = useState("");

  useEffect(() => { getLinuxMonitoringSummary().then(setLinux).catch(() => setLinux(null)); }, []);
  useEffect(() => { getOperationalDashboardActivity().then((next) => { setActivity(next); setActivityError(""); }).catch((error) => setActivityError(error instanceof Error ? error.message : "Dashboard activity API unavailable")); }, []);

  if ((assets.loading || findings.loading) && !activity) return <LoadingState />;
  if (assets.error) return <ErrorState message={assets.error} onRetry={assets.refresh} />;
  if (findings.error) return <ErrorState message={findings.error} onRetry={findings.refresh} />;

  const linuxAttention = linux ? linux.warning + linux.critical + linux.offline + linux.stale + linux.unknown : null;
  const operationalHealth = (activity?.summary.failedActions ?? 0) > 0 || findings.stats.critical > 0 || assets.stats.needsReview > 0 ? "Needs attention" : "Normal";

  return (
    <section className="page-stack operational-dashboard">
      <PageHeader
        title="Operational Dashboard"
        eyebrow="Command Center"
        description="Live operational activity from Action Center, inventory, device onboarding, findings, and monitoring. Placeholder task cards are gone; every section is backed by stored product data."
        actions={<><Link to="/actions" className="secondary-link">Action Center</Link><Link to="/assets/devices/new" className="primary-link">Register device</Link></>}
      />

      {activityError ? <section className="content-panel"><h2>Activity API</h2><p>{activityError}</p></section> : null}

      <div className="summary-grid dashboard-summary">
        <article className="metric-panel"><span>Operational health</span><strong>{operationalHealth}</strong></article>
        <article className="metric-panel"><span>Active inventory</span><strong>{activity?.summary.activeDevices ?? assets.stats.total}</strong></article>
        <article className="metric-panel"><span>Pending approvals</span><strong>{activity?.summary.pendingApprovals ?? 0}</strong></article>
        <article className="metric-panel"><span>Successful actions</span><strong>{activity?.summary.successfulActions ?? 0}</strong></article>
        <article className="metric-panel"><span>Failed actions</span><strong>{activity?.summary.failedActions ?? 0}</strong></article>
        <article className="metric-panel"><span>Critical findings</span><strong>{findings.stats.critical}</strong></article>
        <article className="metric-panel"><span>Linux attention</span><strong>{linuxAttention === null ? "Unknown" : linuxAttention}</strong></article>
        <article className="metric-panel"><span>Configuration changes</span><strong>{activity?.summary.latestConfigurationChanges ?? 0}</strong></article>
      </div>

      <section className="content-panel">
        <h2>Immediate operator focus</h2>
        <div className="button-row">
          <Link to="/actions?view=pending" className="primary-link">Review pending approvals</Link>
          <Link to="/actions?view=history&status=failed" className="secondary-link">Investigate failed actions</Link>
          <Link to="/assets/devices/new" className="secondary-link">Register device</Link>
          <Link to="/monitoring/linux" className="secondary-link">Linux monitoring</Link>
          <Link to="/security/findings" className="secondary-link">Findings</Link>
        </div>
      </section>

      <div className="content-grid operational-grid-wide">
        <section className="content-panel"><h2>Recent executions</h2><ActionRows items={activity?.recentExecutions ?? []} empty="No recent execution has been recorded." /></section>
        <section className="content-panel"><h2>Pending approvals</h2><ActionRows items={activity?.pendingApprovals ?? []} empty="No ActionPlan is waiting for approval." /></section>
        <section className="content-panel"><h2>Failed actions</h2><ActionRows items={activity?.failedActions ?? []} empty="No failed action is recorded in the recent window." /></section>
        <section className="content-panel"><h2>Successful actions</h2><ActionRows items={activity?.successfulActions ?? []} empty="No connector-backed success is recorded yet." /></section>
        <section className="content-panel"><h2>Recent device registrations</h2><DeviceRows items={activity?.recentDeviceRegistrations ?? []} /></section>
        <section className="content-panel"><h2>Latest configuration changes</h2><ChangeRows items={activity?.latestConfigurationChanges ?? []} /></section>
      </div>
    </section>
  );
}