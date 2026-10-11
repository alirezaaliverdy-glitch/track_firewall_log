import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, EthernetPort, History, LoaderCircle, Network, Radar, Router, Search, Trash2, WifiOff } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Device } from "@/lib/devices";
import { clearNetworkInventoryScans, listNetworkInventoryScans, runNetworkInventoryScan, type NetworkInventoryHost, type NetworkInventoryScan } from "@/lib/diagnostics";
import "./NetworkInventoryScanner.css";

type Props = { devices: Device[] };
type HostFilter = "all" | "online" | "mac" | "ports";

const commonPorts = [22, 53, 80, 443, 445, 3389, 8291, 8443];
const fa = (value: number) => value.toLocaleString("fa-IR");
const time = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value)} ms`;
const stateLabel: Record<NetworkInventoryHost["state"], string> = { up: "پاسخ‌گو", vendor_seen: "دیده‌شده توسط وندور", down: "بدون پاسخ" };
const confidenceLabel: Record<NetworkInventoryHost["confidence"], string> = { high: "اطمینان بالا", medium: "اطمینان متوسط", low: "اطمینان محدود" };

function suggestedCidr(host: string) {
  const match = host.match(/^(10|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2}$/);
  if (!match) return "";
  const octets = host.split(".");
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function errorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "";
  const code = message.match(/(DEVICE_NOT_FOUND|SCAN_CIDR_INVALID|SCAN_RANGE_TOO_LARGE|SCAN_PRIVATE_RANGE_REQUIRED|SCAN_PORTS_INVALID)/)?.[1];
  return ({
    DEVICE_NOT_FOUND: "تجهیز انتخاب‌شده در فضای کاری شما پیدا نشد.",
    SCAN_CIDR_INVALID: "بازه را به‌شکل CIDR معتبر مانند 192.168.1.0/24 وارد کنید.",
    SCAN_RANGE_TOO_LARGE: "برای جلوگیری از اسکن ناخواسته، هر اجرا حداکثر یک بازهٔ /24 یا کوچک‌تر را می‌پذیرد.",
    SCAN_PRIVATE_RANGE_REQUIRED: "اسکن این تب فقط برای شبکه‌های خصوصی 10.x، 172.16–31.x و 192.168.x فعال است.",
    SCAN_PORTS_INVALID: "بین ۱ تا ۲۴ پورت معتبر وارد کنید."
  } as Record<string, string>)[code ?? ""] ?? message ?? "اجرای اسکن ناموفق بود.";
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(scan: NetworkInventoryScan) {
  const rows = [
    ["IP", "MAC", "Hostname", "State", "Latency", "Manufacturer", "Device hint", "Open ports", "Interface", "VLAN", "Confidence", "Evidence"],
    ...scan.hosts.map((host) => [host.ip, host.mac, host.hostname, stateLabel[host.state], host.latencyMs, host.manufacturer, host.deviceHint, host.ports.map((item) => `${item.port}/${item.service ?? "tcp"}`).join(";"), host.interfaceName, host.vlan, confidenceLabel[host.confidence], host.evidence.join(";")])
  ];
  const blob = new Blob(["\ufeff", rows.map((row) => row.map(csvValue).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `network-scan-${scan.cidr?.replace("/", "-") ?? "vendor-known"}-${new Date(scan.createdAt).toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function HostDetails({ host }: { host: NetworkInventoryHost }) {
  return <div className="network-scanner__host-detail">
    <div><span>تشخیص احتمالی</span><b>{host.deviceHint ?? "نامشخص"}</b></div>
    <div><span>سازندهٔ MAC</span><b>{host.manufacturer ?? "در شواهد موجود نیست"}</b></div>
    <div><span>محل اتصال</span><b>{host.interfaceName ?? "—"}{host.vlan ? ` · VLAN ${host.vlan}` : ""}</b></div>
    <div><span>منبع شواهد</span><b dir="ltr">{host.evidence.join(" · ") || "active scan: no reply"}</b></div>
    <div className="wide"><span>سرویس‌های باز</span><b>{host.ports.length ? host.ports.map((port) => `${port.port}/${port.service ?? "tcp"}${port.product ? ` · ${port.product}${port.version ? ` ${port.version}` : ""}` : ""}`).join(" | ") : "پورت بازی در پروفایل انتخابی مشاهده نشد"}</b></div>
  </div>;
}

export function NetworkInventoryScanner({ devices }: Props) {
  const [deviceId, setDeviceId] = useState("");
  const [mode, setMode] = useState<"vendor" | "range">("vendor");
  const [cidr, setCidr] = useState("");
  const [profile, setProfile] = useState<"discovery" | "deep">("discovery");
  const [portsText, setPortsText] = useState(commonPorts.join(","));
  const [history, setHistory] = useState<NetworkInventoryScan[]>([]);
  const [active, setActive] = useState<NetworkInventoryScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HostFilter>("online");
  const [expanded, setExpanded] = useState<string | null>(null);
  const selected = useMemo(() => devices.find((device) => device.id === deviceId) ?? null, [deviceId, devices]);

  useEffect(() => {
    void listNetworkInventoryScans().then(({ scans }) => { setHistory(scans); setActive(scans[0] ?? null); }).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!deviceId && devices[0]) setDeviceId(devices[0].id);
  }, [devices, deviceId]);

  useEffect(() => {
    if (selected && !cidr) setCidr(suggestedCidr(selected.host));
  }, [selected, cidr]);

  const hosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (active?.hosts ?? []).filter((host) => {
      if (filter === "online" && host.state === "down") return false;
      if (filter === "mac" && !host.mac) return false;
      if (filter === "ports" && host.ports.length === 0) return false;
      if (!needle) return true;
      return [host.ip, host.mac, host.hostname, host.manufacturer, host.deviceHint, host.interfaceName, host.vlan, ...host.ports.map((port) => `${port.port} ${port.service} ${port.product}`)].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [active, filter, query]);

  const run = async () => {
    const ports = portsText.split(/[\s,،]+/).map(Number).filter(Number.isFinite);
    setBusy(true); setError(""); setExpanded(null);
    try {
      const { scan } = await runNetworkInventoryScan({ deviceId, mode, ...(mode === "range" ? { cidr } : {}), profile, ports });
      setActive(scan);
      setHistory((items) => [scan, ...items.filter((item) => item.id !== scan.id)].slice(0, 12));
      setFilter("online");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setClearing(true); setError("");
    try { await clearNetworkInventoryScans(); setHistory([]); setActive(null); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setClearing(false); }
  };

  return <div className="network-scanner">
    <section className="network-scanner__hero">
      <div className="network-scanner__hero-icon"><Radar/></div>
      <div><h2>اسکن شبکه</h2><p>IP، MAC و نام دستگاه‌های شناخته‌شده توسط تجهیز</p></div>
    </section>

    <section className="network-scanner__setup">
      <div className="network-scanner__scope" aria-label="روش کشف شبکه">
        <button type="button" className={mode === "vendor" ? "active" : ""} onClick={() => setMode("vendor")}><Router/><span><b>کشف خودکار از وندور</b><small>بدون نیاز به نوشتن بازه؛ ARP، MAC، DHCP و DNS</small></span><em>پیشنهادی</em></button>
        <button type="button" className={mode === "range" ? "active" : ""} onClick={() => setMode("range")}><Radar/><span><b>اسکن بازهٔ دلخواه</b><small>برای بررسی کامل یک CIDR خصوصی مشخص</small></span></button>
      </div>
      <div className="network-scanner__field network-scanner__field--device"><label htmlFor="scanner-device">تجهیز مرجع</label><select id="scanner-device" value={deviceId} onChange={(event) => { const next = devices.find((item) => item.id === event.target.value); setDeviceId(event.target.value); setCidr(next ? suggestedCidr(next.host) : ""); }}><option value="">انتخاب تجهیز</option>{devices.map((device) => <option value={device.id} key={device.id}>{device.name} · {device.vendor} · {device.host}</option>)}</select>{selected && <small>{selected.company?.name ?? "بدون شرکت"} · اتصال {selected.protocol.toUpperCase()} · وضعیت {selected.status}</small>}</div>
      {mode === "range" ? <div className="network-scanner__field"><label htmlFor="scanner-cidr">بازهٔ خصوصی CIDR</label><input id="scanner-cidr" dir="ltr" value={cidr} onChange={(event) => setCidr(event.target.value)} placeholder="192.168.1.0/24"/><small>نمونه: 10.20.30.0/24</small></div> : <div className="network-scanner__auto-note"><Router/><span><b>بازه لازم نیست</b><small>برنامه فهرست شناخته‌شدهٔ خود تجهیز را مستقیماً جمع‌آوری می‌کند.</small></span></div>}
      <div className="network-scanner__profiles" aria-label="عمق اسکن"><button type="button" className={profile === "discovery" ? "active" : ""} onClick={() => setProfile("discovery")}><Radar/><span><b>کشف سریع</b><small>IP، MAC و hostname</small></span></button><button type="button" className={profile === "deep" ? "active" : ""} onClick={() => setProfile("deep")}><EthernetPort/><span><b>اسکن کامل</b><small>به‌همراه سرویس و نسخه</small></span></button></div>
      {profile === "deep" && <div className="network-scanner__field network-scanner__field--ports"><label htmlFor="scanner-ports">پورت‌های هدف؛ حداکثر ۲۴ مورد</label><input id="scanner-ports" dir="ltr" value={portsText} onChange={(event) => setPortsText(event.target.value)} /><div className="network-scanner__port-chips">{commonPorts.map((port) => <button type="button" key={port} onClick={() => { const current = new Set(portsText.split(/[\s,،]+/).map(Number).filter(Number.isFinite)); current.has(port) ? current.delete(port) : current.add(port); setPortsText([...current].sort((a, b) => a - b).join(",")); }} className={portsText.split(/[\s,،]+/).map(Number).includes(port) ? "active" : ""}>{port}</button>)}</div></div>}
      <button type="button" className="network-scanner__run" disabled={busy || !deviceId || (mode === "range" && !cidr.trim())} onClick={() => void run()}>{busy ? <LoaderCircle className="is-spin"/> : mode === "vendor" ? <Router/> : <Radar/>}<span><b>{busy ? "در حال جمع‌آوری و شناسایی…" : mode === "vendor" ? "دریافت تمام دارایی‌های شناخته‌شده" : "شروع اسکن شبکه"}</b><small>{busy ? "ARP، MAC، DHCP، DNS و پاسخ فعال در حال بررسی است" : "خواندن فقط‌خواندنی وندور + تکمیل hostname + ثبت Audit"}</small></span></button>
    </section>

    {error && <div className="network-scanner__error"><AlertTriangle/><span>{error}</span></div>}
    {loading ? <div className="network-scanner__loading"><LoaderCircle className="is-spin"/>در حال دریافت تاریخچه…</div> : active ? <>
      <section className="network-scanner__summary">
        <article><span>پاسخ‌گو</span><b>{fa(active.summary.up)}</b><small>از {fa(active.summary.addressCount)} آدرس</small></article>
        <article><span>دیده‌شده توسط وندور</span><b>{fa(active.summary.vendorSeen)}</b><small>حتی بدون پاسخ Ping</small></article>
        <article><span>MAC شناسایی‌شده</span><b>{fa(active.summary.macKnown)}</b><small>از ARP/MAC یا لایهٔ ۲</small></article>
        <article><span>Hostname شناسایی‌شده</span><b>{fa(active.summary.hostnameKnown)}</b><small>DHCP، DNS، PTR یا Nmap</small></article>
        <article><span>پورت باز</span><b>{fa(active.summary.openPorts)}</b><small>{active.profile === "deep" ? "اسکن سرویس فعال" : "پروفایل سریع"}</small></article>
        <article><span>زمان اجرا</span><b>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(active.durationMs / 1000)}s</b><small>{new Date(active.createdAt).toLocaleString("fa-IR")}</small></article>
      </section>

      <section className="network-scanner__coverage">
        <div className={active.coverage.activeProbe === "available" ? "ok" : "warn"}>{active.coverage.activeProbe === "available" ? <CheckCircle2/> : <AlertTriangle/>}<span><b>کشف فعال</b>{active.coverage.activeProbe === "available" ? "Nmap اجرا شد" : active.coverage.activeProbe === "skipped" ? "IP خصوصی برای بررسی نبود" : "در دسترس نبود"}</span></div>
        <div className={active.coverage.vendorNeighbors === "available" ? "ok" : "warn"}>{active.coverage.vendorNeighbors === "available" ? <CheckCircle2/> : <AlertTriangle/>}<span><b>شواهد وندور</b>{({ available: "ARP/MAC دریافت شد", partial: "جدول خالی یا ناقص", unsupported: "Connector پشتیبانی نمی‌کند", failed: "خواندن ناموفق" } as const)[active.coverage.vendorNeighbors]}</span></div>
        <div className={active.summary.hostnameKnown > 0 ? "ok" : "warn"}>{active.summary.hostnameKnown > 0 ? <CheckCircle2/> : <AlertTriangle/>}<span><b>شناسایی Hostname</b>{active.summary.hostnameKnown > 0 ? `${fa(active.summary.hostnameKnown)} نام واقعی پیدا شد` : "رکورد DHCP/DNS/PTR موجود نبود"}</span></div>
        <p>{active.coverage.macScope}</p>
        {active.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      </section>

      <section className="network-scanner__results">
        <header><div><Network/><span><h3>{(active.mode ?? (active.cidr ? "range" : "vendor")) === "vendor" ? "دارایی‌های شناخته‌شده توسط وندور" : <>دستگاه‌های بازهٔ <bdi dir="ltr">{active.cidr}</bdi></>}</h3><small>{fa(hosts.length)} نتیجه با فیلتر فعلی</small></span></div><button type="button" onClick={() => exportCsv(active)}><Download/>خروجی CSV</button></header>
        <div className="network-scanner__toolbar"><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی IP، MAC، hostname، سرویس یا اینترفیس"/></label><div>{([['online','فعال و دیده‌شده'],['all','همه'],['mac','دارای MAC'],['ports','پورت باز']] as Array<[HostFilter,string]>).map(([value, label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
        <div className="network-scanner__table-wrap"><table><thead><tr><th>وضعیت</th><th>IP / زمان پاسخ</th><th>MAC / سازنده</th><th>Hostname / نوع احتمالی</th><th>پورت و سرویس</th><th>اینترفیس / VLAN</th><th>اطمینان</th><th aria-label="جزئیات"/></tr></thead><tbody>{hosts.map((host) => <Fragment key={host.key}>
          <tr key={host.key} className={`network-scanner__row is-${host.state}`} onClick={() => setExpanded(expanded === host.key ? null : host.key)}><td><span className={`network-scanner__state is-${host.state}`}><i/>{stateLabel[host.state]}</span></td><td dir="ltr"><b>{host.ip ?? "—"}</b><small>{time(host.latencyMs)}</small></td><td dir="ltr"><b>{host.mac ?? "—"}</b><small>{host.manufacturer ?? "سازنده نامشخص"}</small></td><td><b>{host.hostname ?? "بدون hostname"}</b><small>{host.deviceHint ?? "نوع نامشخص"}</small></td><td dir="ltr"><b>{host.ports.length ? host.ports.map((item) => item.port).join(", ") : "—"}</b><small>{host.web ?? (host.ports.map((item) => item.service).filter(Boolean).join(", ") || "سرویس مشاهده نشد")}</small></td><td><b>{host.interfaceName ?? "—"}</b><small>{host.vlan ? `VLAN ${host.vlan}` : "VLAN نامشخص"}</small></td><td><span className={`network-scanner__confidence is-${host.confidence}`}>{confidenceLabel[host.confidence]}</span></td><td>{expanded === host.key ? <ChevronUp/> : <ChevronDown/>}</td></tr>
          {expanded === host.key && <tr key={`${host.key}-detail`} className="network-scanner__detail-row"><td colSpan={8}><HostDetails host={host}/></td></tr>}
        </Fragment>)}</tbody></table>{!hosts.length && <div className="network-scanner__empty"><WifiOff/><span>نتیجه‌ای با این فیلتر پیدا نشد.</span></div>}</div>
        <div className="network-scanner__mobile-list">{hosts.map((host) => <article className={`is-${host.state}`} key={host.key}><button type="button" onClick={() => setExpanded(expanded === host.key ? null : host.key)}><span className={`network-scanner__state is-${host.state}`}><i/>{stateLabel[host.state]}</span>{expanded === host.key ? <ChevronUp/> : <ChevronDown/>}<strong dir="ltr">{host.ip ?? host.mac ?? "—"}</strong><small dir="ltr">{host.mac ?? "MAC نامشخص"}</small><div><span>{host.hostname ?? host.deviceHint ?? "دستگاه ناشناس"}</span><em>{time(host.latencyMs)}</em></div><div><span>{host.ports.length ? `پورت: ${host.ports.map((item) => item.port).join(", ")}` : "پورت بازی مشاهده نشد"}</span><em>{host.interfaceName ?? "اینترفیس نامشخص"}</em></div></button>{expanded === host.key && <HostDetails host={host}/>}</article>)}</div>
      </section>
    </> : <section className="network-scanner__empty network-scanner__empty--initial"><Radar/><h3>برای شروع فقط یک تجهیز انتخاب کنید</h3><p>در حالت کشف خودکار، نوشتن بازه لازم نیست و همهٔ IP، MAC و hostnameهای قابل مشاهده برای وندور جمع‌آوری می‌شوند.</p></section>}

    <section className="network-scanner__history"><header><div><History/><span><h3>تاریخچهٔ اسکن‌ها</h3><small>{fa(history.length)} اجرای ثبت‌شده</small></span></div>{history.length > 0 && <button type="button" disabled={clearing} onClick={() => void clear()}><Trash2/>{clearing ? "در حال پاک‌کردن…" : "پاک‌کردن تاریخچه"}</button>}</header><div>{history.map((scan) => <button type="button" className={active?.id === scan.id ? "active" : ""} onClick={() => { setActive(scan); setExpanded(null); }} key={scan.id}><span className={`network-scanner__history-state is-${scan.state}`}/><span><b>{scan.device.name}</b><small dir="ltr">{scan.cidr ?? "Vendor inventory"}</small></span><em>{scan.profile === "deep" ? "کامل" : "سریع"}</em><strong>{fa(scan.summary.up + scan.summary.vendorSeen)} دستگاه</strong><time><Clock3/>{new Date(scan.createdAt).toLocaleString("fa-IR")}</time></button>)}</div></section>
  </div>;
}
