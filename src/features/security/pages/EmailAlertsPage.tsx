import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, Clock3, ExternalLink, Eye, EyeOff, Inbox, KeyRound, Mail, Pencil, Plus, Send, ShieldCheck, Unplug, X } from "lucide-react";
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

type RecipientPreference = { email: string; enabled: boolean };

function settingsRecipients(value: SecurityEmailAlertSettings): RecipientPreference[] {
  return value.recipients?.length
    ? value.recipients
    : value.recipientEmails.map((email) => ({ email, enabled: true }));
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
  const [recipients, setRecipients] = useState<RecipientPreference[]>([]);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [minimumSeverity, setMinimumSeverity] = useState("high");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [senderEditorOpen, setSenderEditorOpen] = useState(false);
  const [senderReceivesAlerts, setSenderReceivesAlerts] = useState(true);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "recipient" | "save" | "test" | "vendors" | "">("");
  const [message, setMessage] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "sent" | "queued" | "blocked">("all");

  const pendingDeliveries = useMemo(() => email?.deliveries.filter((item) => item.status === "pending" || item.status === "failed").length ?? 0, [email]);
  const activeRecipientCount = useMemo(() => recipients.filter((recipient) => recipient.enabled).length, [recipients]);

  async function loadSettings(syncForm = false) {
    const value = await getSecurityEmailAlertSettings();
    setEmail(value);
    if (syncForm) {
      setRecipients(settingsRecipients(value));
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
        setRecipients(settingsRecipients(value));
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
      const value = await updateSecurityEmailAlertSettings({ recipients, enabled: emailEnabled, minimumSeverity });
      setEmail(value);
      setRecipients(settingsRecipients(value));
      setEmailEnabled(value.enabled);
      setMessage(isFa ? "تنظیمات اعلان ذخیره شد." : "Alert settings saved.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  async function persistRecipients(nextRecipients: RecipientPreference[], successMessage: string) {
    setBusy("recipient");
    setMessage("");
    try {
      const enabled = emailEnabled && nextRecipients.some((recipient) => recipient.enabled);
      const value = await updateSecurityEmailAlertSettings({ recipients: nextRecipients, enabled, minimumSeverity });
      setEmail(value);
      setRecipients(settingsRecipients(value));
      setEmailEnabled(value.enabled);
      setMessage(successMessage);
      return true;
    } catch (reason) {
      setMessage(emailFailure(reason, isFa));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function addRecipient() {
    const value = recipientDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setMessage(isFa ? "یک آدرس ایمیل معتبر وارد کنید." : "Enter a valid email address.");
      return;
    }
    if (recipients.some((recipient) => recipient.email === value)) {
      setMessage(isFa ? "این ایمیل قبلاً در فهرست گیرنده‌ها ثبت شده است." : "This recipient is already in the list.");
      return;
    }
    if (recipients.length >= 10) {
      setMessage(isFa ? "حداکثر ۱۰ گیرنده قابل ثبت است." : "You can register up to 10 recipients.");
      return;
    }
    const saved = await persistRecipients([...recipients, { email: value, enabled: true }], isFa ? "گیرنده جدید ثبت و فعال شد." : "The new recipient was saved and enabled.");
    if (saved) setRecipientDraft("");
  }

  async function removeRecipient(address: string) {
    await persistRecipients(recipients.filter((item) => item.email !== address), isFa ? "گیرنده حذف شد." : "The recipient was removed.");
  }

  async function toggleRecipient(address: string, enabled: boolean) {
    await persistRecipients(
      recipients.map((recipient) => recipient.email === address ? { ...recipient, enabled } : recipient),
      enabled ? (isFa ? "ارسال هشدار برای این ایمیل فعال شد." : "Alerts were enabled for this address.") : (isFa ? "ارسال هشدار برای این ایمیل متوقف شد." : "Alerts were paused for this address.")
    );
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
      let value = await connectGmailSecuritySender({ senderEmail, appPassword });
      const verifiedEmail = (value.sender.email ?? senderEmail).trim().toLowerCase();
      const currentRecipients = settingsRecipients(value);
      const nextRecipients = currentRecipients.some((recipient) => recipient.email.toLowerCase() === verifiedEmail)
        ? currentRecipients.map((recipient) => recipient.email.toLowerCase() === verifiedEmail ? { ...recipient, enabled: senderReceivesAlerts } : recipient)
        : senderReceivesAlerts ? [...currentRecipients, { email: verifiedEmail, enabled: true }] : currentRecipients;
      if (JSON.stringify(nextRecipients) !== JSON.stringify(currentRecipients)) {
        value = await updateSecurityEmailAlertSettings({ recipients: nextRecipients, enabled: value.enabled && nextRecipients.some((recipient) => recipient.enabled), minimumSeverity });
      }
      setEmail(value); setSenderEmail(value.sender.email ?? senderEmail); setRecipients(settingsRecipients(value)); setEmailEnabled(value.enabled); setAppPassword("");
      setSenderEditorOpen(false);
      setMessage(isFa ? "اتصال Gmail تأیید و ذخیره شد." : "Gmail connection verified and saved.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  async function disconnectGmail() {
    setBusy("disconnect"); setMessage("");
    try {
      const value = await disconnectGmailSecuritySender();
      setEmail(value); setSenderEmail(""); setAppPassword(""); setEmailEnabled(false); setSenderEditorOpen(false);
      setMessage(isFa ? "اتصال Gmail حذف و ارسال خودکار غیرفعال شد." : "Gmail disconnected and automatic delivery disabled.");
    } catch (reason) { setMessage(emailFailure(reason, isFa)); }
    finally { setBusy(""); }
  }

  function editSender(candidateEmail = "") {
    setSenderEmail(candidateEmail);
    setAppPassword("");
    setShowAppPassword(false);
    setSenderReceivesAlerts(true);
    setSenderEditorOpen(true);
    setMessage("");
  }

  function closeSenderEditor() {
    if (busy === "connect") return;
    setSenderEditorOpen(false);
    setAppPassword("");
    setShowAppPassword(false);
    setMessage("");
  }

  useEffect(() => {
    if (!senderEditorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeSenderEditor(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [senderEditorOpen, busy]);

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
      <article className={email?.enabled ? "is-ready" : "is-muted"}><ShieldCheck size={20} /><span><small>{isFa ? "ارسال خودکار" : "Automatic alerts"}</small><strong>{email?.enabled ? (isFa ? `فعال برای ${activeRecipientCount.toLocaleString("fa-IR")} گیرنده` : `Enabled for ${activeRecipientCount} recipient${activeRecipientCount === 1 ? "" : "s"}`) : (isFa ? "غیرفعال" : "Disabled")}</strong></span></article>
      <article className={pendingDeliveries ? "is-warning" : "is-ready"}><BellRing size={20} /><span><small>{isFa ? "در صف ارسال" : "Queued"}</small><strong>{pendingDeliveries.toLocaleString(isFa ? "fa-IR" : "en-US")}</strong></span></article>
    </section>

    <ol className="email-setup-progress" aria-label={isFa ? "مراحل آماده‌سازی اعلان ایمیلی" : "Email alert setup progress"}>
      <li className={email?.sender.connected ? "is-complete" : "is-current"}><span>{email?.sender.connected ? <CheckCircle2 /> : "۱"}</span><div><strong>{isFa ? "اتصال فرستنده" : "Connect sender"}</strong><small>{email?.sender.connected ? (isFa ? "تأیید شده" : "Verified") : (isFa ? "Gmail را متصل کنید" : "Connect Gmail")}</small></div></li>
      <li className={recipients.length ? "is-complete" : email?.sender.connected ? "is-current" : ""}><span>{recipients.length ? <CheckCircle2 /> : "۲"}</span><div><strong>{isFa ? "گیرندگان" : "Recipients"}</strong><small>{recipients.length ? (isFa ? `${activeRecipientCount.toLocaleString("fa-IR")} فعال از ${recipients.length.toLocaleString("fa-IR")}` : `${activeRecipientCount} active of ${recipients.length}`) : (isFa ? "حداقل یک آدرس" : "Add at least one")}</small></div></li>
      <li className={email?.enabled ? "is-complete" : activeRecipientCount ? "is-current" : ""}><span>{email?.enabled ? <CheckCircle2 /> : "۳"}</span><div><strong>{isFa ? "فعال‌سازی" : "Activate"}</strong><small>{email?.enabled ? (isFa ? "ارسال خودکار فعال" : "Automatic delivery on") : (isFa ? "ذخیره و تست کنید" : "Save and test")}</small></div></li>
    </ol>

    <div className="email-alerts-primary-grid">
    <section className={`gmail-connection ${email?.sender.connected ? "is-connected" : ""}`}>
      <header><span><KeyRound size={22} /></span><div><h2>{isFa ? "حساب فرستنده" : "Sender account"}</h2><p>{email?.sender.connected ? (isFa ? "حساب Gmail تأیید شده و App Password به‌صورت رمزنگاری‌شده نگهداری می‌شود." : "Gmail is verified and the App Password is stored encrypted.") : (isFa ? "یک App Password شانزده‌کاراکتری از Google بسازید و اتصال را یک‌بار تأیید کنید." : "Create a 16-character Google App Password and verify the connection once.")}</p></div><strong>{email?.sender.connected ? (isFa ? "متصل" : "Connected") : (isFa ? "متصل نیست" : "Not connected")}</strong></header>
      {email?.sender.connected ? <div className="gmail-connection__connected">
        <div><CheckCircle2 size={19} /><span><small>{isFa ? "فرستنده فعال" : "Active sender"}</small><strong dir="ltr">{email.sender.email}</strong></span></div>
        <div className="gmail-connection__connected-actions">
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"><ExternalLink size={15} />{isFa ? "ساخت App Password" : "Create App Password"}</a>
          <button type="button" onClick={() => editSender()} disabled={Boolean(busy)}><Pencil size={16} />{isFa ? "اتصال حساب دیگر" : "Connect another account"}</button>
          <button type="button" className="is-danger" onClick={() => void disconnectGmail()} disabled={Boolean(busy)}><Unplug size={16} />{busy === "disconnect" ? (isFa ? "در حال حذف…" : "Disconnecting…") : (isFa ? "حذف اتصال" : "Disconnect")}</button>
        </div>
      </div> : null}
      {!email?.sender.connected ? <button type="button" className="gmail-connection__start" onClick={() => editSender()} disabled={Boolean(busy)}><KeyRound size={17} />{isFa ? "شروع اتصال و تأیید Gmail" : "Connect and verify Gmail"}</button> : null}
    </section>

    <section className="security-alert-email email-alerts-settings">
      <div className="security-alert-email__intro"><span><Mail size={22} /></span><div><h2>{isFa ? "گیرنده‌های هشدار" : "Alert recipients"}</h2><p>{isFa ? "ایمیل‌ها را ثبت کنید و برای هرکدام مشخص کنید هشدار دریافت کند یا نه." : "Register addresses and choose which ones should receive alerts."}</p></div></div>
      <div className="email-recipient-manager">
        <label><span>{isFa ? "افزودن ایمیل جدید" : "Add another email"}</span><div><input type="email" dir="ltr" value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addRecipient(); } }} placeholder={senderEmail || "security@example.com"} disabled={Boolean(busy)} /><button type="button" onClick={() => void addRecipient()} disabled={Boolean(busy) || !recipientDraft.trim() || recipients.length >= 10}><Plus size={17} />{busy === "recipient" ? (isFa ? "ثبت…" : "Saving…") : (isFa ? "افزودن" : "Add")}</button></div></label>
        <div className="email-recipient-list" aria-label={isFa ? "گیرنده‌های ثبت‌شده" : "Registered recipients"}>{recipients.length ? recipients.map((recipient, index) => {
          const isVerifiedSender = Boolean(email?.sender.connected && email.sender.email?.toLowerCase() === recipient.email.toLowerCase());
          return <article key={recipient.email} className={recipient.enabled ? "is-enabled" : "is-paused"}>
            <div className="email-recipient-list__identity"><span><Mail size={16} /></span><div><small>{isFa ? `گیرنده ${index + 1}` : `Recipient ${index + 1}`}</small><strong dir="ltr">{recipient.email}</strong><em className={isVerifiedSender ? "is-verified" : ""}>{isVerifiedSender ? <><ShieldCheck size={13} />{isFa ? "فرستنده تأییدشده" : "Verified sender"}</> : <><Inbox size={13} />{isFa ? "فقط گیرنده؛ بدون نیاز به App Password" : "Recipient only; no App Password needed"}</>}</em></div></div>
            <div className="email-recipient-list__controls">{!isVerifiedSender ? <button type="button" className="email-recipient-connect" onClick={() => editSender(recipient.email)} disabled={Boolean(busy)}><KeyRound size={15} />{isFa ? "اتصال به‌عنوان فرستنده" : "Connect as sender"}</button> : null}<label className="email-recipient-toggle"><input type="checkbox" checked={recipient.enabled} onChange={(event) => void toggleRecipient(recipient.email, event.target.checked)} disabled={Boolean(busy)} /><span>{recipient.enabled ? (isFa ? "دریافت هشدار" : "Receiving alerts") : (isFa ? "ارسال متوقف" : "Paused")}</span></label><button type="button" className="email-recipient-remove" onClick={() => void removeRecipient(recipient.email)} disabled={Boolean(busy)} aria-label={isFa ? `حذف ${recipient.email}` : `Remove ${recipient.email}`}><X size={16} /></button></div>
          </article>;
        }) : <div className="email-recipient-list__empty"><Inbox size={20} /><span>{isFa ? "هنوز گیرنده‌ای اضافه نشده است." : "No recipient has been added yet."}</span></div>}</div>
      </div>
      <div className="security-alert-email__form email-alerts-options"><label><span>{isFa ? "سطح هشدار" : "Alert level"}</span><select value={minimumSeverity} onChange={(event) => setMinimumSeverity(event.target.value)}><option value="high">{isFa ? "مهم و بحرانی" : "High and critical"}</option><option value="critical">{isFa ? "فقط بحرانی" : "Critical only"}</option></select></label><label className="security-alert-email__toggle"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} disabled={!email?.smtpConfigured || !activeRecipientCount} /><span>{isFa ? "ارسال خودکار فعال باشد" : "Enable automatic alerts"}</span></label></div>
      <div className="email-alerts-actions"><button type="button" onClick={() => void saveEmail()} disabled={Boolean(busy) || (emailEnabled && (!email?.smtpConfigured || !activeRecipientCount))}><CheckCircle2 size={16} />{busy === "save" ? (isFa ? "در حال ذخیره…" : "Saving…") : (isFa ? "ذخیره تنظیمات" : "Save settings")}</button><button type="button" className="is-secondary" onClick={() => void testEmail()} disabled={Boolean(busy) || !email?.smtpConfigured || !activeRecipientCount}><Send size={16} />{busy === "test" ? (isFa ? "در حال ارسال…" : "Sending…") : (isFa ? `ارسال تست به ${activeRecipientCount.toLocaleString("fa-IR")} ایمیل فعال` : `Test ${activeRecipientCount} active recipient${activeRecipientCount === 1 ? "" : "s"}`)}</button></div>
      <details className="email-alerts-advanced"><summary>{isFa ? "آزمایش پیشرفته قالب وندورها" : "Advanced vendor template test"}</summary><p>{isFa ? "برای بررسی قالب اختصاصی هر وندور، پنج ایمیل آزمایشی جداگانه فقط برای گیرنده‌های فعال ارسال می‌شود." : "Sends five vendor template tests only to active recipients."}</p><button type="button" onClick={() => void testVendors()} disabled={Boolean(busy) || !email?.smtpConfigured || !activeRecipientCount}><Send size={16} />{busy === "vendors" ? (isFa ? "در حال ارسال ۵ تست…" : "Sending 5 tests…") : (isFa ? "اجرای تست وندورها" : "Run vendor tests")}</button></details>
      <div className={`security-alert-email__health ${email?.smtpConfigured ? "is-ready" : "is-warning"}`}><BellRing size={17} /><span>{email?.smtpConfigured ? (isFa ? "فرستنده آماده است. وضعیت ارسال‌های واقعی پایین صفحه نمایش داده می‌شود." : "The sender is ready. Real delivery status appears below.") : (isFa ? "ابتدا حساب Gmail را متصل کنید." : "Connect Gmail first.")}</span></div>
      {message ? <p className="security-rules-inline-status" role="status">{message}</p> : null}
    </section>
    </div>

    {senderEditorOpen ? <div className="email-sender-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSenderEditor(); }}>
      <section className="email-sender-modal" role="dialog" aria-modal="true" aria-labelledby="email-sender-modal-title">
        <header><div><span><KeyRound size={20} /></span><div><small>{isFa ? "مرحله تأیید فرستنده" : "Sender verification"}</small><h2 id="email-sender-modal-title">{isFa ? "اتصال حساب Gmail" : "Connect Gmail account"}</h2></div></div><button type="button" onClick={closeSenderEditor} disabled={busy === "connect"} aria-label={isFa ? "بستن" : "Close"}><X size={19} /></button></header>
        {email?.sender.connected ? <p className="email-sender-modal__notice"><ShieldCheck size={17} />{isFa ? `فرستنده فعلی (${email.sender.email}) تا تأیید موفق حساب جدید فعال می‌ماند.` : `The current sender (${email.sender.email}) stays active until the new account is verified.`}</p> : null}
        <ol className="email-sender-modal__steps"><li><span>۱</span><div><strong>{isFa ? "App Password بسازید" : "Create an App Password"}</strong><small>{isFa ? "در حساب Google، تأیید دومرحله‌ای را فعال و یک App Password بسازید." : "Enable Google 2-Step Verification and create an App Password."}</small></div><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer"><ExternalLink size={15} />{isFa ? "رفتن به Google" : "Open Google"}</a></li><li><span>۲</span><div><strong>{isFa ? "اتصال را تأیید کنید" : "Verify the connection"}</strong><small>{isFa ? "ذخیره فقط پس از ورود موفق به Gmail انجام می‌شود." : "Nothing is saved until Gmail authentication succeeds."}</small></div></li></ol>
        <div className="email-sender-modal__form"><label><span>{isFa ? "آدرس Gmail فرستنده" : "Sender Gmail address"}</span><input type="email" dir="ltr" autoComplete="username" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="name@gmail.com" disabled={Boolean(busy)} /></label><label><span>{isFa ? "App Password شانزده‌کاراکتری" : "16-character App Password"}</span><div className="gmail-connection__secret"><input type={showAppPassword ? "text" : "password"} dir="ltr" autoComplete="new-password" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} placeholder="xxxx xxxx xxxx xxxx" disabled={Boolean(busy)} /><button type="button" aria-label={showAppPassword ? (isFa ? "مخفی‌کردن رمز" : "Hide password") : (isFa ? "نمایش رمز" : "Show password")} onClick={() => setShowAppPassword((value) => !value)}>{showAppPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><small>{isFa ? "رمز عادی حساب Google را وارد نکنید." : "Do not enter your normal Google password."}</small></label><label className="email-sender-modal__recipient-option"><input type="checkbox" checked={senderReceivesAlerts} onChange={(event) => setSenderReceivesAlerts(event.target.checked)} /><span><strong>{isFa ? "این حساب هشدارها را هم دریافت کند" : "Also receive alerts at this address"}</strong><small>{isFa ? "در صورت خاموش‌بودن، این حساب فقط فرستنده خواهد بود." : "When off, this account is used only as the sender."}</small></span></label></div>
        {message ? <p className="email-sender-modal__message" role="status">{message}</p> : null}
        <footer><button type="button" className="is-secondary" onClick={closeSenderEditor} disabled={busy === "connect"}>{isFa ? "انصراف" : "Cancel"}</button><button type="button" className="is-primary" onClick={() => void connectGmail()} disabled={Boolean(busy) || !senderEmail.trim() || appPassword.replace(/\s+/g, "").length !== 16}><CheckCircle2 size={17} />{busy === "connect" ? (isFa ? "در حال بررسی اتصال…" : "Verifying…") : (isFa ? "تأیید و اتصال" : "Verify and connect")}</button></footer>
      </section>
    </div> : null}

    <section className="email-delivery-history">
      <header><div><BellRing size={20} /><span><h2>{isFa ? "تاریخچه ارسال ایمیل" : "Email delivery history"}</h2><p>{isFa ? "علت هشدار، گیرنده و نتیجه هر تلاش را شفاف ببینید." : "See the alert reason, recipient, and result of every attempt."}</p></span></div></header>
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
