import { Activity, AlertTriangle, ChevronLeft, Clock3, FileSearch2, Info, KeyRound, LogIn, Search, Server, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listVendorUserActivity, type VendorUserActivity } from "@/lib/platform";
import "@/features/attackers/pages/AttackersPage.css";
import "./VendorUsersPage.css";

const kindFa: Record<VendorUserActivity["timeline"][number]["kind"], string> = {
  login: "ورود موفق",
  failed_login: "تلاش ورود ناموفق برای حساب",
  logout: "خروج ثبت‌شده",
  privileged: "دستور با دسترسی ویژه",
  change: "تغییر پیکربندی",
  activity: "رویداد منتسب به حساب"
};
const kindEn: Record<VendorUserActivity["timeline"][number]["kind"], string> = {
  login: "Successful login",
  failed_login: "Failed attempt against account",
  logout: "Recorded logout",
  privileged: "Privileged command",
  change: "Configuration change",
  activity: "Account-attributed event"
};

function formatTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

export default function VendorUsersPage() {
  const { i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa");
  const locale = isFa ? "fa-IR" : "en-US";
  const [vendor, setVendor] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<VendorUserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await listVendorUserActivity({ vendor, deviceId, days, username: selected });
        if (cancelled) return;
        setData(result);
        setError("");
        if (!vendor && result.vendors.length) setVendor(result.vendors[0]);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : isFa ? "دریافت داده‌های کاربران ناموفق بود." : "Could not load vendor accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [vendor, deviceId, days, selected, isFa]);

  const current = data?.vendor === vendor && data.days === days && data.deviceId === (deviceId || null) ? data : null;
  const selectedData = current?.selectedUsername?.toLowerCase() === (selected || null)?.toLowerCase() ? current : null;
  const accounts = useMemo(() => (current?.accounts ?? []).filter((account) => {
    const needle = search.trim().toLowerCase();
    return !needle || [account.username, ...account.devices.map((device) => device.name), ...account.sourceIps].join(" ").toLowerCase().includes(needle);
  }), [current, search]);
  const active = current?.accounts.find((account) => account.username.toLowerCase() === selected.toLowerCase());
  const findings = selectedData?.findings.filter((finding) => finding.username.toLowerCase() === selected.toLowerCase()) ?? [];
  const totalLogins = current?.accounts.reduce((sum, account) => sum + account.loginCount, 0) ?? 0;
  const reviewAccounts = current?.accounts.filter((account) => account.reviewCount || account.findingCount).length ?? 0;

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
    <div className="vendor-users-notice"><Info /><span>{isFa ? "این نما ورودها و تغییرهای منتسب به حساب را نشان می‌دهد، نه کاربران آنلاین. حسابِ دارای تغییر ممکن است لاگ ورود نداشته باشد. رویدادهای یک نام حساب الزاماً به یک شخص یا نشست تعلق ندارند." : "This view shows observed logins and attributed changes, not online users. A changed account may have no login log. Events sharing an account name may not belong to one person or session."}</span></div>
    {current?.coverage === "import_only" ? <div className="vendor-users-notice is-warning"><Info /><span>{isFa ? "برای این وندور collector لاگ حساب وجود ندارد؛ فقط رویدادهای واردشده نمایش داده می‌شوند. برای پوشش بیشتر، لاگ audit آن را وارد برنامه کنید." : "No account-log collector is available for this vendor. Only imported events can appear; import its audit logs for better coverage."}</span></div> : null}
    {current?.sampled ? <div className="vendor-users-notice is-warning"><Info /><span>{isFa ? "حجم رویدادها از سقف بررسی این نما بیشتر است؛ نتایج نمونه‌ای‌اند و نبود یک حساب به معنی نبود فعالیت نیست." : "The event volume exceeds this view's scan limit. Results are sampled; an absent account does not prove no activity."}</span></div> : null}

    <div className={`attacker-workspace ${active ? "has-detail" : ""}`}>
      <section className="attacker-list-panel"><header><div><h2>{isFa ? "حساب‌های دارای ورود یا تغییر ثبت‌شده" : "Accounts with login or change evidence"}</h2><p>{accounts.length.toLocaleString(locale)} {isFa ? "حساب در فیلتر فعلی" : "accounts in current filter"}</p></div><UsersRound /></header>
        {loading && !current ? <div className="attacker-empty"><Clock3 /><h3>{isFa ? "در حال دریافت شواهد..." : "Loading evidence..."}</h3></div> : accounts.length ? <div className="attacker-list">{accounts.map((account) => <button key={account.username.toLowerCase()} type="button" className={`attacker-card vendor-user-card ${selected.toLowerCase() === account.username.toLowerCase() ? "is-selected" : ""} ${account.reviewCount || account.findingCount ? "attacker-card--high" : ""}`} onClick={() => setSelected(account.username)}><span className="attacker-card__score"><strong>{account.loginCount.toLocaleString(locale)}</strong><small>{isFa ? "ورود" : "logins"}</small></span><span className="attacker-card__body"><span className="attacker-card__identity"><code dir="ltr">{account.username}</code>{account.reviewCount || account.findingCount ? <i>{isFa ? "بررسی" : "Review"}</i> : null}</span><span className="attacker-card__facts"><span><Server />{account.devices.map((item) => item.name).join("، ") || (isFa ? "تجهیز نامشخص" : "Unknown device")}</span><span><Activity />{account.activityCount.toLocaleString(locale)} {isFa ? "رویداد دیگر" : "other events"}</span><span><Clock3 />{formatTime(account.lastSeen, locale)}</span></span></span><ChevronLeft className="attacker-card__open" /></button>)}</div> : <div className="attacker-empty"><KeyRound /><h3>{isFa ? "ورود قابل‌انتساب ثبت نشده" : "No attributable login recorded"}</h3><p>{isFa ? "این نتیجه به معنی نبود کاربر نیست؛ لاگ ورود این وندور/تجهیز یا بازهٔ انتخابی ممکن است پوشش نداشته باشد." : "This does not mean no users exist. Login logs may be missing for this vendor, device, or time window."}</p><Link to={deviceId ? `/assets/devices/${encodeURIComponent(deviceId)}/monitoring` : "/assets/devices"}>{isFa ? "بررسی پایش تجهیزات" : "Check device monitoring"}</Link></div>}
      </section>

      {active ? <aside className="attacker-detail vendor-user-detail"><div className={`attacker-detail__hero ${active.reviewCount || active.findingCount ? "attacker-detail__hero--high" : ""}`}><span><KeyRound /></span><div><small>{isFa ? "نام حساب در وندور انتخابی" : "Account name in selected vendor"}</small><h2 dir="ltr">{active.username}</h2><p>{vendor} · {active.devices.length.toLocaleString(locale)} {isFa ? "تجهیز" : "devices"}</p></div><strong>{active.loginCount.toLocaleString(locale)}<small> {isFa ? "ورود" : "logins"}</small></strong></div>
        <div className="attacker-detail__metrics"><article><LogIn /><span>{isFa ? "ورود" : "Logins"}</span><strong>{active.loginCount.toLocaleString(locale)}</strong></article><article><Activity /><span>{isFa ? "فعالیت دیگر" : "Other activity"}</span><strong>{active.activityCount.toLocaleString(locale)}</strong></article><article><AlertTriangle /><span>{isFa ? "نیازمند بررسی" : "Review signals"}</span><strong>{active.reviewCount.toLocaleString(locale)}</strong></article><article><FileSearch2 /><span>{isFa ? "یافتهٔ مرتبط" : "Linked findings"}</span><strong>{active.findingCount.toLocaleString(locale)}</strong></article></div>
        <section className="attacker-detail__section"><header><Clock3 /><div><h3>{isFa ? "خط زمانی فعالیت" : "Activity timeline"}</h3><p>{isFa ? "از جدید به قدیم، با شاهد و تجهیز" : "Newest first, with evidence and device"}</p></div></header>{selectedData?.timeline.length ? <div className="vendor-user-timeline">{selectedData.timeline.map((event) => <article key={event.id} className={`vendor-user-event is-${event.risk}`}><div><span className={`vendor-user-kind is-${event.kind}`}>{isFa ? kindFa[event.kind] : kindEn[event.kind]}</span><time>{formatTime(event.observedAt, locale)}</time></div><p>{event.deviceName ?? (isFa ? "تجهیز نامشخص" : "Unknown device")}{event.sourceIp ? <> · <code dir="ltr">{event.sourceIp}</code></> : null}</p>{event.evidence ? <code className="vendor-user-evidence" dir="auto">{event.evidence}</code> : null}{event.risk !== "normal" ? <small>{isFa ? "برای قضاوت دربارهٔ خطر، شاهد و یافتهٔ مرتبط را بررسی کنید؛ این برچسب اثبات سوءاستفاده نیست." : "Review evidence and linked findings before judging risk; this label does not prove misuse."}</small> : null}</article>)}</div> : <p className="attacker-empty-inline">{loading || !selectedData ? (isFa ? "در حال دریافت خط زمانی..." : "Loading timeline...") : (isFa ? "برای این حساب رویدادی در نمونهٔ فعلی در دسترس نیست." : "No account events in the current sample.")}</p>}{(selectedData?.timelineTotal ?? 0) > 250 ? <p className="attacker-empty-inline">{isFa ? "فقط ۲۵۰ رویداد تازه‌تر این حساب نمایش داده شده است." : "Only the 250 newest account events are shown."}</p> : null}</section>
        {findings.length ? <section className="attacker-detail__section"><header><FileSearch2 /><div><h3>{isFa ? "یافته‌های مرتبط" : "Related findings"}</h3><p>{isFa ? "یافته‌هایی که همین نام حساب را به‌عنوان عامل ثبت کرده‌اند" : "Findings recording this account name as actor"}</p></div></header><div className="attacker-finding-list">{findings.slice(0, 12).map((finding) => <Link key={finding.id} to={`/security/findings/${finding.id}`}><span className={`is-${finding.severity}`}>{finding.severity}</span><div><strong>{finding.title}</strong><small>{formatTime(finding.lastSeen, locale)}</small></div><ChevronLeft /></Link>)}</div></section> : null}
        <div className="vendor-users-detail-note"><Info /><span>{isFa ? "بدون شناسهٔ نشست و لاگ audit کامل، همهٔ رویدادها را نمی‌توان به یک نشست یا شخص نسبت داد." : "Without session IDs and full audit logs, events cannot all be tied to one session or person."}</span></div>
      </aside> : null}
    </div>
  </section>;
}
