import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLinuxMonitoringDevices, getLinuxMonitoringSummary, refreshLinuxMonitoringDevice, type LinuxMonitoringDevice, type LinuxSummary } from "@/lib/linuxMonitoring";

const stateFa: Record<string, string> = {
  healthy: "سالم",
  warning: "هشدار",
  critical: "بحرانی",
  offline: "آفلاین",
  stale: "قدیمی",
  unknown: "نامشخص",
  online: "آنلاین"
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("fa-IR") : "ثبت نشده";
}

function healthTone(state?: string) {
  if (state === "healthy") return "status-badge--good";
  if (state === "critical" || state === "offline") return "status-badge--danger";
  if (state === "warning" || state === "stale") return "status-badge--warning";
  return "status-badge--neutral";
}

export default function LinuxMonitoringPage({ params }: { params?: Record<string, string> }) {
  const [summary, setSummary] = useState<LinuxSummary | null>(null);
  const [devices, setDevices] = useState<LinuxMonitoringDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const selectedId = params?.deviceId;
  const selected = devices.find((device) => device.id === selectedId);

  const load = () => Promise.all([getLinuxMonitoringSummary(), getLinuxMonitoringDevices()])
    .then(([nextSummary, list]) => { setSummary(nextSummary); setDevices(list.devices); setError(null); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => { void load(); }, []);

  const refresh = (id: string) => {
    setWorkingId(id);
    refreshLinuxMonitoringDevice(id).then(() => load()).catch((err: Error) => setError(err.message)).finally(() => setWorkingId(null));
  };

  const rows = useMemo(() => devices.slice(0, 25), [devices]);

  return (
    <section className="page-stack">
      <PageHeader title="سلامت Linux" eyebrow="پایش" description="نمای خواندنی سلامت سرورهای Linux، آخرین جمع‌آوری و وضعیت داده‌ها." />
      {error ? <div className="state-card is-error">{error}</div> : null}
      {summary ? (
        <div className="summary-grid">
          <article><span>کل سرورها</span><strong>{summary.total}</strong></article>
          <article><span>سالم</span><strong>{summary.healthy}</strong></article>
          <article><span>هشدار</span><strong>{summary.warning}</strong></article>
          <article><span>بحرانی</span><strong>{summary.critical}</strong></article>
          <article><span>نامشخص</span><strong>{summary.unknown}</strong></article>
        </div>
      ) : <div className="state-card">در حال دریافت سلامت Linux...</div>}

      {selected ? (
        <section className="panel-section">
          <h2>{selected.name}</h2>
          <p>{selected.host}</p>
          <div className="summary-grid">
            <article><span>وضعیت سلامت</span><strong>{stateFa[selected.latestHealth?.state ?? "unknown"] ?? selected.latestHealth?.state ?? "نامشخص"}</strong></article>
            <article><span>امتیاز</span><strong>{selected.latestHealth?.score ?? "-"}</strong></article>
            <article><span>آخرین جمع‌آوری</span><strong>{formatDate(selected.latestHealth?.collectedAt)}</strong></article>
          </div>
          <p>{selected.latestHealth?.summary ?? "هنوز snapshot سلامت برای این سرور ثبت نشده است."}</p>
          <button className="primary-button" type="button" disabled={workingId === selected.id} onClick={() => refresh(selected.id)}>جمع‌آوری خواندنی سلامت</button>
        </section>
      ) : null}

      <section className="panel-section">
        <h2>سرورهای Linux</h2>
        {rows.length === 0 ? <div className="state-card">هیچ سرور Linux برای پایش ثبت نشده است.</div> : (
          <div className="responsive-table">
            <table>
              <thead><tr><th>نام</th><th>IP / Host</th><th>سایت</th><th>وضعیت</th><th>سلامت</th><th>امتیاز</th><th>آخرین جمع‌آوری</th><th>عملیات</th></tr></thead>
              <tbody>{rows.map((device) => {
                const state = device.latestHealth?.state ?? "unknown";
                return (
                  <tr key={device.id}>
                    <td><a href={`/monitoring/linux/${device.id}`}>{device.name}</a></td>
                    <td>{device.host}</td>
                    <td>{device.asset?.site?.name ?? "ثبت نشده"}</td>
                    <td>{stateFa[device.status] ?? device.status}</td>
                    <td><span className={`status-badge ${healthTone(state)}`}>{stateFa[state] ?? state}</span></td>
                    <td>{device.latestHealth?.score ?? "-"}</td>
                    <td>{formatDate(device.latestHealth?.collectedAt)}</td>
                    <td><button className="text-button" type="button" disabled={workingId === device.id} onClick={() => refresh(device.id)}>{workingId === device.id ? "در حال جمع‌آوری" : "Refresh"}</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
