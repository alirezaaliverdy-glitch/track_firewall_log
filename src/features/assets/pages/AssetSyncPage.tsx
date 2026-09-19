import { useMemo, useState } from "react";
import { CheckCircle2, Database, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { API_BASE_URL } from "@/config/frontendEnv";

type SourceKey = "netbox" | "wazuh";
type PreviewRow = { action?: string; matchName?: string | null; identity?: { hostname?: string; managementIp?: string; externalId?: string } };
type Preview = { sourceType?: string; total?: number; creates?: number; updates?: number; rows?: PreviewRow[] };
type ApplyResult = Preview & { applied?: { created?: number; updated?: number }; idempotentReplay?: boolean; syncRunId?: string };
type DeviceSync = { scanned?: number; created?: number; updated?: number };

async function requestJson<T>(path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
  });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error("پاسخ سرویس قابل پردازش نبود. دوباره تلاش کنید."); }
  if (!response.ok) {
    const details = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(String(details.detail ?? details.message ?? details.error ?? "درخواست همگام‌سازی ناموفق بود."));
  }
  return payload as T;
}

const sources: Record<SourceKey, { title: string; description: string }> = {
  netbox: { title: "NetBox", description: "دارایی‌های نمونه NetBox را پیش‌نمایش کنید و فقط پس از بررسی، در محیط آزمایشی ثبت کنید." },
  wazuh: { title: "Wazuh", description: "Agent و رخدادهای نمونه Wazuh را پیش‌نمایش کنید و سپس ثبت آزمایشی را تأیید کنید." }
};

function Summary({ total = 0, creates = 0, updates = 0 }: { total?: number; creates?: number; updates?: number }) {
  return <div className="summary-grid"><article><span>کل رکوردها</span><strong>{total}</strong></article><article><span>ایجاد</span><strong>{creates}</strong></article><article><span>به‌روزرسانی</span><strong>{updates}</strong></article></div>;
}

export default function AssetSyncPage() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Partial<Record<SourceKey, Preview>>>({});
  const [confirming, setConfirming] = useState<SourceKey | null>(null);
  const [result, setResult] = useState<{ label: string; data: ApplyResult | DeviceSync } | null>(null);
  const idempotencyKeys = useMemo(() => ({ netbox: `ui-netbox-${crypto.randomUUID()}`, wazuh: `ui-wazuh-${crypto.randomUUID()}` }), []);

  async function preview(source: SourceKey) {
    setBusy(`${source}-preview`); setError(""); setConfirming(null); setResult(null);
    try {
      const data = await requestJson<Preview>(`/integrations/${source}/sync-preview`);
      setPreviews((current) => ({ ...current, [source]: data }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "پیش‌نمایش ناموفق بود."); }
    finally { setBusy(""); }
  }

  async function applyMock(source: SourceKey) {
    setBusy(`${source}-apply`); setError("");
    try {
      const data = await requestJson<ApplyResult>(`/integrations/${source}/sync`, "POST", { idempotencyKey: idempotencyKeys[source] });
      setResult({ label: `ثبت آزمایشی ${sources[source].title}`, data });
      setConfirming(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ثبت آزمایشی ناموفق بود."); }
    finally { setBusy(""); }
  }

  async function syncDevices() {
    setBusy("devices"); setError(""); setResult(null);
    try { setResult({ label: "همگام‌سازی Deviceهای موجود", data: await requestJson<DeviceSync>("/assets/sync/devices", "POST") }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "همگام‌سازی Device ناموفق بود."); }
    finally { setBusy(""); }
  }

  return (
    <section className="page-stack">
      <PageHeader title="همگام‌سازی دارایی" eyebrow="پیش‌نمایش، بررسی و تأیید" description="ابتدا تغییرات را ببینید؛ سپس فقط داده آزمایشی را تأیید و ثبت کنید. هیچ اتصال production در این صفحه فعال نیست." />
      {error && <section className="state-card is-error" role="alert"><ShieldAlert aria-hidden="true" /><strong>همگام‌سازی انجام نشد</strong><p>{error}</p></section>}
      <div className="content-grid">
        {(Object.keys(sources) as SourceKey[]).map((source) => {
          const item = sources[source];
          const current = previews[source];
          return <section className="content-panel" key={source}>
            <h2>{item.title} <span className="status-badge status-badge--warning">داده آزمایشی / Mock</span></h2>
            <p>{item.description}</p>
            <p className="text-sm text-slate-400">اتصال production تنظیم نشده و هیچ درخواست خارجی ارسال نمی‌شود.</p>
            <div className="button-row"><button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void preview(source)}>{busy === `${source}-preview` ? "در حال دریافت…" : `۱. پیش‌نمایش ${item.title}`}</button></div>
            {current && <div className="integration-preview" aria-live="polite">
              <Summary total={current.total} creates={current.creates} updates={current.updates} />
              <ul className="integration-preview__rows">{(current.rows ?? []).slice(0, 8).map((row, index) => <li key={`${source}-${row.identity?.externalId ?? row.identity?.managementIp ?? index}`}><strong>{row.action === "create" ? "ایجاد" : "به‌روزرسانی"}</strong><span>{row.identity?.hostname ?? row.matchName ?? "دارایی بدون نام"}</span><small>{row.identity?.managementIp ?? "IP ثبت نشده"}</small></li>)}</ul>
              {confirming === source ? <div className="integration-confirm" role="alert"><strong>ثبت داده آزمایشی را تأیید می‌کنید؟</strong><p>این عملیات فقط داده Mock نمایش‌داده‌شده را در پایگاه داده آزمایش ثبت می‌کند.</p><div className="button-row"><button className="primary-button" disabled={Boolean(busy)} onClick={() => void applyMock(source)}>تأیید و ثبت آزمایشی</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => setConfirming(null)}>لغو</button></div></div> : <button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => setConfirming(source)}>۲. بررسی و ثبت داده آزمایشی</button>}
            </div>}
          </section>;
        })}
        <section className="content-panel">
          <h2>اتصال Deviceهای موجود <span className="status-badge status-badge--good">واقعی و داخلی</span></h2>
          <p>Deviceهای ثبت‌شده پروژه را بدون ساخت credential جدید به Asset متناظر وصل می‌کند. اجرای تکراری رکورد تکراری نمی‌سازد.</p>
          <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void syncDevices()}>{busy === "devices" ? "در حال همگام‌سازی…" : "همگام‌سازی Deviceهای موجود"}</button>
        </section>
      </div>
      {result && <section className="panel-section integration-result" aria-live="polite"><header><CheckCircle2 aria-hidden="true" /><div><p className="operator-eyebrow">عملیات تکمیل شد</p><h2>{result.label}</h2></div></header><Summary total={(result.data as Preview).total ?? (result.data as DeviceSync).scanned} creates={(result.data as ApplyResult).applied?.created ?? (result.data as DeviceSync).created} updates={(result.data as ApplyResult).applied?.updated ?? (result.data as DeviceSync).updated} />{"idempotentReplay" in result.data && <p>{result.data.idempotentReplay ? "این درخواست قبلاً اعمال شده بود؛ نتیجه قبلی بدون ایجاد رکورد تکراری بازگردانده شد." : "یک اجرای جدید با موفقیت ثبت شد."}</p>}<button className="secondary-button" type="button" onClick={() => setResult(null)}><RefreshCw aria-hidden="true" /> بستن نتیجه</button></section>}
      <section className="content-panel"><Database aria-hidden="true" /><strong>مرز اتصال</strong><p>NetBox و Wazuh فعلاً Mock هستند. برای اتصال production باید endpoint، credential reference و تست سلامت واقعی تنظیم شود؛ تا آن زمان UI آن‌ها را واقعی نمایش نمی‌دهد.</p></section>
    </section>
  );
}
