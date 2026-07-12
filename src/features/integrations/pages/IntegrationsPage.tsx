import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

type Health = { status?: string; adapter?: string; executable?: boolean; message?: string };
type Preview = { sourceType?: string; total?: number; creates?: number; updates?: number; rows?: Array<{ action?: string; reason?: string }> };
type IntegrationKey = "netbox" | "wazuh";

const labels: Record<IntegrationKey, { title: string; purpose: string; preview: string }> = {
  netbox: {
    title: "NetBox",
    purpose: "منبع حقیقت دارایی، سایت، IP و تجهیزات. در وضعیت فعلی فقط پیش‌نمایش آزمایشی دارد.",
    preview: "پیش‌نمایش همگام‌سازی NetBox"
  },
  wazuh: {
    title: "Wazuh",
    purpose: "ورود Agent و رخداد امنیتی. در وضعیت فعلی فقط داده نمونه آزمایشی را نگاشت می‌کند.",
    preview: "پیش‌نمایش ورود Wazuh"
  }
};

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const text = await response.text();
  if (!response.ok) throw new Error(`درخواست ناموفق بود: ${response.status}`);
  if (/^\s*</.test(text)) throw new Error("API یکپارچه‌سازی از این مسیر در دسترس نیست.");
  return (text ? JSON.parse(text) : {}) as T;
}

export default function IntegrationsPage() {
  const current = useMemo<IntegrationKey | null>(() => {
    if (window.location.pathname.endsWith("/netbox")) return "netbox";
    if (window.location.pathname.endsWith("/wazuh")) return "wazuh";
    return null;
  }, []);
  const [health, setHealth] = useState<Record<IntegrationKey, Health> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([requestJson<Health>("/integrations/netbox/health"), requestJson<Health>("/integrations/wazuh/health")])
      .then(([netbox, wazuh]) => { setHealth({ netbox, wazuh }); setError(""); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "وضعیت یکپارچه‌سازی در دسترس نیست."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runPreview = (key: IntegrationKey) => {
    setWorking(true);
    requestJson<Preview>(`/integrations/${key}/sync-preview`)
      .then((payload) => { setPreview(payload); setError(""); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "پیش‌نمایش ناموفق بود."))
      .finally(() => setWorking(false));
  };

  if (loading) return <LoadingState />;
  if (!health && error) return <ErrorState message={error} onRetry={load} />;

  const keys: IntegrationKey[] = current ? [current] : ["netbox", "wazuh"];

  return (
    <section className="page-stack">
      <PageHeader
        title={current ? labels[current].title : "یکپارچه‌سازی‌ها"}
        eyebrow="اتصال‌های خارجی"
        description="اتصال‌های فعلی آزمایشی هستند و به عنوان تولیدی یا اجرای واقعی نمایش داده نمی‌شوند."
      />
      {error ? <div className="state-card is-error">{error}</div> : null}
      <div className="content-grid">
        {keys.map((key) => {
          const item = health?.[key] ?? {};
          return (
            <section key={key} className="content-panel">
              <h2>{labels[key].title} <span className="status-badge status-badge--warning">آزمایشی / Mock</span></h2>
              <p>{labels[key].purpose}</p>
              <dl className="detail-list">
                <dt>سلامت</dt><dd>{item.status ?? "نامشخص"}</dd>
                <dt>حالت</dt><dd>{item.adapter ?? `mock_${key}`}</dd>
                <dt>اجرای تولیدی</dt><dd>{item.executable ? "فعال" : "غیرفعال"}</dd>
                <dt>توضیح</dt><dd>{item.message ?? "فقط پیش‌نمایش امن در دسترس است."}</dd>
              </dl>
              <div className="button-row">
                <button className="primary-button" type="button" disabled={working} onClick={() => runPreview(key)}>{labels[key].preview}</button>
                <button className="secondary-button" type="button" disabled title="تا زمان تنظیم credential و مقصد واقعی، Apply غیرفعال است.">Apply تولیدی غیرفعال</button>
              </div>
            </section>
          );
        })}
      </div>
      {preview ? (
        <section className="panel-section">
          <h2>نتیجه پیش‌نمایش</h2>
          <div className="summary-grid">
            <article><span>منبع</span><strong>{preview.sourceType ?? "mock"}</strong></article>
            <article><span>کل</span><strong>{preview.total ?? 0}</strong></article>
            <article><span>ایجاد</span><strong>{preview.creates ?? 0}</strong></article>
            <article><span>به‌روزرسانی</span><strong>{preview.updates ?? 0}</strong></article>
          </div>
          <p>این فقط پیش‌نمایش است و هیچ تغییر تولیدی انجام نمی‌دهد.</p>
        </section>
      ) : null}
    </section>
  );
}
