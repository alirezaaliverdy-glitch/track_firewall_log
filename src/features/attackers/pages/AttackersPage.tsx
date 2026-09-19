import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Ban,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Crosshair,
  Database,
  ExternalLink,
  Fingerprint,
  Globe2,
  Network,
  Plus,
  RefreshCw,
  Route,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { createFindingActionPlan, getAttackerDetails, listAttackers, type AttackerDetails, type AttackerSummary, type AttackerListResponse } from "@/lib/platform";
import { useAuth } from "@/context/AuthContext";
import { createTrustedSourceIp, deleteTrustedSourceIp, listTrustedSourceIps, type TrustedSourceIp } from "@/lib/attackerAllowlist";
import "./AttackersPage.css";

const severityOrder = ["critical", "high", "medium", "low"];

function severityLabel(value: string, isFa: boolean) {
  const fa: Record<string, string> = { critical: "بحرانی", high: "زیاد", medium: "متوسط", low: "کم" };
  return isFa ? fa[value] ?? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function scopeLabel(value: string, isFa: boolean) {
  const labels: Record<string, [string, string]> = {
    public: ["عمومی / اینترنت", "Public / Internet"],
    private: ["شبکه داخلی", "Private network"],
    loopback: ["محلی", "Loopback"],
    link_local: ["Link-local", "Link-local"]
  };
  return labels[value]?.[isFa ? 0 : 1] ?? value;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function threatFamilyLabel(key: string, fallback: string, isFa: boolean) {
  if (!isFa) return fallback;
  const labels: Record<string, string> = {
    authentication: "حمله به احراز هویت",
    auth: "حمله به احراز هویت",
    vpn: "حمله به VPN",
    reconnaissance: "شناسایی و پویش شبکه",
    "network-defense": "ترافیک مخرب مسدودشده",
    "threat-prevention": "تهدید تأییدشده توسط موتور امنیتی",
    "intrusion-detection": "تشخیص نفوذ",
    malware_threat: "بدافزار یا ارتباط مخرب",
    web_app: "حمله به سرویس وب"
  };
  return labels[key] ?? fallback;
}

function observedActionLabel(value: string, isFa: boolean) {
  if (!isFa) return value;
  const labels: Record<string, string> = { blocked: "مسدودشده", denied: "ردشده", threat_detected: "تهدید شناسایی‌شده", auth_failed: "ورود ناموفق", admin_auth_failed: "ورود مدیریتی ناموفق", vpn_auth_failed: "ورود VPN ناموفق", port_blocked: "ترافیک مسدودشده" };
  return labels[value] ?? value;
}

function AttackerCard({ attacker, selected, onSelect, isFa, locale }: { attacker: AttackerSummary; selected: boolean; onSelect: () => void; isFa: boolean; locale: string }) {
  return (
    <button type="button" className={`attacker-card attacker-card--${attacker.severity} ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <span className="attacker-card__score"><strong>{attacker.riskScore.toLocaleString(locale)}</strong><small>{isFa ? "ریسک" : "risk"}</small></span>
      <span className="attacker-card__body">
        <span className="attacker-card__identity">
          <code dir="ltr">{attacker.ip}</code>
          <i>{severityLabel(attacker.severity, isFa)}</i>
          <i>{scopeLabel(attacker.scope, isFa)}</i>
        </span>
        <span className="attacker-card__facts">
          <span><ShieldAlert />{attacker.findingCount.toLocaleString(locale)} {isFa ? "یافته" : "findings"}</span>
          <span><Activity />{attacker.eventCount.toLocaleString(locale)} {isFa ? "رویداد" : "events"}</span>
          <span><Server />{attacker.devices.length.toLocaleString(locale)} {isFa ? "دستگاه" : "devices"}</span>
          <span><Clock3 />{formatDate(attacker.lastSeen, locale)}</span>
        </span>
        <span className="attacker-card__tags">
          {attacker.vendors.map((vendor) => <i key={vendor}>{vendor}</i>)}
          {attacker.categories.slice(0, 2).map((category) => <i key={category}>{category}</i>)}
        </span>
      </span>
      <ChevronLeft className="attacker-card__open" />
    </button>
  );
}

function DetailPanel({ attacker, loading, onClose, onRespond, responseBusy, responseError, isFa, locale }: {
  attacker: AttackerDetails | null;
  loading: boolean;
  onClose: () => void;
  onRespond: (findingId: string) => void;
  responseBusy: string;
  responseError: string;
  isFa: boolean;
  locale: string;
}) {
  if (loading) return <aside className="attacker-detail"><LoadingState /></aside>;
  if (!attacker) return null;
  const verdictTitle = attacker.assessment.verdict === "confirmed_threat"
    ? (isFa ? "تهدید توسط موتور امنیتی وندور تأیید شد" : "Threat confirmed by the vendor security engine")
    : attacker.assessment.verdict === "likely_attack"
      ? (isFa ? "الگوی حمله محتمل با آستانه معتبر" : "Likely attack with a validated threshold")
      : attacker.assessment.verdict === "activity_anomaly"
        ? (isFa ? "ناهنجاری فعالیت؛ حمله تأیید نشده" : "Activity anomaly; attack not confirmed")
        : (isFa ? "نیازمند بررسی؛ مهاجم قطعی نیست" : "Needs review; not a confirmed attacker");
  const verdictDescription = attacker.assessment.verdict === "confirmed_threat"
    ? (attacker.assessment.containmentStatus === "blocked_by_vendor"
        ? (isFa ? "FortiGate یا موتور امنیتی وندور حمله را تشخیص داده و عمل مسدودسازی را نیز در لاگ ثبت کرده است." : "The vendor engine detected the threat and also recorded a blocking action.")
        : (isFa ? "امضای امنیتی معتبر ثبت شده، اما از شواهد موجود نمی‌توان مسدودشدن قطعی را اثبات کرد." : "A valid security signature exists, but the retained evidence does not prove containment."))
    : attacker.assessment.actionableFindingCount > 0
      ? (isFa ? "الگوی امنیتی از آستانه عبور کرده است؛ مالک IP و زمان رویداد را پیش از مسدودسازی تطبیق دهید." : "A security pattern crossed its threshold. Verify ownership and event time before blocking.")
      : (isFa ? "فقط تغییر منبع ورود دیده شده و به‌تنهایی نشانه حمله نیست." : "Only a new login source was observed; that alone is not an attack.");
  return (
    <aside className="attacker-detail" aria-label={isFa ? "جزئیات مهاجم" : "Attacker details"}>
      <header className={`attacker-detail__hero attacker-detail__hero--${attacker.severity}`}>
        <button type="button" onClick={onClose} aria-label={isFa ? "بستن" : "Close"}><X /></button>
        <span><Crosshair /></span>
        <div><small>{isFa ? "IP شناسایی‌شده" : "Qualified source IP"}</small><h2 dir="ltr">{attacker.ip}</h2><p>{severityLabel(attacker.severity, isFa)} · {scopeLabel(attacker.scope, isFa)}</p></div>
        <strong>{attacker.riskScore.toLocaleString(locale)}<small>/ ۱۰۰</small></strong>
      </header>

      <section className="attacker-detail__metrics">
        <article><ShieldAlert /><span>{isFa ? "یافته‌ها" : "Findings"}</span><strong>{attacker.findingCount.toLocaleString(locale)}</strong></article>
        <article><Activity /><span>{isFa ? "رویدادها" : "Events"}</span><strong>{attacker.eventCount.toLocaleString(locale)}</strong></article>
        <article><Server /><span>{isFa ? "دارایی‌های درگیر" : "Affected assets"}</span><strong>{attacker.assets.length.toLocaleString(locale)}</strong></article>
        <article><Fingerprint /><span>{isFa ? "اطمینان" : "Confidence"}</span><strong>{Math.round(attacker.confidence * 100).toLocaleString(locale)}%</strong></article>
      </section>

      <section className="attacker-detail__section attacker-assessment">
        <header><ShieldCheck /><div><h3>{isFa ? "جمع‌بندی قابل‌فهم تشخیص" : "Plain-language assessment"}</h3><p>{isFa ? "طبقه‌بندی برای IP مبدأ است، نه برای نام کاربری دیده‌شده در لاگ." : "Classification applies to the source IP, not to a username observed in the log."}</p></div></header>
        <div className="attacker-assessment__verdict">
          <span className="attacker-assessment__icon"><Fingerprint /></span>
          <div>
            <strong>{verdictTitle}</strong>
            <p>{verdictDescription}</p>
          </div>
        </div>
        <dl className="attacker-assessment__facts">
          <div><dt>{isFa ? "تلاش ورود ناموفق یکتا" : "Unique failed logins"}</dt><dd>{attacker.assessment.logicalAuthenticationFailures.toLocaleString(locale)}</dd></div>
          <div><dt>{isFa ? "ورود موفق مشاهده‌شده" : "Successful logins"}</dt><dd>{attacker.assessment.authenticationSuccesses.toLocaleString(locale)}</dd></div>
          <div><dt>{isFa ? "یافته قابل اقدام" : "Actionable findings"}</dt><dd>{attacker.assessment.actionableFindingCount.toLocaleString(locale)}</dd></div>
        </dl>
        {attacker.assessment.notes.includes("duplicate_authentication_log_lines_collapsed") ? <p className="attacker-assessment__note"><CircleAlert />{isFa ? "خطوط تکراری PAM/SSH در این شمارش یکی شده‌اند تا یک تلاش چند بار محاسبه نشود." : "Duplicate PAM/SSH lines were collapsed so one attempt is not counted more than once."}</p> : null}
      </section>

      <section className="attacker-detail__section attacker-response">
        <header><Ban /><div><h3>{isFa ? "پاسخ کنترل‌شده به تهدید" : "Controlled threat response"}</h3><p>{isFa ? "از شواهد همین رخداد، پیش‌نمایش مقابله مخصوص وندور ساخته می‌شود؛ اجرا فقط پس از مرور شماست." : "Build a vendor-specific response preview from this evidence; execution still requires your review."}</p></div></header>
        <div className="attacker-response__flow" aria-label={isFa ? "مراحل پاسخ" : "Response flow"}>
          <span><b>۱</b>{isFa ? "انتخاب شاهد" : "Evidence"}</span><i>←</i><span><b>۲</b>{isFa ? "پیش‌نمایش امن" : "Safe preview"}</span><i>←</i><span><b>۳</b>{isFa ? "تأیید و اجرا" : "Confirm"}</span>
        </div>
        <div className="attacker-response__targets">
          {attacker.responseReadiness.map((target) => (
            <article key={target.deviceId} className={`is-${target.mode}`}>
              <span className="attacker-response__vendor"><ShieldCheck /><b>{target.vendor}</b></span>
              <div><strong>{target.deviceName}</strong><small>{target.mode === "ready" ? (isFa ? "آماده ساخت پاسخ" : "Ready") : target.mode === "needs_parameters" ? (isFa ? `نیازمند تکمیل ${target.missingParameters.join(" و ")}` : `Needs ${target.missingParameters.join(", ")}`) : (isFa ? "فقط بررسی دستی" : "Review only")}</small></div>
              <button type="button" disabled={!target.findingId || target.mode === "review_only" || responseBusy === target.findingId} onClick={() => target.findingId && onRespond(target.findingId)}>
                <Sparkles />{responseBusy === target.findingId ? (isFa ? "در حال ساخت…" : "Building…") : (isFa ? "ساخت پیش‌نمایش مقابله" : "Build response preview")}
              </button>
            </article>
          ))}
        </div>
        {responseError ? <p className="attacker-response__error" role="alert">{responseError}</p> : null}
        <p className="attacker-response__note">{isFa ? "Linux و MikroTik با قانون مسدودی مدیریت‌شده آماده می‌شوند. در FortiGate یک Address Object و Deny Policy کنترل‌شده با اینترفیس‌های مشاهده‌شده پیشنهاد می‌شود؛ اگر اینترفیس در لاگ نبود، قبل از اجرا از شما خواسته می‌شود آن را تکمیل کنید." : "Linux and MikroTik use a managed block rule. FortiGate proposes a controlled address object and deny policy; missing interfaces must be completed before execution."}</p>
      </section>

      {attacker.attackFamilies.length ? <section className="attacker-detail__section attacker-families">
        <header><Activity /><div><h3>{isFa ? "نوع و نتیجه حمله" : "Attack type and outcome"}</h3><p>{isFa ? "رخدادهای هم‌خانواده تجمیع شده‌اند تا یک حمله چند بار نمایش داده نشود." : "Related events are grouped so one attack is not shown repeatedly."}</p></div></header>
        <div>{attacker.attackFamilies.map((family) => <article key={family.key} className={`is-${family.severity}`}><span><ShieldAlert /></span><div><strong>{threatFamilyLabel(family.key, family.title, isFa)}</strong><small>{family.key} · {family.count.toLocaleString(locale)} {isFa ? "مشاهده" : "observations"}</small></div><b className={family.blocked ? "is-blocked" : "is-detected"}>{family.blocked ? (isFa ? "توسط وندور مسدود شد" : "Blocked by vendor") : (isFa ? "شناسایی شد" : "Detected")}</b></article>)}</div>
      </section> : null}

      <section className="attacker-detail__section">
        <header><Server /><div><h3>{isFa ? "دارایی‌ها و وندورها" : "Assets and vendors"}</h3><p>{isFa ? "همه مقصدهایی که این مبدأ در آن‌ها شناسایی شده" : "All targets where this source was identified"}</p></div></header>
        <div className="attacker-target-list">
          {attacker.devices.map((device) => <Link key={device.id} to={`/assets/devices/${device.id}`}><span><Server /></span><div><strong>{device.name}</strong><small>{device.vendor} · <b dir="ltr">{device.host}</b></small></div><ExternalLink /></Link>)}
        </div>
      </section>

      <section className="attacker-detail__section">
        <header><Route /><div><h3>{isFa ? "الگوی فعالیت" : "Activity profile"}</h3><p>{isFa ? "اطلاعات استخراج‌شده از رویدادهای نرمال‌شده" : "Facts extracted from normalized events"}</p></div></header>
        <dl className="attacker-fact-grid">
          <div><dt>{isFa ? "اولین مشاهده" : "First seen"}</dt><dd>{formatDate(attacker.firstSeen, locale)}</dd></div>
          <div><dt>{isFa ? "آخرین مشاهده" : "Last seen"}</dt><dd>{formatDate(attacker.lastSeen, locale)}</dd></div>
          <div><dt>{isFa ? "پورت‌های هدف" : "Target ports"}</dt><dd dir="ltr">{attacker.targetedPorts.join(", ") || "—"}</dd></div>
          <div><dt>{isFa ? "پروتکل‌ها" : "Protocols"}</dt><dd>{attacker.protocols.join(", ") || "—"}</dd></div>
          <div><dt>{isFa ? "عملیات ثبت‌شده" : "Observed actions"}</dt><dd>{attacker.actions.map((item) => observedActionLabel(item, isFa)).join("، ") || "—"}</dd></div>
          <div><dt>{isFa ? "نام‌های کاربری هدف" : "Target usernames"}</dt><dd>{attacker.usernames.join(", ") || "—"}</dd></div>
        </dl>
        {attacker.mitreTags.length ? <div className="attacker-chip-row">{attacker.mitreTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      </section>

      <section className="attacker-detail__section">
        <header><ShieldAlert /><div><h3>{isFa ? "دلایل شناسایی" : "Qualification findings"}</h3><p>{isFa ? "یافته‌هایی که باعث ورود IP به این فهرست شده‌اند" : "Findings that qualified this IP"}</p></div></header>
        <div className="attacker-finding-list">
          {attacker.findings.map((finding) => <Link key={finding.id} to={`/security/findings/${finding.id}`}><span className={`is-${finding.severity}`}>{severityLabel(finding.severity, isFa)}</span><div><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.vendor} · {finding.category} · {formatDate(finding.lastSeen, locale)}</small></div><ExternalLink /></Link>)}
        </div>
      </section>

      <section className="attacker-detail__section">
        <header><Database /><div><h3>{isFa ? "آخرین شواهد" : "Latest evidence"}</h3><p>{isFa ? "متن‌ها پیش از نمایش از نظر اطلاعات حساس پاک‌سازی شده‌اند" : "Evidence text is redacted before display"}</p></div></header>
        <div className="attacker-evidence-list">
          {attacker.latestEvidence.length ? attacker.latestEvidence.map((event) => <article key={event.id}><header><span>{event.eventType}</span><time>{formatDate(event.timestamp, locale)}</time></header><code dir="ltr">{event.message || `${event.action ?? "event"} → ${event.dstIp ?? "target"}:${event.dstPort ?? "—"}`}</code><footer>{event.device?.name ?? event.asset?.name ?? (isFa ? "دارایی نامشخص" : "Unknown asset")} · {event.vendor ?? "unknown"}</footer></article>) : <p className="attacker-empty-inline">{isFa ? "رویداد خام نگهداری‌شده‌ای برای نمایش وجود ندارد؛ تشخیص بر پایه Finding ثبت‌شده معتبر است." : "No retained raw event is available; qualification remains backed by the stored finding."}</p>}
        </div>
      </section>

      <section className="attacker-enrichment-note"><Globe2 /><div><strong>{isFa ? "اطلاعات جغرافیایی و ASN نمایش داده نشده" : "Geo and ASN are not shown"}</strong><p>{isFa ? "در حال حاضر فقط داده قابل اثبات از لاگ وندورها نمایش داده می‌شود و سرویس غنی‌سازی خارجی تنظیم نشده است." : "Only locally provable vendor telemetry is shown; no external enrichment provider is configured."}</p></div></section>
    </aside>
  );
}

export default function AttackersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isFa = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa");
  const locale = isFa ? "fa-IR" : "en-US";
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AttackerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [scope, setScope] = useState("all");
  const [selectedIp, setSelectedIp] = useState("");
  const [details, setDetails] = useState<AttackerDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [allowlist, setAllowlist] = useState<TrustedSourceIp[]>([]);
  const [allowlistVendors, setAllowlistVendors] = useState(["all", "linux", "mikrotik", "fortigate", "cisco", "pfsense"]);
  const [trustedIp, setTrustedIp] = useState("");
  const [trustedVendor, setTrustedVendor] = useState("all");
  const [trustedLabel, setTrustedLabel] = useState("");
  const [allowlistBusy, setAllowlistBusy] = useState(false);
  const [allowlistError, setAllowlistError] = useState("");
  const [responseBusy, setResponseBusy] = useState("");
  const [responseError, setResponseError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    listAttackers().then((result) => { setData(result); setError(""); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : isFa ? "فهرست مهاجمان بارگذاری نشد." : "Attacker list failed to load.")).finally(() => setLoading(false));
  }, [isFa]);

  useEffect(() => { load(); }, [load]);

  const loadAllowlist = useCallback(() => {
    if (!isAdmin) return;
    listTrustedSourceIps().then((result) => { setAllowlist(result.entries); setAllowlistVendors(result.vendors); setAllowlistError(""); }).catch(() => setAllowlistError(isFa ? "فهرست IPهای مجاز دریافت نشد." : "Could not load trusted IPs."));
  }, [isAdmin, isFa]);

  useEffect(() => { loadAllowlist(); }, [loadAllowlist]);

  async function addTrustedSource(event: FormEvent) {
    event.preventDefault();
    if (!trustedIp.trim()) return;
    setAllowlistBusy(true); setAllowlistError("");
    try {
      await createTrustedSourceIp({ ip: trustedIp, vendor: trustedVendor, label: trustedLabel });
      setTrustedIp(""); setTrustedLabel(""); setSelectedIp(""); setDetails(null);
      loadAllowlist(); load();
    } catch (error) {
      setAllowlistError(error instanceof Error && error.message === "INVALID_TRUSTED_SOURCE_IP" ? (isFa ? "IP معتبر وارد کنید." : "Enter a valid IP address.") : (isFa ? "ثبت IP مجاز ناموفق بود." : "Could not save trusted IP."));
    } finally { setAllowlistBusy(false); }
  }

  async function removeTrustedSource(id: string) {
    setAllowlistBusy(true); setAllowlistError("");
    try { await deleteTrustedSourceIp(id); loadAllowlist(); }
    catch { setAllowlistError(isFa ? "حذف IP مجاز ناموفق بود." : "Could not remove trusted IP."); }
    finally { setAllowlistBusy(false); }
  }

  const openDetails = (ip: string) => {
    setSelectedIp(ip);
    setDetails(null);
    setDetailsLoading(true);
    getAttackerDetails(ip).then((result) => setDetails(result.attacker)).catch(() => setDetails(null)).finally(() => setDetailsLoading(false));
  };

  const createResponsePreview = async (findingId: string) => {
    setResponseBusy(findingId);
    setResponseError("");
    try {
      const result = await createFindingActionPlan(findingId);
      navigate(`/actions/${encodeURIComponent(result.actionPlan.id)}`);
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : (isFa ? "ساخت پیش‌نمایش مقابله ناموفق بود." : "Could not build the response preview."));
    } finally {
      setResponseBusy("");
    }
  };

  const attackers = useMemo(() => (data?.attackers ?? []).filter((attacker) => {
    if (vendor !== "all" && !attacker.vendors.includes(vendor)) return false;
    if (severity !== "all" && attacker.severity !== severity) return false;
    if (scope !== "all" && attacker.scope !== scope) return false;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [attacker.ip, ...attacker.vendors, ...attacker.categories, ...attacker.devices.map((device) => device.name), ...attacker.assets.map((asset) => asset.name)].join(" ").toLowerCase().includes(normalized);
  }), [data, query, scope, severity, vendor]);

  const vendors = data?.summary.vendors ?? [];
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;

  return (
    <section className="page-stack attackers-page">
      <header className="attacker-hero">
        <div className="attacker-hero__title"><span><Crosshair /></span><div><small>{isFa ? "مرکز شناسایی مبدأ تهدید" : "Threat source center"}</small><h1>{isFa ? "مبدأهای مشکوک" : "Suspicious sources"}</h1><p>{isFa ? "IPهای نیازمند بررسی بر پایه شواهد واقعی وندورها؛ فعالیت عادی به‌تنهایی مهاجم محسوب نمی‌شود." : "Source IPs that require review based on real vendor evidence; ordinary activity alone is not treated as an attacker."}</p></div></div>
        <div className="attacker-hero__actions"><span><ShieldCheck />{isFa ? "فقط یافته معتبر" : "Verified findings only"}</span><button type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? "is-spinning" : ""} />{isFa ? "به‌روزرسانی" : "Refresh"}</button></div>
      </header>

      <section className="attacker-summary-grid">
        <article className="is-total"><Crosshair /><span>{isFa ? "IP شناسایی‌شده" : "Qualified IPs"}</span><strong>{(data?.summary.total ?? 0).toLocaleString(locale)}</strong></article>
        <article className="is-serious"><CircleAlert /><span>{isFa ? "پرخطر" : "High / critical"}</span><strong>{((data?.summary.critical ?? 0) + (data?.summary.high ?? 0)).toLocaleString(locale)}</strong></article>
        <article className="is-assets"><Server /><span>{isFa ? "دستگاه درگیر" : "Affected devices"}</span><strong>{(data?.summary.affectedDevices ?? 0).toLocaleString(locale)}</strong></article>
        <article className="is-contained"><ShieldCheck /><span>{isFa ? "مهار شده توسط وندور" : "Contained by vendor"}</span><strong>{(data?.summary.contained ?? 0).toLocaleString(locale)}</strong></article>
      </section>

      <section className="attacker-toolbar">
        <label className="attacker-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFa ? "جست‌وجوی IP، وندور، دستگاه یا نوع تهدید" : "Search IP, vendor, device, or threat"} /></label>
        <label><span>{isFa ? "وندور" : "Vendor"}</span><select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="all">{isFa ? "همه وندورها" : "All vendors"}</option>{vendors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>{isFa ? "شدت" : "Severity"}</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">{isFa ? "همه شدت‌ها" : "All severities"}</option>{severityOrder.map((item) => <option key={item} value={item}>{severityLabel(item, isFa)}</option>)}</select></label>
        <label><span>{isFa ? "محدوده IP" : "IP scope"}</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">{isFa ? "همه محدوده‌ها" : "All scopes"}</option><option value="public">{scopeLabel("public", isFa)}</option><option value="private">{scopeLabel("private", isFa)}</option><option value="link_local">Link-local</option></select></label>
      </section>

      {isAdmin ? <details className="trusted-source-panel">
        <summary><span><ShieldCheck /></span><div><strong>{isFa ? "IPهای مجاز" : "Trusted IPs"}</strong><small>{isFa ? `${allowlist.length.toLocaleString(locale)} مورد؛ جلوگیری از تشخیص اشتباه بر اساس وندور` : `${allowlist.length} entries; vendor-scoped false-positive protection`}</small></div><Plus /></summary>
        <div className="trusted-source-panel__body">
          <form onSubmit={addTrustedSource}>
            <label><span>{isFa ? "آدرس IP" : "IP address"}</span><input dir="ltr" value={trustedIp} onChange={(event) => setTrustedIp(event.target.value)} placeholder="5.113.152.75" required /></label>
            <label><span>{isFa ? "محدوده وندور" : "Vendor scope"}</span><select value={trustedVendor} onChange={(event) => setTrustedVendor(event.target.value)}>{allowlistVendors.map((item) => <option key={item} value={item}>{item === "all" ? (isFa ? "همه وندورها" : "All vendors") : item}</option>)}</select></label>
            <label><span>{isFa ? "عنوان اختیاری" : "Optional label"}</span><input value={trustedLabel} onChange={(event) => setTrustedLabel(event.target.value)} maxLength={80} placeholder={isFa ? "مثلاً IP مدیر شبکه" : "e.g. Network admin IP"} /></label>
            <button type="submit" disabled={allowlistBusy || !trustedIp.trim()}><Plus />{isFa ? "افزودن" : "Add"}</button>
          </form>
          {allowlistError ? <p className="trusted-source-panel__error" role="alert">{allowlistError}</p> : null}
          {allowlist.length ? <div className="trusted-source-list">{allowlist.map((entry) => <article key={entry.id}><span><ShieldCheck /></span><code dir="ltr">{entry.ip}</code><i>{entry.vendor === "all" ? (isFa ? "همه وندورها" : "All vendors") : entry.vendor}</i><small>{entry.label || (isFa ? "بدون عنوان" : "No label")}</small><button type="button" disabled={allowlistBusy} onClick={() => void removeTrustedSource(entry.id)} aria-label={isFa ? `حذف ${entry.ip}` : `Remove ${entry.ip}`}><Trash2 /></button></article>)}</div> : <p className="trusted-source-panel__empty">{isFa ? "هنوز IP مجازی ثبت نشده است." : "No trusted IP has been added yet."}</p>}
          <p className="trusted-source-panel__hint">{isFa ? "با افزودن IP، یافته‌های باز همان IP در محدوده وندور انتخابی سرکوب و از فهرست مهاجمان حذف می‌شوند." : "Adding an IP suppresses its open findings in the selected vendor scope and removes it from attackers."}</p>
        </div>
      </details> : null}

      <div className={`attacker-workspace ${selectedIp ? "has-detail" : ""}`}>
        <section className="attacker-list-panel">
          <header><div><h2>{isFa ? "IPهای نیازمند بررسی" : "IPs requiring review"}</h2><p>{attackers.length.toLocaleString(locale)} {isFa ? "مورد مطابق فیلتر" : "matching results"}</p></div><Network /></header>
          {attackers.length ? <div className="attacker-list">{attackers.map((attacker) => <AttackerCard key={attacker.ip} attacker={attacker} selected={selectedIp === attacker.ip} onSelect={() => openDetails(attacker.ip)} isFa={isFa} locale={locale} />)}</div> : <div className="attacker-empty"><ShieldCheck /><h3>{isFa ? "موردی برای نمایش نیست" : "Nothing to review"}</h3><p>{data?.summary.total ? (isFa ? "فیلترها را پاک کنید تا همه موارد دیده شوند." : "Clear filters to see all results.") : (isFa ? "هنوز یافته باز و معتبری با IP مبدأ ثبت نشده است. رویداد عادی به‌تنهایی مهاجم محسوب نمی‌شود." : "No open finding with a valid source IP exists yet. Ordinary events are not classified as attackers.")}</p><Link to="/security/findings">{isFa ? "مشاهده یافته‌های امنیتی" : "View security findings"}</Link></div>}
        </section>
        {selectedIp ? <DetailPanel attacker={details} loading={detailsLoading} onClose={() => { setSelectedIp(""); setDetails(null); }} onRespond={(findingId) => void createResponsePreview(findingId)} responseBusy={responseBusy} responseError={responseError} isFa={isFa} locale={locale} /> : null}
      </div>

      <footer className="attacker-coverage"><Database /><span>{isFa ? "پوشش داده" : "Data coverage"}</span><strong>{(data?.coverage.findingsScanned ?? 0).toLocaleString(locale)} {isFa ? "یافته" : "findings"} · {(data?.coverage.eventsScanned ?? 0).toLocaleString(locale)} {isFa ? "رویداد" : "events"}</strong><small>{isFa ? "منبع: تله‌متری محلی وندورها؛ Geo/ASN خارجی تنظیم نشده" : "Source: local vendor telemetry; external Geo/ASN is not configured"}</small></footer>
    </section>
  );
}
