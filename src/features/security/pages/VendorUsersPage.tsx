import { Activity, AlertTriangle, ChevronLeft, Clock3, FileSearch2, Info, KeyRound, LogIn, Search, Server, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { listVendorUserActivity, type VendorUserActivity } from "@/lib/platform";
import { createCatalogAction } from "@/lib/commandCatalog";
import { publishActionPlanCreated } from "@/lib/actionPlanHandoff";
import VendorUserTimeline from "./VendorUserTimeline";
import "@/features/attackers/pages/AttackersPage.css";
import "./VendorUsersPage.css";

function formatTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

export default function VendorUsersPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa");
  const locale = isFa ? "fa-IR" : "en-US";
  const [vendor, setVendor] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<VendorUserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionDeviceId, setActionDeviceId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await listVendorUserActivity({ vendor, deviceId, days, username: selected });
        if (cancelled) return;
        setData(result);
        setError("");
        if (!vendor && result.recommendedVendor) setVendor(result.recommendedVendor);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : isFa ? "دریافت داده‌های کاربران ناموفق بود." : "Could not load vendor accounts.");
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [vendor, deviceId, days, selected, isFa]);

  const current = data?.vendor === vendor && data.days === days && data.deviceId === (deviceId || null) ? data : null;
  const selectedData = current?.selectedUsername?.toLowerCase() === (selected || null)?.toLowerCase() ? current : null;
  const accounts = useMemo(() => (current?.accounts ?? []).filter((account) => {
    const needle = search.trim().toLowerCase();
    return !needle || [account.username, ...account.devices.map((device) => device.name), ...account.sourceIps].join(" ").toLowerCase().includes(needle);
  }), [current, search]);
  const active = current?.accounts.find((account) => account.username.toLowerCase() === selected.toLowerCase());
  const detailOpen = Boolean(active);
  useEffect(() => {
    if (!detailOpen) return;
    document.body.classList.add("vendor-user-detail-open");
    if (window.matchMedia("(max-width: 1100px)").matches) detailRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(""); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.classList.remove("vendor-user-detail-open"); document.removeEventListener("keydown", closeOnEscape); };
  }, [detailOpen]);
  const findings = selectedData?.findings.filter((finding) => finding.username.toLowerCase() === selected.toLowerCase()) ?? [];
  const totalLogins = current?.accounts.reduce((sum, account) => sum + account.loginCount, 0) ?? 0;
  const reviewAccounts = current?.accounts.filter((account) => account.reviewCount || account.findingCount).length ?? 0;
  const reviewDevices = active?.devices.filter((device) => active.reviewDeviceIds.includes(device.id)) ?? [];
  const targetDeviceId = reviewDevices.some((device) => device.id === actionDeviceId) ? actionDeviceId : reviewDevices[0]?.id ?? "";
  const lockSupported = vendor === "linux" && /^[a-z_][a-z0-9_.-]{0,31}$/i.test(active?.username ?? "") && active?.username.toLowerCase() !== "root";

  async function prepareAccountLock() {
    if (!active || !targetDeviceId || !lockSupported || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      const plan = await createCatalogAction("linux.lock-user", targetDeviceId, { username: active.username });
      publishActionPlanCreated(plan.id);
      navigate(`/actions/${encodeURIComponent(plan.id)}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : isFa ? "ساخت برنامهٔ اقدام ناموفق بود." : "Could not create the action plan.");
    } finally {
      setActionBusy(false);
    }
  }

  return <section className="page-stack attackers-page vendor-users-page">
    <header className="attacker-hero">
      <div className="attacker-hero__title"><span><UsersRound /></span><div>
        <small>{isFa ? "امنیت / هویت و ردپای فعالیت" : "Security / Identity & activity"}</small>
        <h1>{isFa ? "کاربران و فعالیت‌های وندورها" : "Vendor users & activity"}</h1>
        <p>{isFa ? "ورودهای ثبت‌شده، رویدادهای منتسب به حساب و موارد نیازمند بررسی؛ با تکیه بر لاگ واقعی." : "Observed logins, account-attributed events, and review signals based on real logs."}</p>
      </div></div>
      <div className="attacker-hero__actions"><span><ShieldCheck />{isFa ? "شواهد ثبت‌شده · به‌روزرسانی خودکار" : "Recorded evidence · auto refresh"}</span></div>
    </header>

    <section className="attacker-summary-grid vendor-users-summary" aria-label={isFa ? "خلاصه" : "Summary"}>
      <article className="is-total"><UsersRound /><span>{isFa ? "حساب با ورود یا تغییر ثبت‌شده" : "Accounts with login or change"}</span><strong>{(current?.accounts.length ?? 0).toLocaleString(locale)}</strong></article>
      <article className="is-contained"><LogIn /><span>{isFa ? "ورود ثبت‌شده" : "Recorded logins"}</span><strong>{totalLogins.toLocaleString(locale)}</strong></article>
      <article className="is-assets"><Server /><span>{isFa ? "تجهیزات این وندور" : "Vendor devices"}</span><strong>{(current?.devices.length ?? 0).toLocaleString(locale)}</strong></article>
      <article className="is-serious"><AlertTriangle /><span>{isFa ? "حساب نیازمند بررسی" : "Accounts requiring review"}</span><strong>{reviewAccounts.toLocaleString(locale)}</strong></article>
    </section>

    <section className="attacker-toolbar vendor-users-toolbar" aria-label={isFa ? "فیلترها" : "Filters"}>
      <label className="attacker-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isFa ? "جست‌وجوی حساب، تجهیز یا IP" : "Search account, device, or IP"} /></label>
      <label><span>{isFa ? "وندور" : "Vendor"}</span><select value={vendor} onChange={(event) => { setVendor(event.target.value); setDeviceId(""); setSelected(""); }}><option value="">{isFa ? "انتخاب وندور" : "Choose vendor"}</option>{(data?.vendors ?? []).map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label><span>{isFa ? "تجهیز" : "Device"}</span><select value={deviceId} disabled={!vendor} onChange={(event) => { setDeviceId(event.target.value); setSelected(""); }}><option value="">{isFa ? "همهٔ تجهیزات" : "All devices"}</option>{(current?.devices ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>{isFa ? "بازه" : "Window"}</span><select value={days} onChange={(event) => { setDays(Number(event.target.value)); setSelected(""); }}><option value={7}>{isFa ? "۷ روز" : "7 days"}</option><option value={30}>{isFa ? "۳۰ روز" : "30 days"}</option><option value={90}>{isFa ? "۹۰ روز" : "90 days"}</option></select></label>
    </section>

    {error ? <div className="vendor-users-notice is-error" role="alert"><AlertTriangle />{isFa ? "دریافت تازه ناموفق بود؛ دادهٔ قبلی ممکن است قدیمی باشد." : "Refresh failed; previously shown data may be stale."} <span>{error}</span></div> : null}
    {current ? <div className={`vendor-users-notice ${current.monitoring?.enabledCollectors && current.monitoring.latestErrorAt && (!current.monitoring.latestCollectionAt || current.monitoring.latestErrorAt > current.monitoring.latestCollectionAt) ? "is-warning" : ""}`} role="status"><Activity /><span>{current.monitoring?.enabledCollectors ? (isFa ? "پایش خودکار فعال است؛ نیازی به اجرای دستی نیست." : "Automatic monitoring is active; no manual scan is needed.") : (isFa ? "برای این انتخاب گردآورندهٔ فعالی ثبت نشده است؛ فقط لاگ‌های واردشده نمایش داده می‌شوند." : "No active collector for this selection; only imported logs appear.")}{current.monitoring?.latestCollectionAt ? ` ${isFa ? "آخرین جمع‌آوری موفق:" : "Last successful collection:"} ${formatTime(current.monitoring.latestCollectionAt, locale)}` : ""} · {isFa ? "آخرین به‌روزرسانی صفحه:" : "View updated:"} {formatTime(current.refreshedAt, locale)}</span></div> : null}
    <div className="vendor-users-notice"><Info /><span>{isFa ? "این نما ورودها و تغییرهای منتسب به حساب را نشان می‌دهد، نه کاربران آنلاین. حسابِ دارای تغییر ممکن است لاگ ورود نداشته باشد. رویدادهای یک نام حساب الزاماً به یک شخص یا نشست تعلق ندارند." : "This view shows observed logins and attributed changes, not online users. A changed account may have no login log. Events sharing an account name may not belong to one person or session."}</span></div>
    {current?.coverage === "import_only" ? <div className="vendor-users-notice is-warning"><Info /><span>{isFa ? "برای این وندور collector لاگ حساب وجود ندارد؛ فقط رویدادهای واردشده نمایش داده می‌شوند. برای پوشش بیشتر، لاگ audit آن را وارد برنامه کنید." : "No account-log collector is available for this vendor. Only imported events can appear; import its audit logs for better coverage."}</span></div> : null}
    {current?.sampled ? <div className="vendor-users-notice is-warning"><Info /><span>{isFa ? "حجم رویدادها از سقف بررسی این نما بیشتر است؛ نتایج نمونه‌ای‌اند و نبود یک حساب به معنی نبود فعالیت نیست." : "The event volume exceeds this view's scan limit. Results are sampled; an absent account does not prove no activity."}</span></div> : null}

    <div className={`attacker-workspace ${active ? "has-detail" : ""}`}>
      <section className="attacker-list-panel"><header><div><h2>{isFa ? "حساب‌های دارای ورود یا تغییر ثبت‌شده" : "Accounts with login or change evidence"}</h2><p>{accounts.length.toLocaleString(locale)} {isFa ? "حساب در فیلتر فعلی" : "accounts in current filter"}</p></div><UsersRound /></header>
        {loading && !current ? <div className="attacker-empty"><Clock3 /><h3>{isFa ? "در حال دریافت شواهد..." : "Loading evidence..."}</h3></div> : accounts.length ? <div className="attacker-list">{accounts.map((account) => <button key={account.username.toLowerCase()} type="button" className={`attacker-card vendor-user-card ${selected.toLowerCase() === account.username.toLowerCase() ? "is-selected" : ""} ${account.reviewCount || account.findingCount ? "attacker-card--high" : ""}`} onClick={() => setSelected(account.username)}><span className="attacker-card__score"><strong>{account.loginCount.toLocaleString(locale)}</strong><small>{isFa ? "ورود" : "logins"}</small></span><span className="attacker-card__body"><span className="attacker-card__identity"><code dir="ltr">{account.username}</code>{account.reviewCount || account.findingCount ? <i>{isFa ? "بررسی" : "Review"}</i> : null}</span><span className="attacker-card__facts"><span><Server />{account.devices.map((item) => item.name).join("، ") || (isFa ? "تجهیز نامشخص" : "Unknown device")}</span><span><Activity />{account.activityCount.toLocaleString(locale)} {isFa ? "رویداد دیگر" : "other events"}</span><span><Clock3 />{formatTime(account.lastSeen, locale)}</span></span></span><ChevronLeft className="attacker-card__open" /></button>)}</div> : <div className="attacker-empty"><KeyRound /><h3>{isFa ? "ورود قابل‌انتساب ثبت نشده" : "No attributable login recorded"}</h3><p>{isFa ? "این نتیجه به معنی نبود کاربر نیست؛ لاگ ورود این وندور/تجهیز یا بازهٔ انتخابی ممکن است پوشش نداشته باشد." : "This does not mean no users exist. Login logs may be missing for this vendor, device, or time window."}</p><Link to={deviceId ? `/assets/devices/${encodeURIComponent(deviceId)}/monitoring` : "/assets/devices"}>{isFa ? "بررسی پایش تجهیزات" : "Check device monitoring"}</Link></div>}
      </section>

      {active ? <aside ref={detailRef} className="attacker-detail vendor-user-detail" role="dialog" aria-modal="true" aria-label={isFa ? "جزئیات حساب" : "Account details"} tabIndex={-1}><button type="button" className="vendor-user-detail-close" onClick={() => setSelected("")} aria-label={isFa ? "بازگشت به فهرست حساب‌ها" : "Back to accounts"}><X />{isFa ? "بازگشت به حساب‌ها" : "Back to accounts"}</button><div className={`attacker-detail__hero ${active.reviewCount || active.findingCount ? "attacker-detail__hero--high" : ""}`}><span><KeyRound /></span><div><small>{isFa ? "نام حساب در وندور انتخابی" : "Account name in selected vendor"}</small><h2 dir="ltr">{active.username}</h2><p>{vendor} · {active.devices.length.toLocaleString(locale)} {isFa ? "تجهیز" : "devices"}</p></div><strong>{active.loginCount.toLocaleString(locale)}<small> {isFa ? "ورود" : "logins"}</small></strong></div>
        <div className="attacker-detail__metrics"><article><LogIn /><span>{isFa ? "ورود" : "Logins"}</span><strong>{active.loginCount.toLocaleString(locale)}</strong></article><article><Activity /><span>{isFa ? "فعالیت دیگر" : "Other activity"}</span><strong>{active.activityCount.toLocaleString(locale)}</strong></article><article><AlertTriangle /><span>{isFa ? "نیازمند بررسی" : "Review signals"}</span><strong>{active.reviewCount.toLocaleString(locale)}</strong></article><article><FileSearch2 /><span>{isFa ? "یافتهٔ مرتبط" : "Linked findings"}</span><strong>{active.findingCount.toLocaleString(locale)}</strong></article></div>
        {reviewDevices.length ? <section className="vendor-user-containment"><h3><ShieldCheck />{isFa ? "بررسی و مهار حساب" : "Review and contain account"}</h3><p>{isFa ? "رویداد حساس منتسب به این حساب ثبت شده است؛ این به‌تنهایی سوءاستفاده را ثابت نمی‌کند. قبل از هر اقدامی شاهد، مجوز تغییر و نقش حساب را بررسی کنید." : "A sensitive action was attributed to this account; this alone does not prove misuse. Review evidence, authorization and the account's role first."}</p><label>{isFa ? "تجهیز دارای شاهد" : "Device with evidence"}<select value={targetDeviceId} onChange={(event) => setActionDeviceId(event.target.value)}>{reviewDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>{lockSupported ? <><p>{isFa ? "قفل لینوکس فقط ورود با گذرواژه را محدود می‌کند؛ کلید SSH و نشست‌های باز ممکن است فعال بمانند. برنامه ساخته می‌شود، سپس فرمان و اثر آن را در مرکز عملیات می‌بینید و اجرای آن فقط با تأیید صریح شماست." : "Linux account locking restricts password sign-in only; SSH keys and active sessions may remain. Review the plan in Action Center before explicitly confirming execution."}</p><button type="button" className="secondary-button" disabled={actionBusy} onClick={() => void prepareAccountLock()}>{actionBusy ? (isFa ? "در حال ساخت برنامه..." : "Preparing plan...") : (isFa ? "آماده‌سازی قفل گذرواژهٔ حساب" : "Prepare password lock plan")}</button></> : <p>{isFa ? "برای این وندور یا حساب، غیرفعال‌سازی مستقیمِ تأییدشده وجود ندارد. پس از بررسی یافته، حساب را از کنسول مدیریتی همان تجهیز محدود کنید؛ این برنامه تغییری را خودکار اعمال نمی‌کند." : "No verified direct disable operation is available for this vendor or account. Review the finding, then restrict the account in that device's management console; no change is applied automatically."}</p>}{actionError ? <p role="alert" className="vendor-user-action-error">{actionError}</p> : null}</section> : null}
        <VendorUserTimeline key={active.username.toLowerCase()} events={selectedData?.timeline ?? []} total={selectedData?.timelineTotal ?? 0} loading={loading || !selectedData} isFa={Boolean(isFa)} locale={locale} />
        {findings.length ? <section className="attacker-detail__section"><header><FileSearch2 /><div><h3>{isFa ? "یافته‌های مرتبط" : "Related findings"}</h3><p>{isFa ? "یافته‌هایی که همین نام حساب را به‌عنوان عامل ثبت کرده‌اند" : "Findings recording this account name as actor"}</p></div></header><div className="attacker-finding-list">{findings.slice(0, 12).map((finding) => <Link key={finding.id} to={`/security/findings/${finding.id}`}><span className={`is-${finding.severity}`}>{finding.severity}</span><div><strong>{finding.title}</strong><small>{formatTime(finding.lastSeen, locale)}</small></div><ChevronLeft /></Link>)}</div></section> : null}
        <div className="vendor-users-detail-note"><Info /><span>{isFa ? "بدون شناسهٔ نشست و لاگ audit کامل، همهٔ رویدادها را نمی‌توان به یک نشست یا شخص نسبت داد." : "Without session IDs and full audit logs, events cannot all be tied to one session or person."}</span></div>
      </aside> : null}
    </div>
  </section>;
}
