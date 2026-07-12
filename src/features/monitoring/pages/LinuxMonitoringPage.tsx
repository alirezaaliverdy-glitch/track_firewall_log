import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLinuxMonitoringDevices, getLinuxMonitoringSummary, refreshLinuxMonitoringDevice, type LinuxMonitoringDevice, type LinuxSummary } from "@/lib/linuxMonitoring";

export default function LinuxMonitoringPage({ params }: { params?: Record<string, string> }) {
  const [summary, setSummary] = useState<LinuxSummary | null>(null);
  const [devices, setDevices] = useState<LinuxMonitoringDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectedId = params?.deviceId;
  const selected = devices.find((device) => device.id === selectedId);
  const load = () => Promise.all([getLinuxMonitoringSummary(), getLinuxMonitoringDevices()]).then(([nextSummary, list]) => { setSummary(nextSummary); setDevices(list.devices); setError(null); }).catch((err: Error) => setError(err.message));
  useEffect(() => { void load(); }, []);
  const refresh = (id: string) => refreshLinuxMonitoringDevice(id).then(() => load()).catch((err: Error) => setError(err.message));
  return (
    <section className="page-stack">
      <PageHeader title="Linux health" eyebrow="Monitoring" description="Read-only SSH health snapshots, metric samples, and bounded monitoring status for Linux servers." />
      {error ? <div className="state-card is-error">{error}</div> : null}
      {summary ? <div className="summary-grid">
        <article><span>Total</span><strong>{summary.total}</strong></article>
        <article><span>Healthy</span><strong>{summary.healthy}</strong></article>
        <article><span>Warning</span><strong>{summary.warning}</strong></article>
        <article><span>Critical</span><strong>{summary.critical}</strong></article>
        <article><span>Unknown</span><strong>{summary.unknown}</strong></article>
      </div> : <div className="state-card">Loading Linux health...</div>}
      {selected ? <section className="panel-section"><h2>{selected.name}</h2><p>{selected.host}</p><div className="summary-grid"><article><span>Health</span><strong>{selected.latestHealth?.state ?? "unknown"}</strong></article><article><span>Score</span><strong>{selected.latestHealth?.score ?? "-"}</strong></article><article><span>Last collection</span><strong>{selected.latestHealth?.collectedAt ? new Date(selected.latestHealth.collectedAt).toLocaleString() : "none"}</strong></article></div><button className="primary-button" onClick={() => void refresh(selected.id)}>Refresh read-only health</button></section> : null}
      <section className="panel-section">
        <h2>Linux devices</h2>
        <div className="responsive-table"><table><thead><tr><th>Name</th><th>Host</th><th>Status</th><th>Health</th><th>Score</th><th>Action</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><a href={`/monitoring/linux/${device.id}`}>{device.name}</a></td><td>{device.host}</td><td>{device.status}</td><td>{device.latestHealth?.state ?? "unknown"}</td><td>{device.latestHealth?.score ?? "-"}</td><td><button className="text-button" onClick={() => void refresh(device.id)}>Refresh</button></td></tr>)}</tbody></table></div>
      </section>
    </section>
  );
}
