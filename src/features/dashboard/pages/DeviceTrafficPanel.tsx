import { useEffect, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Network, RefreshCw } from "lucide-react";
import { getDeviceTrafficOverview, type DeviceTraffic, type TrafficRank, type VolumeRank } from "@/lib/deviceTraffic";
import "./DeviceTrafficPanel.css";
import { DeviceNetflowSetup } from "./DeviceNetflowSetup";

function formatRate(value: number | null, isFa: boolean) {
  return value === null ? "—" : `${new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", { maximumFractionDigits: 2 }).format(value)} Mbps`;
}

function formatBytes(value: number, isFa: boolean) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) { scaled /= 1000; unit += 1; }
  return `${new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", { maximumFractionDigits: 2 }).format(scaled)} ${units[unit]}`;
}

function RankList({ rows, isFa }: { rows: TrafficRank[]; isFa: boolean }) {
  return rows.length ? <div className="device-traffic-ranks">{rows.map((row) => <div key={row.value}><code dir="ltr">{row.value}</code><span>{new Intl.NumberFormat(isFa ? "fa-IR" : "en-US").format(row.count)} {isFa ? "رخداد" : "events"}</span></div>)}</div> : <p className="device-traffic-muted">{isFa ? "رخداد دارای این شناسه ثبت نشده است." : "No matching log event was recorded."}</p>;
}

function VolumeList({ rows, isFa }: { rows: VolumeRank[]; isFa: boolean }) {
  return <div className="device-traffic-ranks">{rows.map((row) => <div key={row.value}><code dir="ltr">{row.value}</code><span>{formatBytes(row.bytes, isFa)}</span></div>)}</div>;
}

export function DeviceTrafficPanel({ isFa }: { isFa: boolean }) {
  const [devices, setDevices] = useState<DeviceTraffic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"interfaces" | "ports" | "sourceIps" | "destinationIps">("interfaces");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (document.visibilityState !== "visible") return; getDeviceTrafficOverview().then((result) => { if (active) { setDevices(result.devices); setError(false); setLoading(false); } }).catch(() => { if (active) { setError(true); setLoading(false); } }); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshKey]);
  const orderedDevices = [...devices].sort((left, right) => (right.interfaces[0]?.totalMbps ?? -1) - (left.interfaces[0]?.totalMbps ?? -1) || left.name.localeCompare(right.name));
  const selected = orderedDevices.find((device) => device.id === selectedId) ?? orderedDevices[0];
  return <article className="command-panel device-traffic-panel">
    <header className="command-panel-heading"><div><span className="command-panel__icon"><Network /></span><div><h2>{isFa ? "ترافیک هر تجهیز" : "Traffic by device"}</h2><p>{isFa ? "نرخ اینترفیس و حجم ثبت‌شدهٔ IP و پورت" : "Interface rates and measured IP/port volume"}</p></div></div><button type="button" className="device-traffic-refresh" onClick={() => setRefreshKey((value) => value + 1)} aria-label={isFa ? "به‌روزرسانی" : "Refresh"}><RefreshCw size={16} /></button></header>
    {loading && !devices.length ? <p className="device-traffic-muted device-traffic-pad">{isFa ? "در حال دریافت دادهٔ تجهیزات…" : "Loading device data…"}</p> : null}
    {error ? <p className="device-traffic-error device-traffic-pad">{isFa ? "دادهٔ ترافیک به‌روز نشد؛ دوباره تلاش کنید." : "Traffic data could not refresh."}</p> : null}
    {!loading && !devices.length ? <p className="device-traffic-muted device-traffic-pad">{isFa ? "تجهیزی برای نمایش وجود ندارد." : "No device is available."}</p> : null}
    {devices.length ? <><div className="device-traffic-picker" aria-label={isFa ? "تجهیزات" : "Devices"}>{orderedDevices.map((device) => {
      const top = device.interfaces.find((item) => item.totalMbps !== null);
      return <button type="button" key={device.id} className={device.id === selected?.id ? "is-selected" : ""} onClick={() => { setSelectedId(device.id); setView("interfaces"); }}><span><strong>{device.name}</strong><small>{device.vendor} · <span dir="ltr">{device.host}</span></small><small>{device.volume.ports[0] ? `${isFa ? "پورت" : "port"} ${device.volume.ports[0].value} · ${formatBytes(device.volume.ports[0].bytes, isFa)}` : isFa ? "حجم پورت: بدون داده" : "Port volume: unavailable"}{device.volume.sourceIps[0] ? ` · IP ${device.volume.sourceIps[0].value}` : ""}</small></span><b>{top ? formatRate(top.totalMbps, isFa) : "—"}</b><em>{top?.name ?? (isFa ? "دادهٔ نرخ موجود نیست" : "No rate data")}</em></button>;
    })}</div>{selected ? <div className="device-traffic-detail">
      <div className="device-traffic-detail__heading"><strong>{selected.name}</strong><small>{selected.vendor} · {isFa ? "جزئیات هر تجهیز" : "Device details"}</small></div>
      <div className="device-traffic-tabs" role="tablist" aria-label={isFa ? "نوع داده" : "Traffic view"}>{([
        ["interfaces", isFa ? "اینترفیس‌ها" : "Interfaces"], ["ports", isFa ? "پورت‌ها" : "Ports"], ["sourceIps", isFa ? "IP مبدأ" : "Source IP"], ["destinationIps", isFa ? "IP مقصد" : "Destination IP"]
      ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "interfaces" ? <>{selected.interfaces.length ? <div className="device-traffic-interfaces">{selected.interfaces.map((iface) => <div key={iface.name}><strong dir="ltr">{iface.name}</strong><span><ArrowDown size={13} />{formatRate(iface.rxMbps, isFa)}</span><span><ArrowUp size={13} />{formatRate(iface.txMbps, isFa)}</span><b>{formatRate(iface.totalMbps, isFa)}</b>{iface.stale ? <small>{isFa ? "داده قدیمی است" : "Stale data"}</small> : null}</div>)}</div> : <p className="device-traffic-muted">{isFa ? "این تجهیز هنوز نرخ ترافیک اینترفیس گزارش نکرده است." : "This device has not reported interface rates yet."}</p>}{selected.volume.interfaceIn.length || selected.volume.interfaceOut.length ? <div className="device-traffic-flow-pair"><div><h3>{isFa ? "اینترفیس ورودی؛ بایت ثبت‌شده" : "Ingress observed bytes"}</h3><VolumeList rows={selected.volume.interfaceIn} isFa={isFa} /></div><div><h3>{isFa ? "اینترفیس خروجی؛ بایت ثبت‌شده" : "Egress observed bytes"}</h3><VolumeList rows={selected.volume.interfaceOut} isFa={isFa} /></div></div> : null}<p className="device-traffic-note"><Activity size={13} />{isFa ? "Mbps از شمارندهٔ تجهیز یا میانگین ۵ دقیقه‌ای آن است. اینترفیس‌های دارای دادهٔ قدیمی رتبه‌بندی نمی‌شوند. در NetFlow v5 شناسهٔ اینترفیس به‌صورت ifIndex نمایش داده می‌شود." : "Mbps comes from device counters or its 5-minute average. Stale interfaces are not ranked. NetFlow v5 exposes interface ifIndex."}</p></> : <>{selected.volume[view].length ? <><p className="device-traffic-section-label">{selected.volume.source === "netflow-v5" ? isFa ? "بایت ثبت‌شدهٔ NetFlow v5" : "NetFlow v5 observed bytes" : isFa ? "بایت لاگ‌های عبور مجاز" : "Allowed-flow log bytes"}</p><VolumeList rows={selected.volume[view]} isFa={isFa} /></> : <p className="device-traffic-muted">{isFa ? "حجم برای این دسته ثبت نشده؛ NetFlow v5 یا لاگ جریان بایت‌دار را فعال کنید." : "No volume recorded; enable NetFlow v5 or byte-bearing flow logs."}</p>}{selected.observed[view].length ? <details className="device-traffic-log-fallback"><summary>{isFa ? "تعداد رخدادهای لاگ" : "Log event counts"}</summary><RankList rows={selected.observed[view]} isFa={isFa} /></details> : null}<p className="device-traffic-note">{selected.volume.sampled ? isFa ? "این صادرکننده نمونه‌برداری دارد؛ بایت‌ها فقط جریان‌های مشاهده‌شده‌اند و کل ترافیک نیستند." : "This exporter samples flows; bytes cover observed flows only, not total traffic." : isFa ? "جمع بایت‌های مشاهده‌شده در ۲۴ ساعت اخیر است؛ پوشش کامل به تنظیم صادرکننده و نبود افت بسته بستگی دارد." : "24-hour observed bytes; complete coverage depends on exporter settings and no packet loss."}</p></>}
      <DeviceNetflowSetup deviceId={selected.id} host={selected.host} isFa={isFa} />
    </div> : null}</> : null}
  </article>;
}
