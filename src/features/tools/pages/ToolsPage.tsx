import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { listDiagnostics, runDiagnostic, type DiagnosticSession } from "@/lib/diagnostics";
import { useEffect, useMemo, useState } from "react";

const routeTitle: Record<string, string> = {
  "/tools/network-check": "تست سریع شبکه",
  "/tools/domain-check": "بررسی دامنه",
  "/tools/ip-check": "بررسی IP",
  "/tools/nmap": "Nmap",
  "/tools/dns": "DNS",
  "/tools/http": "HTTP و TLS",
  "/tools/ports": "پورت‌ها",
  "/tools/traceroute": "مسیر",
  "/tools/ip-info": "اطلاعات IP",
  "/tools/subnet": "Subnet",
  "/tools/history": "تاریخچه",
  "/tools/monitors": "مانیتورها"
};

function checkLabel(kind: unknown) {
  if (kind === "dns") return "DNS";
  if (kind === "http") return "HTTP";
  if (kind === "ping") return "Ping";
  if (kind === "tcp") return "TCP";
  return String(kind ?? "check");
}

function providerIds(session: DiagnosticSession) {
  return session.checks.map((check) => String(check.providerRequestId ?? "")).filter(Boolean).join(", ");
}

export default function ToolsPage() {
  const title = routeTitle[window.location.pathname] ?? "ابزارهای تشخیصی";
  const isNmap = window.location.pathname === "/tools/nmap";
  const [target, setTarget] = useState(isNmap ? "scanme.nmap.org" : "example.com");
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [active, setActive] = useState<DiagnosticSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (isNmap) return ["Nmap safe worker در Milestone بعدی فعال می‌شود؛ این صفحه فعلا سیاست و مسیر را نشان می‌دهد."];
    if (target.includes(":")) return ["DNS", "TCP"];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) return ["Ping", "IP/ASN"];
    return ["DNS", "Ping", "HTTP/HTTPS", "TLS", "TCP 443", "تاریخچه"];
  }, [isNmap, target]);

  const refresh = () => {
    setLoading(true);
    listDiagnostics().then((data) => {
      setSessions(data.sessions);
      setActive((current) => current ?? data.sessions[0] ?? null);
      setError(null);
    }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const submit = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await runDiagnostic(target);
      setActive(data.session);
      setSessions((current) => [data.session, ...current.filter((item) => item.id !== data.session.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostic failed.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <section className="page-stack">
      <PageHeader
        title={title}
        eyebrow="Diagnostics"
        description="بررسی‌های عمومی با Check-Host external nodes اجرا و نتیجه در پایگاه داده ثبت می‌شود. مسیرهای خصوصی و Nmap بدون scope مجاز اجرا نمی‌شوند."
        actions={<a className="secondary-link" href="/dashboard">بازگشت به داشبورد</a>}
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <section className="content-panel">
        <h2>اجرای بررسی</h2>
        <div className="form-grid">
          <label>دامنه، IP، URL، پورت یا CIDR را وارد کنید
            <input value={target} onChange={(event) => setTarget(event.target.value)} disabled={running || isNmap} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => void submit()} disabled={running || isNmap}>{running ? "در حال اجرا" : "اجرای بررسی واقعی"}</button>
          <a className="secondary-link" href="/tools/history">تاریخچه</a>
          <a className="secondary-link" href="/tools/nmap">Nmap</a>
          <a className="secondary-link" href="/tools/monitors">مانیتورها</a>
        </div>
        {isNmap ? <p className="muted-text">Nmap فقط از Worker ایزوله و scope مجاز اجرا خواهد شد. این کنترل تا پیاده‌سازی Worker فعال نیست.</p> : null}
        <div className="tag-row">{suggestions.map((item) => <span key={item} className="status-pill">{item}</span>)}</div>
      </section>

      {active ? (
        <section className="content-panel">
          <h2>خلاصه نتیجه</h2>
          <div className="summary-grid">
            <article className="metric-panel"><span>وضعیت</span><strong>{active.state}</strong></article>
            <article className="metric-panel"><span>Provider invoked</span><strong>{active.providerInvoked ? "true" : "false"}</strong></article>
            <article className="metric-panel"><span>منبع بررسی</span><strong>Check-Host external nodes</strong></article>
            <article className="metric-panel"><span>Session ID</span><strong>{active.id}</strong></article>
          </div>
          <p>Target: {active.normalizedTarget}</p>
          <p>Provider request IDs: {providerIds(active) || "ثبت نشده"}</p>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Check</th><th>Request ID</th><th>Duration</th><th>Source</th></tr></thead>
              <tbody>
                {active.checks.map((check, index) => (
                  <tr key={`${active.id}-${index}`}>
                    <td>{checkLabel(check.kind)}</td>
                    <td>{String(check.providerRequestId ?? "-")}</td>
                    <td>{String(check.durationMs ?? "-")} ms</td>
                    <td>{String(check.source ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="content-panel">
        <h2>تاریخچه</h2>
        {sessions.length === 0 ? <p>هنوز نتیجه‌ای ثبت نشده است.</p> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>زمان</th><th>Target</th><th>State</th><th>Provider</th><th>Invoked</th></tr></thead>
              <tbody>{sessions.map((session) => (
                <tr key={session.id} onClick={() => setActive(session)}>
                  <td>{new Date(session.createdAt).toLocaleString("fa-IR")}</td>
                  <td>{session.normalizedTarget}</td>
                  <td>{session.state}</td>
                  <td>{session.provider}</td>
                  <td>{session.providerInvoked ? "true" : "false"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
