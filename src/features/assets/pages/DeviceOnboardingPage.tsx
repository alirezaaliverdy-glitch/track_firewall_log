import { useEffect, useRef, useState } from "react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { createCredential, listCredentials, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import {
  answerOnboarding,
  commitOnboarding,
  detectOnboarding,
  discoverOnboarding,
  startOnboarding,
  testOnboarding,
  type OnboardingDraft,
  type OnboardingSession
} from "@/lib/deviceOnboarding";

const platforms: Record<OnboardingDraft["vendor"], Array<{ value: string; label: string }>> = {
  linux: [{ value: "linux", label: "Linux via SSH" }],
  cisco: [{ value: "cisco-ios-xe", label: "Cisco IOS-XE via SSH" }],
  fortigate: [{ value: "fortios", label: "FortiOS" }],
  mikrotik: [{ value: "routeros", label: "RouterOS" }]
};

const emptyCredential: CredentialInput = { name: "", type: "password", username: "", password: "", privateKey: "", passphrase: "", sudo: false };

function initialVendor(params: Record<string, string>) {
  const query = new URLSearchParams(window.location.search).get("vendor");
  const value = (params.vendorKey || query || "linux").toLowerCase();
  return (["linux", "cisco", "fortigate", "mikrotik"].includes(value) ? value : "linux") as OnboardingDraft["vendor"];
}

export default function DeviceOnboardingPage({ params }: RouteComponentProps) {
  const started = useRef(false);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [form, setForm] = useState<OnboardingDraft | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialForm, setCredentialForm] = useState<CredentialInput>(emptyCredential);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const vendor = initialVendor(params);
    Promise.all([
      startOnboarding({ vendor, platform: platforms[vendor][0].value, deviceId: params.deviceId || undefined }),
      listCredentials()
    ]).then(([next, refs]) => {
      setSession(next);
      setForm(next.draft);
      setCredentials(refs);
    }).catch((failure: Error) => setError(failure.message));
  }, [params.deviceId, params.vendorKey]);

  const run = async (label: string, operation: () => Promise<OnboardingSession>) => {
    setBusy(label); setError(""); setMessage("");
    try {
      const next = await operation();
      setSession(next); setForm(next.draft);
      setMessage(label === "test" ? "اتصال امن با Connector واقعی تایید شد." : label === "detect" ? "پلتفرم پشتیبانی‌شده شناسایی شد." : label === "discover" ? "موجودی و قابلیت‌ها به‌صورت خواندنی جمع‌آوری شد." : label === "commit" ? "دستگاه ثبت و سلامت اولیه ذخیره شد." : "اطلاعات ذخیره شد.");
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "عملیات ناموفق بود.");
      return null;
    } finally { setBusy(""); }
  };

  if (!form || !session) return <section className="page-stack"><PageHeader title="ثبت دستگاه" eyebrow="Device onboarding" /><div className="state-card">در حال آماده‌سازی گردش کار امن...</div>{error ? <div className="state-card is-error">{error}</div> : null}</section>;

  const change = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const saveAnswers = () => run("answers", () => answerOnboarding(session.id, form));
  const canDetect = session.status === "tested";
  const canDiscover = session.status === "detected";
  const canCommit = session.status === "preview_ready";

  const saveCredential = async () => {
    setBusy("credential"); setError("");
    try {
      const created = await createCredential(credentialForm);
      setCredentials((current) => [created, ...current]);
      change("credentialId", created.id);
      setCredentialForm(emptyCredential);
      setMessage("Credential به‌صورت رمزگذاری‌شده ذخیره و فقط مرجع آن انتخاب شد.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ذخیره Credential ناموفق بود."); }
    finally { setBusy(""); }
  };

  return (
    <section className="page-stack">
      <PageHeader title={params.deviceId ? "راه‌اندازی دوباره دستگاه" : `ثبت دستگاه ${form.vendor === "cisco" ? "Cisco" : ""}`} eyebrow="Onboarding امن" description="اتصال و کشف فقط با Connector ثبت‌شده و Credential رمزگذاری‌شده انجام می‌شود؛ هیچ secret در Session ذخیره نمی‌شود." actions={<a className="secondary-link" href="/assets/devices">بازگشت به تجهیزات</a>} />

      <ol className="onboarding-steps" aria-label="مراحل ثبت دستگاه">
        {["Vendor", "Platform", "Connection", "Address", "Port", "Credential", "Site", "Test", "Detect", "Discover", "Preview", "Save", "Health", "Result"].map((step, index) => <li key={step} className={index < (["draft", "tested", "detected", "preview_ready", "committed"].indexOf(session.status) + 1) * 3 ? "is-complete" : ""}><span>{index + 1}</span>{step}</li>)}
      </ol>

      <section className="content-panel onboarding-form">
        <h2>مشخصات اتصال</h2>
        <div className="form-grid">
          <label>Vendor<select value={form.vendor} onChange={(event) => { const vendor = event.target.value as OnboardingDraft["vendor"]; setForm({ ...form, vendor, platform: platforms[vendor][0].value, connectionMethod: "ssh", managementPort: 22 }); }}><option value="linux">Linux</option><option value="cisco">Cisco</option><option value="fortigate">FortiGate</option><option value="mikrotik">MikroTik</option></select></label>
          <label>Platform<select value={form.platform} onChange={(event) => change("platform", event.target.value)}>{platforms[form.vendor].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>روش اتصال<select value={form.connectionMethod} onChange={(event) => change("connectionMethod", event.target.value as "ssh" | "api")}><option value="ssh">SSH</option>{form.vendor !== "cisco" && form.vendor !== "linux" ? <option value="api">API</option> : null}</select></label>
          <label>نام دستگاه<input value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="edge-switch-01" /></label>
          <label>آدرس مدیریتی<input value={form.host} onChange={(event) => change("host", event.target.value)} inputMode="url" placeholder="IP یا hostname" /></label>
          <label>پورت<input type="number" min="1" max="65535" value={form.managementPort} onChange={(event) => change("managementPort", Number(event.target.value))} /></label>
          <label>Credential reference<select value={form.credentialId} onChange={(event) => change("credentialId", event.target.value)}><option value="">انتخاب Credential ذخیره‌شده</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.username}</option>)}</select></label>
          <label>سایت<input value={form.site} onChange={(event) => change("site", event.target.value)} placeholder="مثال: Tehran DC" /></label>
          <label>موقعیت<input value={form.location} onChange={(event) => change("location", event.target.value)} placeholder="Rack / Room" /></label>
          <label>محیط<select value={form.environment} onChange={(event) => change("environment", event.target.value as OnboardingDraft["environment"])}><option value="lab">Lab</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
        </div>
        <button type="button" onClick={() => void saveAnswers()} disabled={Boolean(busy)}>ذخیره پاسخ‌ها و ساخت Preview</button>
      </section>

      <details className="content-panel">
        <summary>ساخت Credential رمزگذاری‌شده</summary>
        <p>مقدار secret فقط یک‌بار به API امن Credential ارسال می‌شود و در Session ثبت دستگاه یا خروجی مرورگر نمایش داده نمی‌شود.</p>
        <div className="form-grid">
          <label>نام مرجع<input value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} /></label>
          <label>نوع<select value={credentialForm.type} onChange={(event) => setCredentialForm({ ...credentialForm, type: event.target.value as CredentialInput["type"] })}><option value="password">Password</option><option value="private_key">Private key</option></select></label>
          <label>نام کاربری<input autoComplete="username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label>
          {credentialForm.type === "password" ? <label>رمز عبور<input type="password" autoComplete="new-password" value={credentialForm.password ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label> : <label>کلید خصوصی<textarea value={credentialForm.privateKey ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, privateKey: event.target.value })} /></label>}
          <label><input type="checkbox" checked={credentialForm.sudo} onChange={(event) => setCredentialForm({ ...credentialForm, sudo: event.target.checked })} /> دسترسی sudo ثبت شده است</label>
        </div>
        <button type="button" onClick={() => void saveCredential()} disabled={busy === "credential"}>ذخیره امن Credential</button>
      </details>

      <section className="content-panel">
        <h2>اعتبارسنجی کنترل‌شده</h2>
        <div className="button-row">
          <button type="button" onClick={() => void run("test", () => testOnboarding(session.id))} disabled={Boolean(busy) || session.status !== "draft"}>تست امن اتصال</button>
          <button type="button" onClick={() => void run("detect", () => detectOnboarding(session.id))} disabled={Boolean(busy) || !canDetect}>تشخیص پلتفرم</button>
          <button type="button" onClick={() => void run("discover", () => discoverOnboarding(session.id))} disabled={Boolean(busy) || !canDiscover}>کشف خواندنی موجودی و قابلیت‌ها</button>
          <button type="button" onClick={() => void run("commit", () => commitOnboarding(session.id)).then((next) => { if (next?.result?.connectorInvoked === true && next.result.route) window.location.assign(next.result.route); })} disabled={Boolean(busy) || !canCommit}>تأیید Preview و ثبت دستگاه</button>
        </div>
        <dl className="detail-list"><dt>وضعیت Session</dt><dd>{session.status}</dd><dt>Connector invoked</dt><dd>{String(session.test?.connectorInvoked === true)}</dd><dt>پلتفرم</dt><dd>{String(session.detection?.platform ?? "تشخیص داده نشده")}</dd><dt>کشف قابلیت</dt><dd>{session.discovery?.connectorInvoked === true ? "تاییدشده" : "انجام نشده"}</dd></dl>
        {session.preview ? <div className="state-card"><strong>Preview آماده است</strong><p>عملیات: {String(session.preview.operation)} — آدرس: {form.host}:{form.managementPort} — Credential: فقط مرجع ذخیره‌شده — سلامت اولیه: فعال</p></div> : null}
      </section>
      {message ? <div role="status" className="state-card">{message}</div> : null}
      {error ? <div role="alert" className="state-card is-error">{error}</div> : null}
    </section>
  );
}
