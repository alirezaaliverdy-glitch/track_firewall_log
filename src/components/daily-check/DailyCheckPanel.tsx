import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ExternalLink, Gauge, History, LoaderCircle, Network, Play, Server, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { listActionCenter, type ActionCenterItem } from "@/lib/actionCenter";
import { reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { createCatalogAction } from "@/lib/commandCatalog";
import { getDailyCheckProfile, getDailyCheckProfiles, type DailyCheckReadiness, type VendorDailyCheckProfile } from "@/lib/dailyCheck";
import { listDevices, type Device } from "@/lib/devices";

const CORE_VENDORS = ["linux", "mikrotik", "fortigate", "cisco", "pfsense"] as const;
const VENDOR_LABELS: Record<string, string> = { linux: "Linux", mikrotik: "MikroTik", fortigate: "FortiGate", cisco: "Cisco", pfsense: "pfSense" };
const STATUS_COPY: Record<string, string> = {
  safe: "سالم", needs_review: "نیازمند توجه", critical: "بحرانی", not_checked: "بدون داده", not_supported: "دستی",
  succeeded: "موفق", failed: "ناموفق", executing: "در حال اجرا", ready_for_confirmation: "منتظر تأیید", confirmed: "تأیید شده",
  draft: "پیش‌نویس", needs_input: "نیازمند تکمیل", skipped: "اجرا نشده", cancelled: "لغو شده", online: "آنلاین", offline: "آفلاین", error: "خطای اتصال", unknown: "نامشخص",
};

type ResultSection = { key: string; status: string; summaryFa?: string };
type EssentialDomain = { id: string; title: string; description: string; keys: string[]; icon: "system" | "performance" | "network" | "security" };
type DomainView = EssentialDomain & { status: string; summary?: string };

const COMMON_DOMAINS: EssentialDomain[] = [
  { id: "system", title: "سلامت دستگاه", description: "دسترس‌پذیری، Uptime و وضعیت کلی", keys: ["overall", "system_health"], icon: "system" },
  { id: "performance", title: "کارایی", description: "CPU، حافظه، دیسک و ظرفیت نشست", keys: ["resources", "license"], icon: "performance" },
  { id: "network", title: "شبکه", description: "اینترفیس، مسیر، DNS و اتصال", keys: ["network", "interfaces", "route_dns"], icon: "network" },
  { id: "security", title: "امنیت", description: "مدیریت، فایروال، VPN و رخدادها", keys: ["services", "firewall", "vpn_ha", "logs", "next_actions", "policy_nat_vip", "vpn", "ha_vdom_zone", "admin_security"], icon: "security" },
];

const VENDOR_DOMAINS: Record<string, EssentialDomain[]> = {
  linux: [
    { ...COMMON_DOMAINS[0], keys: ["overall"] },
    { ...COMMON_DOMAINS[1], keys: ["resources"] },
    { ...COMMON_DOMAINS[2], title: "سرویس و شبکه", description: "سرویس‌های مهم، پورت‌ها و اینترفیس‌ها", keys: ["services", "network"] },
    { ...COMMON_DOMAINS[3], keys: ["firewall", "vpn_ha", "logs", "next_actions"] },
  ],
  mikrotik: [
    { ...COMMON_DOMAINS[0], keys: ["overall"] },
    { ...COMMON_DOMAINS[1], keys: ["resources"] },
    { ...COMMON_DOMAINS[2], keys: ["network"] },
    { ...COMMON_DOMAINS[3], title: "فایروال و VPN", description: "سرویس مدیریت، Ruleها، NAT، VPN و لاگ", keys: ["services", "firewall", "vpn_ha", "logs", "next_actions"] },
  ],
  fortigate: [
    { ...COMMON_DOMAINS[0], keys: ["system_health", "license"] },
    { ...COMMON_DOMAINS[1], title: "کارایی و نشست‌ها", keys: ["system_health"] },
    { ...COMMON_DOMAINS[2], keys: ["interfaces", "route_dns"] },
    { ...COMMON_DOMAINS[3], title: "Policy، VPN و HA", description: "Policy/NAT، مدیریت، تونل‌ها و افزونگی", keys: ["policy_nat_vip", "vpn", "ha_vdom_zone", "admin_security"] },
  ],
  cisco: COMMON_DOMAINS,
  pfsense: COMMON_DOMAINS,
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVendor(device?: Device | null) {
  if (!device) return "";
  const token = `${device.vendor} ${device.type}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (token.includes("linux") || token.includes("ubuntu")) return "linux";
  if (token.includes("mikrotik") || token.includes("routeros")) return "mikrotik";
  if (token.includes("forti")) return "fortigate";
  if (token.includes("pfsense")) return "pfsense";
  if (token.includes("cisco")) return "cisco";
  return "";
}

function commandIdForVendor(vendor: string) {
  return vendor === "linux" ? "linux.daily-check" : vendor === "mikrotik" ? "mikrotik.daily-check" : vendor === "fortigate" ? "fortigate.daily-check" : "";
}

function relativeDate(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ثبت نشده";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  if (minutes < 1440) return `${Math.floor(minutes / 60).toLocaleString("fa-IR")} ساعت پیش`;
  return date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function parsedSections(action?: ActionCenterItem | null) {
  if (!action?.evidence.connectorInvoked) return new Map<string, ResultSection>();
  const parsed = object(action.connectorResult.parsedResult);
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  return new Map(sections.map((item) => {
    const section = object(item);
    const key = String(section.key ?? "");
    return [key, { key, status: String(section.status ?? section.severity ?? "not_checked"), summaryFa: typeof section.summaryFa === "string" ? section.summaryFa : undefined }] as const;
  }).filter(([key]) => key));
}

function overallStatus(action?: ActionCenterItem | null) {
  if (!action?.evidence.connectorInvoked) return "not_checked";
  return String(object(action.connectorResult.parsedResult).overallStatus ?? "not_checked");
}

function aggregateStatus(results: ResultSection[]) {
  if (results.length === 0) return "not_checked";
  const states = results.map((item) => item.status);
  if (states.includes("critical")) return "critical";
  if (states.includes("needs_review")) return "needs_review";
  if (states.every((state) => state === "safe")) return "safe";
  return "not_checked";
}

function domainIcon(icon: EssentialDomain["icon"]): ReactNode {
  if (icon === "performance") return <Gauge aria-hidden="true" />;
  if (icon === "network") return <Network aria-hidden="true" />;
  if (icon === "security") return <ShieldCheck aria-hidden="true" />;
  return <Server aria-hidden="true" />;
}

const DOMAIN_COLORS = ["#22d3ee", "#a78bfa", "#60a5fa", "#fbbf24"];

function statusColor(status: string, index: number) {
  if (status === "safe") return "#34d399";
  if (status === "needs_review") return "#fbbf24";
  if (status === "critical") return "#fb7185";
  if (status === "failed") return "#f87171";
  return DOMAIN_COLORS[index] ?? "#64748b";
}

function HealthRing({ domains, label, detail }: { domains: DomainView[]; label: string; detail: string }) {
  const circumference = 2 * Math.PI * 48;
  const segment = circumference / 4 - 12;
  return <div className="monitoring-ring" role="img" aria-label={`${label}؛ ${detail}`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="monitoring-ring__track" cx="60" cy="60" r="48" />
      {domains.map((domain, index) => <circle key={domain.id} className="monitoring-ring__segment" data-measured={domain.status !== "not_checked" && domain.status !== "not_supported"} cx="60" cy="60" r="48" stroke={statusColor(domain.status, index)} strokeDasharray={`${segment} ${circumference - segment}`} strokeDashoffset={-(index * circumference / 4)} />)}
    </svg>
    <span><strong>{label}</strong><small>{detail}</small></span>
  </div>;
}

export default function DailyCheckPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [profiles, setProfiles] = useState<VendorDailyCheckProfile[]>([]);
  const [vendor, setVendor] = useState("linux");
  const [deviceId, setDeviceId] = useState("");
  const [resolvedProfile, setResolvedProfile] = useState<VendorDailyCheckProfile | null>(null);
  const [readiness, setReadiness] = useState<DailyCheckReadiness | null>(null);
  const [recentCheck, setRecentCheck] = useState<ActionCenterItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listDevices(), getDailyCheckProfiles()]).then(([deviceList, catalog]) => {
      if (!alive) return;
      const availableProfiles = catalog.profiles.filter((profile) => CORE_VENDORS.includes(profile.vendor as typeof CORE_VENDORS[number]));
      const remembered = sessionStorage.getItem("monitoringVendor");
      const firstDeviceVendor = deviceList.map(normalizeVendor).find((item) => availableProfiles.some((profile) => profile.vendor === item));
      const initialVendor = availableProfiles.some((profile) => profile.vendor === remembered) ? String(remembered) : firstDeviceVendor || "linux";
      setDevices(deviceList);
      setProfiles(availableProfiles);
      setVendor(initialVendor);
      setDeviceId(deviceList.find((device) => normalizeVendor(device) === initialVendor)?.id ?? "");
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "اطلاعات پایش دریافت نشد."))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setResolvedProfile(null);
    setReadiness(null);
    setRecentCheck(null);
    setMessage(null);
    if (!deviceId) return;
    let alive = true;
    setSyncing(true);
    Promise.allSettled([getDailyCheckProfile(deviceId), listActionCenter({ deviceId, limit: 30 })]).then(([profileResult, actionResult]) => {
      if (!alive) return;
      if (profileResult.status === "fulfilled") {
        setResolvedProfile(profileResult.value.profile);
        setReadiness(profileResult.value.readiness);
      } else setMessage("وضعیت اتصال دستگاه دریافت نشد.");
      if (actionResult.status === "fulfilled") setRecentCheck(actionResult.value.items.find((item) => item.actionType.endsWith("_daily_check")) ?? null);
    }).finally(() => { if (alive) setSyncing(false); });
    return () => { alive = false; };
  }, [deviceId]);

  const activeProfile = resolvedProfile ?? profiles.find((profile) => profile.vendor === vendor) ?? null;
  const vendorDevices = useMemo(() => devices.filter((device) => normalizeVendor(device) === vendor), [devices, vendor]);
  const selectedDevice = devices.find((device) => device.id === deviceId) ?? null;
  const sections = useMemo(() => parsedSections(recentCheck), [recentCheck]);
  const realResult = Boolean(recentCheck?.evidence.connectorInvoked && ["succeeded", "failed"].includes(recentCheck.lifecycleState));
  const implemented = activeProfile?.implementationState === "implemented";
  const definitions = VENDOR_DOMAINS[vendor] ?? COMMON_DOMAINS;
  const domains: DomainView[] = definitions.map((domain) => {
    const matches = domain.keys.map((key) => sections.get(key)).filter((item): item is ResultSection => Boolean(item));
    return { ...domain, status: !implemented ? "not_supported" : realResult ? aggregateStatus(matches) : "not_checked", summary: matches.find((item) => item.summaryFa)?.summaryFa };
  });
  const knownCount = domains.filter((domain) => ["safe", "needs_review", "critical"].includes(domain.status)).length;
  const resultState = realResult ? overallStatus(recentCheck) : implemented ? "not_checked" : "not_supported";
  const commandId = commandIdForVendor(vendor);
  const canCreate = Boolean(selectedDevice && implemented && commandId);

  function selectVendor(nextVendor: string) {
    sessionStorage.setItem("monitoringVendor", nextVendor);
    setVendor(nextVendor);
    setResolvedProfile(null);
    setDeviceId(devices.find((device) => normalizeVendor(device) === nextVendor)?.id ?? "");
  }

  async function createPlan() {
    if (!selectedDevice || !commandId) return;
    setBusy(true);
    setMessage(null);
    try {
      const plan = await createCatalogAction(commandId, selectedDevice.id, {});
      reviewInActionCenter(plan.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت بررسی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="monitoring-loading"><LoaderCircle aria-hidden="true" />در حال بارگذاری پایش…</section>;

  return <section className="monitoring-simple" dir="rtl">
    <header className="monitoring-simple__header">
      <div><span><Activity aria-hidden="true" />پایش</span><h1>وضعیت دستگاه</h1><p>چهار شاخص اصلی، بر پایه آخرین بررسی واقعی</p></div>
      <small><ShieldCheck aria-hidden="true" />نتیجه فقط از Connector</small>
    </header>

    <section className="monitoring-toolbar">
      <label><span>وندور</span><select value={vendor} onChange={(event) => selectVendor(event.target.value)}>{profiles.map((profile) => <option key={profile.vendor} value={profile.vendor}>{VENDOR_LABELS[profile.vendor] ?? profile.vendor}</option>)}</select></label>
      <label><span>دستگاه</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={!vendorDevices.length}>{vendorDevices.length ? vendorDevices.map((device) => <option key={device.id} value={device.id}>{device.name} — {device.host}</option>) : <option value="">دستگاهی ثبت نشده</option>}</select></label>
      <button type="button" disabled={!canCreate || busy} onClick={() => void createPlan()}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Play aria-hidden="true" />}{busy ? "در حال ساخت…" : "شروع بررسی"}</button>
    </section>

    {message ? <div className="monitoring-simple__message"><AlertTriangle aria-hidden="true" />{message}</div> : null}
    {!implemented ? <div className="monitoring-simple__note">پایش خودکار {VENDOR_LABELS[vendor]} هنوز آماده نیست؛ این وندور فقط به‌صورت راهنمای دستی نمایش داده می‌شود.</div> : null}

    <section className="monitoring-dashboard-simple">
      <article className="monitoring-health-card" data-state={resultState}>
        <header><span>{selectedDevice?.name ?? VENDOR_LABELS[vendor]}</span>{syncing ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : readiness?.connectionStatus === "online" ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}</header>
        <HealthRing domains={domains} label={STATUS_COPY[resultState] ?? resultState} detail={realResult ? `${knownCount.toLocaleString("fa-IR")} از ۴ بخش دارای داده` : implemented ? "هنوز بررسی اجرا نشده" : "پایش دستی"} />
        <dl><div><dt>اتصال</dt><dd>{STATUS_COPY[readiness?.connectionStatus ?? selectedDevice?.status ?? "unknown"] ?? "نامشخص"}</dd></div><div><dt>آخرین بررسی</dt><dd>{recentCheck ? relativeDate(recentCheck.updatedAt) : "ثبت نشده"}</dd></div></dl>
      </article>

      <section className="monitoring-essential-grid" aria-label="شاخص‌های اصلی پایش">
        {domains.map((domain) => <article key={domain.id} data-state={domain.status}>
          <span className="monitoring-essential-grid__icon">{domainIcon(domain.icon)}</span>
          <div><small>{STATUS_COPY[domain.status] ?? domain.status}</small><h2>{domain.title}</h2><p>{domain.summary ?? (realResult ? domain.description : "پس از اجرای بررسی نمایش داده می‌شود")}</p></div>
          {domain.status === "safe" ? <CheckCircle2 className="monitoring-essential-grid__status" aria-hidden="true" /> : domain.status === "critical" ? <AlertTriangle className="monitoring-essential-grid__status" aria-hidden="true" /> : null}
        </article>)}
      </section>
    </section>

    <footer className="monitoring-simple__footer">
      <div><History aria-hidden="true" /><span><small>آخرین برنامه</small><strong>{recentCheck ? STATUS_COPY[recentCheck.lifecycleState] ?? recentCheck.lifecycleState : "هنوز ساخته نشده"}</strong></span></div>
      <span className="monitoring-simple__footer-note"><Clock3 aria-hidden="true" />مبنای پایش: NIST، CIS و راهنمای وندور</span>
      <div className="monitoring-simple__actions">{recentCheck ? <button type="button" onClick={() => reviewInActionCenter(recentCheck.id)}>مشاهده نتیجه<ExternalLink aria-hidden="true" /></button> : null}{vendor === "linux" && selectedDevice ? <Link to={`/monitoring/linux/${selectedDevice.id}`}>جزئیات Linux<ExternalLink aria-hidden="true" /></Link> : null}</div>
    </footer>
  </section>;
}
