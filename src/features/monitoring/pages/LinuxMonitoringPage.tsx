import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, Cpu, Database, Gauge, HardDrive, LoaderCircle, MemoryStick, Network, RefreshCw, Search, Server, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { getLinuxMonitoringMetrics, getLinuxMonitoringSummary, refreshLinuxMonitoringDevice, type LinuxHealthSnapshot, type LinuxMetricSample, type LinuxMonitoringDevice, type LinuxSummary } from "@/lib/linuxMonitoring";
import "./LinuxMonitoringPage.css";

type Tone = "good" | "warning" | "danger" | "neutral";
type SnapshotMetric = { metricKey?: unknown; value?: unknown };

const STATE_FA: Record<string, string> = {
  healthy: "سالم", warning: "نیازمند توجه", critical: "بحرانی", offline: "آفلاین",
  stale: "داده قدیمی", unknown: "بدون داده", online: "آنلاین", error: "خطای اتصال",
};
const FILTERS = [
  { key: "all", label: "همه" }, { key: "attention", label: "نیازمند توجه" },
  { key: "healthy", label: "سالم" }, { key: "offline", label: "آفلاین" },
] as const;
const EMPTY_DEVICES: LinuxMonitoringDevice[] = [];

function number(value: number) { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value); }
function formatDate(value?: string | null) {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "ثبت نشده" : new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function relativeDate(value?: string | null) {
  if (!value) return "بدون جمع‌آوری";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "زمان نامشخص";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${number(minutes)} دقیقه پیش`;
  if (minutes < 1440) return `${number(Math.floor(minutes / 60))} ساعت پیش`;
  return `${number(Math.floor(minutes / 1440))} روز پیش`;
}
function toneFor(state?: string | null): Tone {
  if (state === "healthy" || state === "online") return "good";
  if (state === "warning" || state === "stale") return "warning";
  if (state === "critical" || state === "offline" || state === "error") return "danger";
  return "neutral";
}
function colorFor(state?: string | null) {
  if (state === "healthy") return "#34d399";
  if (state === "warning") return "#fbbf24";
  if (state === "critical" || state === "offline" || state === "error") return "#fb7185";
  if (state === "stale") return "#a78bfa";
  return "#64748b";
}
function snapshotMetrics(snapshot: LinuxHealthSnapshot | null) {
  return Array.isArray(snapshot?.metricsJson) ? snapshot.metricsJson.filter((item): item is SnapshotMetric => Boolean(item) && typeof item === "object") : [];
}
function metricValue(snapshot: LinuxHealthSnapshot | null, key: string) {
  const value = Number(snapshotMetrics(snapshot).find((item) => item.metricKey === key)?.value);
  return Number.isFinite(value) ? value : null;
}
function warnings(snapshot: LinuxHealthSnapshot | null) {
  return Array.isArray(snapshot?.warningsJson) ? snapshot.warningsJson.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
function effectiveState(device: LinuxMonitoringDevice) {
  return device.healthState ?? device.latestHealth?.state ?? (/offline|failed|disconnected/i.test(device.status) ? "offline" : "unknown");
}
function isAttention(device: LinuxMonitoringDevice) { return ["warning", "critical", "offline", "stale", "unknown"].includes(effectiveState(device)); }
function matchesFilter(device: LinuxMonitoringDevice, filter: string) {
  const state = effectiveState(device);
  if (filter === "attention") return isAttention(device);
  if (filter === "offline") return state === "offline";
  if (filter === "healthy") return state === "healthy";
  return true;
}

function Ring({ device }: { device: LinuxMonitoringDevice }) {
  const state = effectiveState(device);
  const score = device.latestHealth ? Math.max(0, Math.min(100, device.latestHealth.score)) : null;
  const radius = 42, circumference = 2 * Math.PI * radius;
  return <div className="linux-monitor-ring" role="img" aria-label={`امتیاز سلامت ${score === null ? "نامشخص" : number(score)}`}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="linux-monitor-ring__track" cx="50" cy="50" r={radius} />{score !== null ? <circle className="linux-monitor-ring__value" cx="50" cy="50" r={radius} stroke={colorFor(state)} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} /> : null}</svg>
    <span><strong>{score === null ? "—" : number(score)}</strong><small>سلامت</small></span>
  </div>;
}

function ResourceValue({ icon, label, value, color }: { icon: ReactNode; label: string; value: number | null; color: string }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="linux-resource-value" style={{ "--resource-color": color } as CSSProperties}>
    <span>{icon}{label}</span><strong>{value === null ? "—" : `${number(value)}٪`}</strong><i><b style={{ width: `${safe}%` }} /></i>
  </div>;
}

function FleetCard({ device, working, onRefresh }: { device: LinuxMonitoringDevice; working: boolean; onRefresh: (id: string) => void }) {
  const snapshot = device.latestHealth, state = effectiveState(device);
  return <article className={`linux-fleet-card is-${toneFor(state)}`}>
    <header><div className="linux-fleet-card__identity"><span><Server aria-hidden="true" /></span><div><Link to={`/monitoring/linux/${device.id}`}>{device.name}</Link><code dir="ltr">{device.host}</code></div></div><span className={`linux-state is-${toneFor(state)}`}>{STATE_FA[state] ?? state}</span></header>
    <div className="linux-fleet-card__body"><Ring device={device} /><div className="linux-fleet-card__resources">
      <ResourceValue icon={<Cpu aria-hidden="true" />} label="CPU" value={metricValue(snapshot, "cpu.usage_percent")} color="#22d3ee" />
      <ResourceValue icon={<MemoryStick aria-hidden="true" />} label="RAM" value={metricValue(snapshot, "memory.usage_percent")} color="#a78bfa" />
      <ResourceValue icon={<HardDrive aria-hidden="true" />} label="Disk" value={metricValue(snapshot, "disk.usage_percent")} color="#f59e0b" />
    </div></div>
    <footer><span><Clock3 aria-hidden="true" />{relativeDate(snapshot?.collectedAt)}</span><div><button type="button" disabled={working} onClick={() => onRefresh(device.id)} aria-label={`به‌روزرسانی ${device.name}`}>{working ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}</button><Link to={`/monitoring/linux/${device.id}`}>جزئیات<ArrowRight aria-hidden="true" /></Link></div></footer>
  </article>;
}

function SummaryCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: number; detail: string; tone: Tone }) {
  return <article className={`linux-summary-card is-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{number(value)}</strong><p>{detail}</p></div></article>;
}

function TrendChart({ title, color, samples, empty }: { title: string; color: string; samples: LinuxMetricSample[]; empty: string }) {
  const ordered = [...samples].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const values = ordered.map((item) => Math.max(0, Math.min(100, item.value)));
  const points = values.map((value, index) => `${values.length === 1 ? 50 : index * (100 / (values.length - 1))},${92 - value * .78}`).join(" ");
  const latest = ordered.at(-1)?.value ?? null;
  return <article className="linux-trend-card" style={{ "--trend-color": color } as CSSProperties}>
    <header><span>{title}</span><strong>{latest === null ? "—" : `${number(latest)}٪`}</strong></header>
    {values.length ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`روند ${title} در ۲۴ ساعت`}><polygon points={`0,100 ${points} 100,100`} fill={color} opacity=".08" /><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg> : <div className="linux-trend-card__empty">{empty}</div>}
    <footer><span>۲۴ ساعت گذشته</span><span>{number(values.length)} نمونه</span></footer>
  </article>;
}

function OperationalMetric({ icon, title, value, detail, tone = "neutral" }: { icon: ReactNode; title: string; value: string; detail: string; tone?: Tone }) {
  return <article className={`linux-operation-card is-${tone}`}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

export default function LinuxMonitoringPage({ params }: { params?: Record<string, string> }) {
  const [summary, setSummary] = useState<LinuxSummary | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set()), [refreshingAll, setRefreshingAll] = useState(false);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [history, setHistory] = useState<LinuxMetricSample[]>([]), [historyLoading, setHistoryLoading] = useState(false);
  const selectedId = params?.deviceId, devices = summary?.devices ?? EMPTY_DEVICES, selected = devices.find((device) => device.id === selectedId) ?? null;

  const load = useCallback(async () => {
    try { setSummary(await getLinuxMonitoringSummary()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "دریافت اطلاعات پایش انجام نشد."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedId) { setHistory([]); return; }
    let active = true; setHistoryLoading(true);
    getLinuxMonitoringMetrics(selectedId, 24).then((result) => { if (active) setHistory(result.metrics); }).catch(() => { if (active) setHistory([]); }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const token = search.trim().toLocaleLowerCase("fa");
    return devices.filter((device) => matchesFilter(device, filter) && (!token || `${device.name} ${device.host} ${device.asset?.site?.name ?? ""}`.toLocaleLowerCase("fa").includes(token))).sort((a, b) => Number(isAttention(b)) - Number(isAttention(a)));
  }, [devices, filter, search]);

  async function refresh(id: string) {
    setWorkingIds((current) => new Set(current).add(id)); setError(null);
    try { await refreshLinuxMonitoringDevice(id); await load(); if (id === selectedId) setHistory((await getLinuxMonitoringMetrics(id, 24)).metrics); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "جمع‌آوری سلامت انجام نشد."); }
    finally { setWorkingIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  }
  async function refreshAll() {
    setRefreshingAll(true); setError(null);
    const results = await Promise.allSettled(devices.map((device) => refreshLinuxMonitoringDevice(device.id)));
    await load();
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) setError(`جمع‌آوری ${number(failed)} سرور انجام نشد؛ داده قبلی حفظ شده است.`);
    setRefreshingAll(false);
  }

  if (loading) return <section className="linux-monitor-loading"><LoaderCircle aria-hidden="true" />در حال دریافت پایش سرورها…</section>;
  const attention = (summary?.warning ?? 0) + (summary?.critical ?? 0) + (summary?.offline ?? 0) + (summary?.stale ?? 0) + (summary?.unknown ?? 0);
  const fresh = (summary?.healthy ?? 0) + (summary?.warning ?? 0) + (summary?.critical ?? 0);
  const selectedSnapshot = selected?.latestHealth ?? null, selectedWarnings = warnings(selectedSnapshot), selectedState = selected ? effectiveState(selected) : "unknown";
  const selectedFirewall = metricValue(selectedSnapshot, "firewall.enabled");
  const trend = (key: string) => history.filter((sample) => sample.metricKey === key);

  return <section className="linux-monitor-page" dir="rtl">
    <header className="linux-monitor-header"><div><span><Activity aria-hidden="true" />پایش تخصصی Linux</span><h1>سلامت سرورها</h1><p>وضعیت ناوگان، مصرف منابع و هشدارهای واقعی در یک نمای قابل اقدام</p></div><div><Link to="/monitoring"><ArrowRight aria-hidden="true" />همه وندورها</Link><button type="button" disabled={refreshingAll || !devices.length} onClick={() => void refreshAll()}>{refreshingAll ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}به‌روزرسانی همه</button></div></header>
    {error ? <div className="linux-monitor-alert is-error"><AlertTriangle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => void load()}>تلاش دوباره</button></div> : null}
    {summary?.observability?.state === "not_configured" ? <div className="linux-monitor-alert"><Database aria-hidden="true" /><span>ذخیره تاریخچه پایش آماده نیست؛ فقط وضعیت ثبت‌شده دستگاه‌ها نمایش داده می‌شود.</span></div> : null}

    <section className="linux-summary-grid" aria-label="خلاصه ناوگان Linux">
      <SummaryCard icon={<Server aria-hidden="true" />} label="کل سرورها" value={summary?.total ?? 0} detail="دستگاه ثبت‌شده" tone="neutral" />
      <SummaryCard icon={<CheckCircle2 aria-hidden="true" />} label="سالم" value={summary?.healthy ?? 0} detail="بدون هشدار فعال" tone="good" />
      <SummaryCard icon={<AlertTriangle aria-hidden="true" />} label="نیازمند توجه" value={attention} detail="هشدار، قدیمی یا آفلاین" tone={attention ? "warning" : "good"} />
      <SummaryCard icon={<Clock3 aria-hidden="true" />} label="داده تازه" value={fresh} detail="Snapshot قابل استفاده" tone={fresh === (summary?.total ?? 0) ? "good" : "neutral"} />
    </section>

    {selected ? <section className={`linux-device-detail is-${toneFor(selectedState)}`}>
      <header><div className="linux-device-detail__title"><span><Server aria-hidden="true" /></span><div><small>جزئیات دستگاه</small><h2>{selected.name}</h2><code dir="ltr">{selected.host}</code></div></div><div><span className={`linux-state is-${toneFor(selectedState)}`}>{STATE_FA[selectedState] ?? selectedState}</span><Link to="/monitoring/linux">بستن جزئیات</Link><button type="button" disabled={workingIds.has(selected.id)} onClick={() => void refresh(selected.id)}>{workingIds.has(selected.id) ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}جمع‌آوری جدید</button></div></header>
      <div className="linux-device-overview"><Ring device={selected} /><div className="linux-device-resources">
        <ResourceValue icon={<Cpu aria-hidden="true" />} label="CPU" value={metricValue(selectedSnapshot, "cpu.usage_percent")} color="#22d3ee" /><ResourceValue icon={<MemoryStick aria-hidden="true" />} label="RAM" value={metricValue(selectedSnapshot, "memory.usage_percent")} color="#a78bfa" /><ResourceValue icon={<HardDrive aria-hidden="true" />} label="Disk" value={metricValue(selectedSnapshot, "disk.usage_percent")} color="#f59e0b" /><ResourceValue icon={<Gauge aria-hidden="true" />} label="Swap" value={metricValue(selectedSnapshot, "swap.usage_percent")} color="#60a5fa" />
      </div><dl className="linux-device-facts"><div><dt>اتصال</dt><dd>{STATE_FA[selected.status] ?? selected.status}</dd></div><div><dt>سایت</dt><dd>{selected.asset?.site?.name ?? "ثبت نشده"}</dd></div><div><dt>آخرین جمع‌آوری</dt><dd>{formatDate(selectedSnapshot?.collectedAt)}</dd></div><div><dt>خلاصه</dt><dd>{selectedSnapshot?.summary ?? "هنوز نتیجه‌ای ثبت نشده است."}</dd></div></dl></div>
      <section className="linux-operation-grid" aria-label="شاخص‌های عملیاتی">
        <OperationalMetric icon={<AlertTriangle aria-hidden="true" />} title="سرویس‌های ناموفق" value={number(metricValue(selectedSnapshot, "services.failed_count") ?? 0)} detail="failed systemd units" tone={(metricValue(selectedSnapshot, "services.failed_count") ?? 0) > 0 ? "warning" : "good"} />
        <OperationalMetric icon={<Network aria-hidden="true" />} title="پورت‌های شنونده" value={number(metricValue(selectedSnapshot, "ports.listening_count") ?? 0)} detail="پورت مشاهده‌شده" />
        <OperationalMetric icon={<ShieldCheck aria-hidden="true" />} title="فایروال میزبان" value={selectedFirewall === 1 ? "فعال" : selectedFirewall === 0 ? "غیرفعال" : "نامشخص"} detail="UFW یا Firewalld" tone={selectedFirewall === 1 ? "good" : selectedFirewall === 0 ? "warning" : "neutral"} />
        <OperationalMetric icon={selected.status === "online" ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />} title="وضعیت اتصال" value={STATE_FA[selected.status] ?? selected.status} detail={relativeDate(selectedSnapshot?.collectedAt)} tone={toneFor(selected.status)} />
      </section>
      <section className="linux-trends"><header><div><small>روند منابع</small><h3>۲۴ ساعت گذشته</h3></div>{historyLoading ? <span><LoaderCircle className="is-spinning" aria-hidden="true" />در حال دریافت نمونه‌ها</span> : <span>{number(history.length)} نمونه واقعی</span>}</header><div><TrendChart title="CPU" color="#22d3ee" samples={trend("cpu.usage_percent")} empty="هنوز نمونه CPU ثبت نشده" /><TrendChart title="RAM" color="#a78bfa" samples={trend("memory.usage_percent")} empty="هنوز نمونه RAM ثبت نشده" /><TrendChart title="Disk" color="#f59e0b" samples={trend("disk.usage_percent")} empty="هنوز نمونه Disk ثبت نشده" /></div></section>
      {selectedWarnings.length ? <section className="linux-warning-list"><header><AlertTriangle aria-hidden="true" /><div><h3>هشدارهای آخرین جمع‌آوری</h3><p>{number(selectedWarnings.length)} مورد نیازمند بازبینی</p></div></header><ul>{selectedWarnings.slice(0, 8).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section> : <div className="linux-all-clear"><CheckCircle2 aria-hidden="true" /><span><strong>هشدار ثبت‌شده‌ای وجود ندارد</strong><small>بر اساس آخرین جمع‌آوری واقعی این دستگاه</small></span></div>}
    </section> : null}

    <section className="linux-fleet-section"><header><div><small>ناوگان</small><h2>سرورهای Linux</h2><p>موارد نیازمند توجه ابتدا نمایش داده می‌شوند.</p></div><span>{number(filtered.length)} از {number(devices.length)} دستگاه</span></header>
      <div className="linux-fleet-toolbar"><label><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی نام، IP یا سایت" /></label><div role="group" aria-label="فیلتر وضعیت">{FILTERS.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div></div>
      {!devices.length ? <div className="linux-monitor-empty"><Server aria-hidden="true" /><h3>سرور Linux ثبت نشده است</h3><p>ابتدا یک دستگاه Linux با Credential معتبر ثبت کنید.</p><Link to="/assets/onboarding">ثبت دستگاه</Link></div> : !filtered.length ? <div className="linux-monitor-empty"><Search aria-hidden="true" /><h3>نتیجه‌ای پیدا نشد</h3><p>عبارت جست‌وجو یا فیلتر وضعیت را تغییر دهید.</p><button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>پاک کردن فیلتر</button></div> : <div className="linux-fleet-grid">{filtered.map((device) => <FleetCard key={device.id} device={device} working={workingIds.has(device.id)} onRefresh={(id) => void refresh(id)} />)}</div>}
    </section>
  </section>;
}
