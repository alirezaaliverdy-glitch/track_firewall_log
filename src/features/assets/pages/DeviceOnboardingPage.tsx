import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { PageHeader } from "@/components/ui/PageHeader";
import { createCredential, listCredentials, type CredentialInput, type DeviceCredential } from "@/lib/credentials";
import {
  answerOnboarding,
  commitOnboarding,
  detectOnboarding,
  discoverOnboarding,
  getOnboarding,
  previewOnboarding,
  registerUnverifiedOnboarding,
  retryOnboarding,
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
  const navigate = useNavigate();
  const started = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const hostInput = useRef<HTMLInputElement>(null);
  const portInput = useRef<HTMLInputElement>(null);
  const credentialInput = useRef<HTMLSelectElement>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [form, setForm] = useState<OnboardingDraft | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredential[]>([]);
  const [credentialForm, setCredentialForm] = useState<CredentialInput>(emptyCredential);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"name" | "host" | "managementPort" | "credentialId" | "">("");

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
      setMessage(label === "test" ? "اتصال امن با Connector واقعی تایید شد." : label === "detect" ? "پلتفرم پشتیبانی‌شده شناسایی شد." : label === "discover" ? "موجودی و قابلیت‌ها به‌صورت خواندنی جمع‌آوری شد." : label === "preview" ? "پیش‌نمایش بر اساس کشف واقعی آماده شد." : label === "commit" ? "دستگاه ثبت و سلامت اولیه ذخیره شد." : "اطلاعات ذخیره شد.");
      return next;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "عملیات ناموفق بود.");
      if (session) await getOnboarding(session.id).then((current) => { setSession(current); setForm(current.draft); }).catch(() => undefined);
      return null;
    } finally { setBusy(""); }
  };

  if (!form || !session) return <section className="page-stack"><PageHeader title="ثبت دستگاه" eyebrow="Device onboarding" /><div className="state-card">در حال آماده‌سازی گردش کار امن...</div>{error ? <div className="state-card is-error">{error}</div> : null}</section>;

  const change = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    if (invalidField === key) { setInvalidField(""); setError(""); }
  };
  const validateRegistration = (requiresCredential: boolean) => {
    const invalid = !form.name.trim() ? { field: "name" as const, message: "نام دستگاه الزامی است؛ متن کم‌رنگ داخل کادر فقط نمونه است." }
      : !form.host.trim() ? { field: "host" as const, message: "آدرس مدیریتی دستگاه الزامی است." }
        : !Number.isInteger(form.managementPort) || form.managementPort < 1 || form.managementPort > 65535 ? { field: "managementPort" as const, message: "پورت مدیریتی باید عددی بین ۱ تا ۶۵۵۳۵ باشد." }
          : requiresCredential && !form.credentialId ? { field: "credentialId" as const, message: "برای تست اتصال، یک Credential ذخیره‌شده انتخاب کنید." }
            : null;
    if (!invalid) { setInvalidField(""); return true; }
    setInvalidField(invalid.field); setError(invalid.message); setMessage("");
    const target = invalid.field === "name" ? nameInput.current : invalid.field === "host" ? hostInput.current : invalid.field === "managementPort" ? portInput.current : credentialInput.current;
    requestAnimationFrame(() => { target?.focus(); target?.scrollIntoView({ behavior: "smooth", block: "center" }); });
    return false;
  };
  const saveAnswers = () => validateRegistration(true) ? run("answers", () => answerOnboarding(session.id, form)) : Promise.resolve(null);
  const registerUnverified = () => (validateRegistration(false) ? run("unverified", () => registerUnverifiedOnboarding(session.id, form)) : Promise.resolve(null)).then((next) => {
    if (next?.result?.verificationStatus === "unverified" && next.result.connectorInvoked === false && next.result.route) navigate(next.result.route);
  });
  const startNewSession = async () => {
    setBusy("new"); setError(""); setMessage("");
    try {
      const next = await startOnboarding({ vendor: form.vendor, platform: platforms[form.vendor][0].value });
      setSession(next); setForm(next.draft);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "شروع نشست جدید ناموفق بود."); }
    finally { setBusy(""); }
  };
  const retrySession = () => run("retry", () => retryOnboarding(session.id));
  const canTest = ["answers_saved", "connection_failed"].includes(session.status);
  const canDetect = session.status === "connection_verified";
  const canDiscover = session.status === "platform_detected";
  const canPreview = session.status === "discovery_completed";
  const canCommit = session.status === "preview_ready";
  const stepIndex: Record<OnboardingSession["status"], number> = {
    draft: 0,
    validation_failed: 0,
    answers_saved: 7,
    connection_testing: 7,
    connection_failed: 7,
    credential_missing: 5,
    credential_invalid: 5,
    connection_verified: 8,
    platform_detecting: 8,
    platform_unsupported: 8,
    platform_detected: 9,
    discovery_running: 9,
    discovery_failed: 9,
    discovery_completed: 10,
    preview_ready: 11,
    preview_failed: 10,
    saving: 12,
    completed: 14,
    save_failed: 12,
    cancelled: 0
  };

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
      <PageHeader title={params.deviceId ? "راه‌اندازی دوباره دستگاه" : `ثبت دستگاه ${form.vendor === "cisco" ? "Cisco" : ""}`} eyebrow="Onboarding امن" description="اتصال و کشف فقط با Connector ثبت‌شده و Credential رمزگذاری‌شده انجام می‌شود؛ هیچ secret در Session ذخیره نمی‌شود." actions={<Link className="secondary-link" to="/assets/devices">بازگشت به تجهیزات</Link>} />

      <ol className="onboarding-steps" aria-label="مراحل ثبت دستگاه">
        {["Vendor", "Platform", "Connection", "Address", "Port", "Credential", "Site", "Test", "Detect", "Discover", "Preview", "Save", "Health", "Result"].map((step, index) => <li key={step} className={index <= stepIndex[session.status] ? "is-complete" : ""}><span>{index + 1}</span>{step}</li>)}
      </ol>

      <section className="content-panel onboarding-form">
        <h2>مشخصات اتصال</h2>
        <p>فیلدهای دارای علامت <span aria-hidden="true">*</span> الزامی هستند.</p>
        {error ? <div role="alert" className="state-card is-error">{error}</div> : null}
        <div className="form-grid">
          <label>Vendor<select value={form.vendor} onChange={(event) => { const vendor = event.target.value as OnboardingDraft["vendor"]; setForm({ ...form, vendor, platform: platforms[vendor][0].value, connectionMethod: "ssh", managementPort: 22 }); }}><option value="linux">Linux</option><option value="cisco">Cisco</option><option value="fortigate">FortiGate</option><option value="mikrotik">MikroTik</option></select></label>
          <label>Platform<select value={form.platform} onChange={(event) => change("platform", event.target.value)}>{platforms[form.vendor].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>روش اتصال<select value={form.connectionMethod} onChange={(event) => setForm({ ...form, connectionMethod: event.target.value as "ssh", managementPort: 22 })}><option value="ssh">SSH</option></select></label>
          <label>نام دستگاه *<input ref={nameInput} required aria-invalid={invalidField === "name"} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="مثال: edge-switch-01" /></label>
          <label>آدرس مدیریتی *<input ref={hostInput} required aria-invalid={invalidField === "host"} value={form.host} onChange={(event) => change("host", event.target.value)} inputMode="url" placeholder="IP یا hostname" /></label>
          <label>پورت *<input ref={portInput} required aria-invalid={invalidField === "managementPort"} type="number" min="1" max="65535" value={form.managementPort} onChange={(event) => change("managementPort", Number(event.target.value))} /></label>
          <label>Credential reference (برای تست اتصال الزامی)<select ref={credentialInput} aria-invalid={invalidField === "credentialId"} value={form.credentialId} onChange={(event) => change("credentialId", event.target.value)}><option value="">انتخاب Credential ذخیره‌شده</option>{credentials.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.username}</option>)}</select></label>
          <label>سایت<input value={form.site} onChange={(event) => change("site", event.target.value)} placeholder="مثال: Tehran DC" /></label>
          <label>موقعیت<input value={form.location} onChange={(event) => change("location", event.target.value)} placeholder="Rack / Room" /></label>
          <label>محیط<select value={form.environment} onChange={(event) => change("environment", event.target.value as OnboardingDraft["environment"])}><option value="lab">Lab</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
        </div>
        <button type="button" onClick={() => void saveAnswers()} disabled={Boolean(busy)}>ثبت اطلاعات و ادامه تست</button>
        <div className="state-card">
          <strong>ثبت بدون تأیید اتصال</strong>
          <p>دستگاه با وضعیت تأییدنشده و سلامت نامشخص ذخیره می‌شود و بعداً می‌توانید اتصال آن را آزمایش کنید.</p>
          <button type="button" onClick={() => void registerUnverified()} disabled={Boolean(busy)}>ثبت اولیه بدون تست اتصال</button>
        </div>
      </section>

      <details className="content-panel">
        <summary>ساخت Credential رمزگذاری‌شده</summary>
        <p>مقدار secret فقط یک‌بار به API امن Credential ارسال می‌شود و در Session ثبت دستگاه یا خروجی مرورگر نمایش داده نمی‌شود.</p>
        <div className="form-grid">
          <label>نام مرجع<input value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} /></label>
          <label>نوع<select value={credentialForm.type} onChange={(event) => setCredentialForm({ ...credentialForm, type: event.target.value as CredentialInput["type"] })}><option value="password">Password</option><option value="private_key">Private key</option></select></label>
          <label>نام کاربری<input autoComplete="username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label>
          {credentialForm.type === "password" ? <label>رمز عبور<input type="password" autoComplete="new-password" value={credentialForm.password ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label> : <><label>کلید خصوصی<textarea value={credentialForm.privateKey ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, privateKey: event.target.value })} /></label><label>عبارت عبور کلید خصوصی<input type="password" autoComplete="new-password" value={credentialForm.passphrase ?? ""} onChange={(event) => setCredentialForm({ ...credentialForm, passphrase: event.target.value })} /></label></>}
          <label><input type="checkbox" checked={credentialForm.sudo} onChange={(event) => setCredentialForm({ ...credentialForm, sudo: event.target.checked })} /> دسترسی sudo ثبت شده است</label>
        </div>
        <button type="button" onClick={() => void saveCredential()} disabled={busy === "credential"}>ذخیره امن Credential</button>
      </details>

      <section className="content-panel">
        <h2>اعتبارسنجی کنترل‌شده</h2>
        <div className="button-row">
          <button type="button" onClick={() => void run("test", () => testOnboarding(session.id))} disabled={Boolean(busy) || !canTest}>تست امن اتصال</button>
          <button type="button" onClick={() => void run("detect", () => detectOnboarding(session.id))} disabled={Boolean(busy) || !canDetect}>تشخیص پلتفرم</button>
          <button type="button" onClick={() => void run("discover", () => discoverOnboarding(session.id))} disabled={Boolean(busy) || !canDiscover}>کشف خواندنی موجودی و قابلیت‌ها</button>
          <button type="button" onClick={() => void run("preview", () => previewOnboarding(session.id))} disabled={Boolean(busy) || !canPreview}>ساخت پیش‌نمایش</button>
          <button type="button" onClick={() => void run("commit", () => commitOnboarding(session.id)).then((next) => { if (next?.result?.connectorInvoked === true && next.result.connectionVerified === true && next.result.route) navigate(next.result.route); })} disabled={Boolean(busy) || !canCommit}>تأیید Preview و ثبت دستگاه</button>
          <button type="button" onClick={() => void retrySession()} disabled={Boolean(busy) || !["validation_failed", "credential_missing", "credential_invalid", "connection_failed", "platform_unsupported", "discovery_failed", "preview_failed", "save_failed"].includes(session.status)}>تلاش دوباره</button>
          <button type="button" onClick={() => void startNewSession()} disabled={Boolean(busy)}>شروع نشست جدید</button>
        </div>
        <dl className="detail-list"><dt>وضعیت Session</dt><dd>{session.status}</dd><dt>Connector invoked</dt><dd>{String(session.test?.connectorInvoked === true)}</dd><dt>پلتفرم</dt><dd>{String(session.detection?.platform ?? "تشخیص داده نشده")}</dd><dt>کشف قابلیت</dt><dd>{session.discovery?.connectorInvoked === true ? "تاییدشده" : "انجام نشده"}</dd></dl>
        {session.preview ? <div className="state-card"><strong>Preview آماده است</strong><p>عملیات: {String(session.preview.operation)} — آدرس: {form.host}:{form.managementPort} — Credential: فقط مرجع ذخیره‌شده — سلامت اولیه: فعال</p></div> : null}
      </section>
      {message ? <div role="status" className="state-card">{message}</div> : null}
    </section>
  );
}
