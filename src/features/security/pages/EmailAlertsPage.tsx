import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, Clock3, ExternalLink, Eye, EyeOff, Inbox, KeyRound, Mail, Plus, RefreshCw, Send, ShieldCheck, Unplug, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { connectGmailSecuritySender, disconnectGmailSecuritySender, getSecurityEmailAlertSettings, testSecurityEmailAlert, testSecurityVendorEmails, updateSecurityEmailAlertSettings, type SecurityEmailAlertSettings } from "@/lib/platform";
import "./DetectionRulesPage.css";
import "./EmailAlertsPage.css";

function deliveryVendor(metadata: unknown) {
  return metadata && typeof metadata === "object" ? String((metadata as Record<string, unknown>).vendor ?? "") : "";
}

function deliveryEventCount(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return 0;
  const value = Number((metadata as Record<string, unknown>).eventCount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function emailFailure(reason: unknown, isFa: boolean) {
  const code = reason instanceof Error ? reason.message : String(reason);
  const messages: Record<string, [string, string]> = {
    INVALID_GMAIL_APP_PASSWORD: ["App Password باید همان کد ۱۶ کاراکتری گوگل باشد؛ فاصله‌ها اهمیتی ندارند.", "Use Google's 16-character App Password; spaces are accepted."],
    INVALID_SENDER_EMAIL: ["ایمیل فرستنده معتبر نیست.", "The sender email is invalid."],
    SMTP_AUTH_FAILED: ["جیمیل ورود را رد کرد؛ App Password، تأیید دومرحله‌ای و آدرس ایمیل را بررسی کنید.", "Gmail rejected authentication; check the App Password, 2-Step Verification, and email address."],
    SMTP_TIMEOUT: ["ارتباط با Gmail زمان‌بر شد؛ اینترنت یا دسترسی SMTP سرور را بررسی کنید.", "The Gmail connection timed out; check server internet and SMTP access."],
    SMTP_HOST_UNREACHABLE: ["سرور به smtp.gmail.com دسترسی ندارد.", "The server cannot reach smtp.gmail.com."],
    SMTP_CONNECTION_FAILED: ["اتصال SMTP برقرار نشد؛ دسترسی خروجی پورت ۵۸۷ را بررسی کنید.", "SMTP connection failed; check outbound access to port 587."],
    SECRET_ENCRYPTION_NOT_CONFIGURED: ["کلید رمزنگاری امن سرور تنظیم نشده است؛ اتصال ذخیره نشد.", "The server encryption key is not configured; the connection was not saved."],
    EMAIL_SENDER_NOT_CONNECTED: ["ابتدا حساب Gmail را متصل و تأیید کنید.", "Connect and verify Gmail first."],
    RECIPIENT_EMAIL_REQUIRED: ["ایمیل گیرنده را وارد کنید.", "Enter a recipient email."],
    INVALID_RECIPIENT_EMAIL: ["ایمیل گیرنده معتبر نیست.", "The recipient email is invalid."],
    CSRF_VALIDATION_FAILED: ["نشست امنیتی منقضی شده است؛ صفحه را تازه‌سازی کنید.", "The security session expired; refresh the page."]
  };
  return messages[code]?.[isFa ? 0 : 1] ?? code;
}

export default function EmailAlertsPage() {
  const { i18n } = useTranslation();
  const isFa = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa");
  const [email, setEmail] = useState<SecurityEmailAlertSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [minimumSeverity, setMinimumSeverity] = useState("high");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "save" | "test" | "vendors" | "">("");
  const [message, setMessage] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "sent" | "queued" | "blocked">("all");

  const pendingDeliveries = useMemo(() => email?.deliveries.filter((item) => item.status === "pending" || item.status === "failed").length ?? 0, [email]);

  async function loadSettings(syncForm = false) {
    const value = await getSecurityEmailAlertSettings();
    setEmail(value);
    if (syncForm) {
      setRecipients(value.recipientEmails?.length ? value.recipientEmails : value.recipientEmail ? [value.recipientEmail] : []);
      setSenderEmail(value.sender.email ?? "");
      setMinimumSeverity(value.minimumSeverity);
      setEmailEnabled(value.enabled);
    }
    return value;
  }

  useEffect(() => {
    let mounted = true;
    void getSecurityEmailAlertSettings()
      .then((value) => {
        if (!mounted) return;
        setEmail(value);
        setRecipients(value.recipientEmails?.length ? value.recipientEmails : value.recipientEmail ? [value.recipientEmail] : []);
        setSenderEmail(value.sender.email ?? "");
        setMinimumSeverity(value.minimumSeverity);
        setEmailEnabled(value.enabled);
      })
      .catch((reason) => { if (mounted) setMessage(emailFailure(reason, isFa)); })
      .finally(() => { if (mounted) setLoading(false); });
    const timer = window.setInterval(() => { void getSecurityEmailAlertSettings().then((value) => { if (mounted) setEmail(value); }).catch(() => undefined); }, 15_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [isFa]);

  async function saveEmail() {
    setBusy("save"); setMessage("");
    try {
      const value = await updateSecurityEmailAlertSettings({ recipientEmails: recipients, enabled: emailEnabled, minimumSeverity });
      setEmail(value);
      setRecipients(value.recipientEmails);
      setMessage(isFa ? "تنظیمات اعلان ذخیره شد." : "Alert settings saved.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  function addRecipient() {
    const value = recipientDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setMessage(isFa ? "یک آدرس ایمیل معتبر وارد کنید." : "Enter a valid email address.");
      return;
    }
    if (recipients.includes(value)) {
      setMessage(isFa ? "این ایمیل قبلاً در فهرست گیرنده‌ها ثبت شده است." : "This recipient is already in the list.");
      return;
    }
    if (recipients.length >= 10) {
      setMessage(isFa ? "حداکثر ۱۰ گیرنده قابل ثبت است." : "You can register up to 10 recipients.");
      return;
    }
    setRecipients((current) => [...current, value]);
    setRecipientDraft("");
    setMessage(isFa ? "گیرنده اضافه شد؛ برای اعمال تغییر، تنظیمات را ذخیره کنید." : "Recipient added; save settings to apply the change.");
  }

  async function testEmail() {
    setBusy("test"); setMessage("");
    try {
      await testSecurityEmailAlert(); await loadSettings();
      setMessage(isFa ? "ایمیل آزمایشی ارسال شد؛ Inbox و Spam را بررسی کنید." : "Test email sent; check the inbox and spam folder.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  async function testVendors() {
    setBusy("vendors"); setMessage("");
    try {
      const result = await testSecurityVendorEmails(); await loadSettings();
      setMessage(isFa ? `${result.sent} ایمیل وندور ارسال شد${result.failed ? `؛ ${result.failed} مورد ناموفق بود.` : "."}` : `${result.sent} vendor emails sent${result.failed ? `; ${result.failed} failed.` : "."}`);
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  async function connectGmail() {
    setBusy("connect"); setMessage("");
    try {
      const value = await connectGmailSecuritySender({ senderEmail, appPassword });
      setEmail(value); setSenderEmail(value.sender.email ?? senderEmail); setRecipients(value.recipientEmails); setAppPassword("");
      setMessage(isFa ? "اتصال Gmail تأیید و ذخیره شد." : "Gmail connection verified and saved.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  async function disconnectGmail() {
    setBusy("disconnect"); setMessage("");
    try {
      const value = await disconnectGmailSecuritySender();
      setEmail(value); setSenderEmail(""); setAppPassword(""); setEmailEnabled(false);
      setMessage(isFa ? "اتصال Gmail حذف و ارسال خودکار غیرفعال شد." : "Gmail disconnected and automatic delivery disabled.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  if (loading) return <LoadingState />;

  const filteredDeliveries = (email?.deliveries ?? []).filter((delivery) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "queued") return delivery.status === "pending" || delivery.status === "failed" || delivery.status === "sending";
    return delivery.status === historyFilter;
  });

  return <section className="page-stack email-alerts-page">
    <PageHeader
      eyebrow={isFa ? "تنظیمات اعلان" : "Alert settings"}
      title={isFa ? "اعلان‌های ایمیلی" : "Email alerts"}
      description={isFa ? "اتصال Gmail، گیرنده هشدار و وضعیت ارسال‌ها را از یک صفحه ساده مدیریت کنید." : "Manage Gmail, alert recipients, and delivery status from one focused page."}
      actions={<Link className="secondary-link" to="/security/rules"><ArrowLeft size={16} />{isFa ? "قوانین تشخیص" : "Detection rules"}</Link>}
    />

    <section className="email-alerts-summary" aria-label={isFa ? "خلاصه وضعیت ایمیل" : "Email status summary"}>
      <article className={email?.sender.connected ? "is-ready" : "is-warning"}><KeyRound size={20} /><span><small>{isFa ? "اتصال Gmail" : "Gmail"}</small><strong>{email?.sender.connected ? (isFa ? "متصل" : "Connected") : (isFa ? "نیازمند اتصال" : "Not connected")}</strong></span></article>
      <article className={email?.enabled ? "is-ready" : "is-muted"}><ShieldCheck size={20} /><span><small>{isFa ? "ارسال خودکار" : "Automatic alerts"}</small><strong>{email?.enabled ? (isFa ? `فعال برای ${recipients.length.toLocaleString("fa-IR")} گیرنده` : `Enabled for ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`) : (isFa ? "غیرفعال" : "Disabled")}</strong></span></article>
      <article className={pendingDeliveries ? "is-warning" : "is-ready"}><BellRing size={20} /><span><small>{isFa ? "در صف ارسال" : "Queued"}</small><strong>{pendingDeliveries.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong></span></article>
    </section>

    <section className={`gmail-connection ${email?.sender.connected ? "is-connected" : ""}`}>
      <header><span><KeyRound size={22} /></span><div><h2>{isFa ? "حساب فرستنده" : "Sender account"}</h2><p>{email?.sender.connected ? (isFa ? "حساب Gmail تأیید شده و App Password به‌صورت رمزنگاری‌شده نگهداری می‌شود." : "Gmail is verified and the App Password is stored encrypted.") : (isFa ? "یک App Password شانزده‌کاراکتری از Google بسازید و اتصال را یک‌بار تأیید کنید." : "Create a 16-character Google App Password and verify the connection once.")}</p></div><strong>{email?.sender.connected ? (isFa ? "متصل" : "Connected") : (isFa ? "متصل نیست" : "Not connected")}</strong></header>
      {email?.sender.connected ? <div className="gmail-connection__connected"><div><CheckCircle2 size={19} /><span><small>{isFa ? "فرستنده فعال" : "Active sender"}</small><strong dir="ltr">{email.sender.email}</strong></span></div><button type="button" className="is-danger" onClick={() => void disconnectGmail()} disabled={Boolean(busy)}><Unplug size={16} />{busy === "disconnect" ? (isFa ? "در حال حذف…" : "Disconnecting…") : (isFa ? "حذف اتصال" : "Disconnect")}</button></div> : <>
        <ol className="gmail-connection__steps"><li>{isFa ? "تأیید دومرحله‌ای Google را فعال کنید." : "Enable Google 2-Step Verification."}</li><li>{isFa ? "برای Mini-SOAR یک App Password بسازید." : "Create an App Password for Mini-SOAR."}</li><li>{isFa ? "کد را وارد کنید و اتصال را بررسی کنید." : "Enter the code and verify the connection."}</li></ol>
        <a className="gmail-connection__google-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"><ExternalLink size={15} />{isFa ? "بازکردن App passwords گوگل" : "Open Google App Passwords"}</a>
        <div className="gmail-connection__form"><label><span>{isFa ? "ایمیل فرستنده" : "Sender email"}</span><input type="email" dir="ltr" autoComplete="username" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="name@gmail.com" disabled={Boolean(busy)} /></label><label><span>{isFa ? "App Password گوگل" : "Google App Password"}</span><div className="gmail-connection__secret"><input type={showAppPassword ? "text" : "password"} dir="ltr" autoComplete="new-password" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} placeholder="xxxx xxxx xxxx xxxx" disabled={Boolean(busy)} /><button type="button" aria-label={showAppPassword ? (isFa ? "مخفی‌کردن رمز" : "Hide password") : (isFa ? "نمایش رمز" : "Show password")} onClick={() => setShowAppPassword((value) => !value)}>{showAppPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><button type="button" onClick={() => void connectGmail()} disabled={Boolean(busy) || !senderEmail.trim() || appPassword.replace(/\s+/g, "").length !== 16}><CheckCircle2 size={16} />{busy === "connect" ? (isFa ? "در حال بررسی…" : "Verifying…") : (isFa ? "اتصال و بررسی" : "Connect and verify")}</button></div>
      </>}
    </section>

    <section className="security-alert-email email-alerts-settings">
      <div className="security-alert-email__intro"><span><Mail size={22} /></span><div><h2>{isFa ? "گیرنده‌های هشدار" : "Alert recipients"}</h2><p>{isFa ? "یک یا چند ایمیل اضافه کنید. هر هشدار برای تمام گیرنده‌های ثبت‌شده ارسال و جداگانه پیگیری می‌شود." : "Add one or more addresses. Every alert is sent and tracked separately for each registered recipient."}</p></div></div>
      <div className="email-recipient-manager">
        <label><span>{isFa ? "افزودن ایمیل جدید" : "Add another email"}</span><div><input type="email" dir="ltr" value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRecipient(); } }} placeholder={senderEmail || "security@example.com"} /><button type="button" onClick={addRecipient} disabled={!recipientDraft.trim() || recipients.length >= 10}><Plus size={17} />{isFa ? "افزودن" : "Add"}</button></div></label>
        <div className="email-recipient-list" aria-label={isFa ? "گیرنده‌های ثبت‌شده" : "Registered recipients"}>{recipients.length ? recipients.map((address, index) => <article key={address}><span><Mail size={16} /><span><small>{isFa ? `گیرنده ${index + 1}` : `Recipient ${index + 1}`}</small><strong dir="ltr">{address}</strong></span></span><button type="button" onClick={() => setRecipients((current) => current.filter((item) => item !== address))} aria-label={isFa ? `حذف ${address}` : `Remove ${address}`}><X size={16} /></button></article>) : <div className="email-recipient-list__empty"><Inbox size={20} /><span>{isFa ? "هنوز گیرنده‌ای اضافه نشده است." : "No recipient has been added yet."}</span></div>}</div>
      </div>
      <div className="security-alert-email__form email-alerts-options"><label><span>{isFa ? "سطح هشدار" : "Alert level"}</span><select value={minimumSeverity} onChange={(event) => setMinimumSeverity(event.target.value)}><option value="high">{isFa ? "مهم و بحرانی" : "High and critical"}</option><option value="critical">{isFa ? "فقط بحرانی" : "Critical only"}</option></select></label><label className="security-alert-email__toggle"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} disabled={!email?.smtpConfigured} /><span>{isFa ? "ارسال خودکار فعال باشد" : "Enable automatic alerts"}</span></label></div>
      <div className="email-alerts-actions"><button type="button" onClick={() => void saveEmail()} disabled={Boolean(busy) || (emailEnabled && (!email?.smtpConfigured || !recipients.length))}><CheckCircle2 size={16} />{busy === "save" ? (isFa ? "در حال ذخیره…" : "Saving…") : (isFa ? "ذخیره تنظیمات" : "Save settings")}</button><button type="button" className="is-secondary" onClick={() => void testEmail()} disabled={Boolean(busy) || !email?.smtpConfigured || !recipients.length}><Send size={16} />{busy === "test" ? (isFa ? "در حال ارسال…" : "Sending…") : (isFa ? "ارسال تست به همه" : "Test all recipients")}</button><button type="button" className="is-secondary" onClick={() => void testVendors()} disabled={Boolean(busy) || !email?.smtpConfigured || !recipients.length}><Send size={16} />{busy === "vendors" ? (isFa ? "در حال ارسال ۵ تست…" : "Sending 5 tests…") : (isFa ? "تست هر ۵ وندور" : "Test all 5 vendors")}</button></div>
      <div className={`security-alert-email__health ${email?.smtpConfigured ? "is-ready" : "is-warning"}`}><BellRing size={17} /><span>{email?.smtpConfigured ? (isFa ? "فرستنده آماده است. وضعیت ارسال‌های واقعی پایین صفحه نمایش داده می‌شود." : "The sender is ready. Real delivery status appears below.") : (isFa ? "ابتدا حساب Gmail را متصل کنید." : "Connect Gmail first.")}</span></div>
      {message ? <p className="security-rules-inline-status" role="status">{message}</p> : null}
    </section>

    <section className="email-delivery-history">
      <header><div><BellRing size={20} /><span><h2>{isFa ? "تاریخچه ارسال ایمیل" : "Email delivery history"}</h2><p>{isFa ? "علت هشدار، گیرنده و نتیجه هر تلاش را شفاف ببینید." : "See the alert reason, recipient, and result of every attempt."}</p></span></div><button type="button" onClick={() => void loadSettings()} disabled={Boolean(busy)}><RefreshCw size={16} />{isFa ? "به‌روزرسانی" : "Refresh"}</button></header>
      {email?.deliveries.length ? <><nav className="email-history-filters" aria-label={isFa ? "فیلتر تاریخچه" : "History filters"}>{(["all", "sent", "queued", "blocked"] as const).map((filter) => <button key={filter} type="button" className={historyFilter === filter ? "is-active" : ""} onClick={() => setHistoryFilter(filter)}>{filter === "all" ? (isFa ? "همه" : "All") : filter === "sent" ? (isFa ? "ارسال‌شده" : "Sent") : filter === "queued" ? (isFa ? "در صف" : "Queued") : (isFa ? "نیازمند بررسی" : "Needs attention")}</button>)}</nav>
      {filteredDeliveries.length ? <div className="email-history-list">{filteredDeliveries.map((delivery) => {
        const queued = delivery.status === "pending" || delivery.status === "failed" || delivery.status === "sending";
        const statusLabel = delivery.status === "sent" ? (isFa ? "ارسال موفق" : "Sent") : queued ? (isFa ? "در صف ارسال" : "Queued") : delivery.status === "blocked" ? (isFa ? "نیازمند اصلاح اتصال" : "Connection needs attention") : delivery.status;
        const occurredAt = delivery.sentAt ?? delivery.attemptedAt;
        return <article key={delivery.id} className={`email-history-item is-${delivery.status}`}><span className="email-history-item__status">{delivery.status === "sent" ? <CheckCircle2 size={20} /> : queued ? <Clock3 size={20} /> : <AlertTriangle size={20} />}</span><div className="email-history-item__body"><header><div><small>{isFa ? "دلیل ارسال" : "Reason"}</small><h3>{isFa ? delivery.reason.titleFa : delivery.reason.titleEn}</h3></div><strong>{statusLabel}</strong></header><dl><div><dt><Mail size={14} />{isFa ? "ارسال به" : "Recipient"}</dt><dd dir="ltr">{delivery.recipientEmail}</dd></div><div><dt>{isFa ? "وندور" : "Vendor"}</dt><dd>{delivery.reason.vendor || deliveryVendor(delivery.metadataJson) || (isFa ? "عمومی" : "General")}</dd></div>{delivery.reason.deviceName ? <div><dt>{isFa ? "دستگاه" : "Device"}</dt><dd>{delivery.reason.deviceName}</dd></div> : null}<div><dt><Clock3 size={14} />{isFa ? "زمان" : "Time"}</dt><dd>{new Date(occurredAt).toLocaleString(isFa ? "fa-IR" : "en-US")}</dd></div></dl><footer><span>{isFa ? `تعداد رخداد: ${deliveryEventCount(delivery.metadataJson).toLocaleString("fa-IR")}` : `Events: ${deliveryEventCount(delivery.metadataJson)}`}</span><span>{isFa ? `تلاش ارسال: ${delivery.attemptCount.toLocaleString("fa-IR")}` : `Attempts: ${delivery.attemptCount}`}</span>{delivery.nextAttemptAt ? <span>{isFa ? "تلاش بعدی: " : "Next attempt: "}{new Date(delivery.nextAttemptAt).toLocaleString(isFa ? "fa-IR" : "en-US")}</span> : null}{delivery.errorCode ? <span className="is-error">{emailFailure(new Error(delivery.errorCode), isFa)}</span> : null}</footer></div></article>;
      })}</div> : <div className="email-delivery-history__empty"><Inbox size={24} /><p>{isFa ? "موردی با این وضعیت وجود ندارد." : "No delivery matches this filter."}</p></div>}</> : <div className="email-delivery-history__empty"><Mail size={24} /><p>{isFa ? "هنوز هشدار واقعی ثبت نشده است." : "No real alert delivery has been recorded yet."}</p></div>}
    </section>
  </section>;
}
