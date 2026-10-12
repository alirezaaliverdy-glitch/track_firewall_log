import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Network, RefreshCw } from "lucide-react";
import { getDeviceTrafficOverview, type DeviceTraffic, type TrafficRank, type VolumeRank } from "@/lib/deviceTraffic";
import { DeviceNetflowSetup } from "./DeviceNetflowSetup";
import "./DeviceTrafficPanel.css";

const label = (isFa: boolean, fa: string, en: string) => isFa ? fa : en;
const number = (value: number, isFa: boolean, digits = 1) =>
  new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(value);

function rate(value: number | null, isFa: boolean) {
  if (value === null) return "—";
  return value >= 1000 ? number(value / 1000, isFa, 2) + " Gbps" : number(value, isFa, 2) + " Mbps";
}

function bytes(value: number, isFa: boolean) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) { amount /= 1000; unit += 1; }
  return number(amount, isFa, 2) + " " + units[unit];
}

function VolumeList({ rows, isFa }: { rows: VolumeRank[]; isFa: boolean }) {
  const max = Math.max(...rows.map((row) => row.bytes), 1);
  return <div className="device-traffic-list">{rows.map((row) => <div className="device-traffic-list__row" key={row.value}>
    <code dir="ltr">{row.value}</code>
    <span className="device-traffic-list__track"><i style={{ width: Math.max(2, row.bytes / max * 100) + "%" }} /></span>
    <strong dir="ltr">{bytes(row.bytes, isFa)}</strong>
  </div>)}</div>;
}

function LogList({ rows, isFa }: { rows: TrafficRank[]; isFa: boolean }) {
  return <div className="device-traffic-list">{rows.map((row) => <div className="device-traffic-list__row" key={row.value}>
    <code dir="ltr">{row.value}</code><span /><strong>{number(row.count, isFa, 0)}</strong>
  </div>)}</div>;
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
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void getDeviceTrafficOverview().then((result) => {
        if (active) { setDevices(result.devices); setLoading(false); setError(false); }
      }).catch(() => { if (active) { setLoading(false); setError(true); } });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshKey]);

  const ordered = [...devices].sort((a, b) => (b.interfaces[0]?.totalMbps ?? -1) - (a.interfaces[0]?.totalMbps ?? -1) || a.name.localeCompare(b.name));
  const selected = ordered.find((device) => device.id === selectedId) ?? ordered[0];
  const topInterface = selected?.interfaces.find((item) => item.totalMbps !== null);
  const topPort = selected?.volume.ports[0];
  const sourceIp = selected?.volume.sourceIps[0];
  const destinationIp = selected?.volume.destinationIps[0];
  const topIp = sourceIp && destinationIp ? sourceIp.bytes >= destinationIp.bytes ? sourceIp : destinationIp : sourceIp ?? destinationIp;
  const ipDirection = topIp === sourceIp ? label(isFa, "مبدأ", "Source") : label(isFa, "مقصد", "Destination");
  const source = selected?.volume.source;
  const sourceName = source === "netflow-v5" || source === "netflow-v9" ? "NetFlow " + source.slice(-2)
    : source === "allowed-flow-logs" ? label(isFa, "لاگ بایت‌دار", "Byte-bearing logs") : label(isFa, "بدون دادهٔ جریان", "No flow data");

  return <section className="command-panel device-traffic-panel" aria-labelledby="device-traffic-title">
    <header className="command-panel-heading device-traffic-header">
      <div><span className="command-panel__icon"><Network /></span><div>
        <h2 id="device-traffic-title">{label(isFa, "ترافیک تجهیزات", "Device traffic")}</h2>
        <p>{label(isFa, "نرخ اینترفیس‌ها · حجم ۲۴ ساعت اخیر", "Interface rate · volume over 24 hours")}</p>
      </div></div>
      <button type="button" className="device-traffic-refresh" onClick={() => setRefreshKey((value) => value + 1)} aria-label={label(isFa, "به‌روزرسانی ترافیک", "Refresh traffic")}><RefreshCw size={17} /></button>
    </header>
    {error ? <p className="device-traffic-message is-error" role="alert">{label(isFa, "داده به‌روز نشد. دوباره تلاش کنید.", "Could not refresh. Try again.")}</p> : null}
    {loading && !devices.length ? <p className="device-traffic-message">{label(isFa, "در حال دریافت…", "Loading…")}</p> : null}
    {!loading && !devices.length ? <p className="device-traffic-message">{label(isFa, "تجهیزی برای نمایش وجود ندارد.", "No device available.")}</p> : null}
    {selected ? <div className="device-traffic-content">
      <div className="device-traffic-toolbar">
        <label htmlFor="device-traffic-select">{label(isFa, "تجهیز", "Device")}</label>
        <select id="device-traffic-select" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setView("interfaces"); }}>
          {ordered.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.vendor} · {device.host}</option>)}
        </select>
        <span className={"device-traffic-source" + (source === "none" ? " is-empty" : "")}>{sourceName}</span>
      </div>
      <div className="device-traffic-highlights">
        <div><span>{label(isFa, "شلوغ‌ترین اینترفیس", "Busiest interface")}</span><strong dir="ltr">{topInterface ? rate(topInterface.totalMbps, isFa) : "—"}</strong><small dir="ltr">{topInterface?.name ?? label(isFa, "نرخ موجود نیست", "No rate")}</small></div>
        <div><span>{label(isFa, "پورت مقصد", "Destination port")}</span><strong dir="ltr">{topPort ? bytes(topPort.bytes, isFa) : "—"}</strong><small dir="ltr">{topPort ? ":" + topPort.value : label(isFa, "حجم موجود نیست", "No volume")}</small></div>
        <div><span>{label(isFa, "IP پرترافیک", "Top IP")}</span><strong dir="ltr">{topIp ? bytes(topIp.bytes, isFa) : "—"}</strong><small dir="ltr">{topIp ? topIp.value + " · " + ipDirection : label(isFa, "حجم موجود نیست", "No volume")}</small></div>
      </div>
      <details className="device-traffic-explore">
        <summary>{label(isFa, "جزئیات ترافیک", "Explore traffic")}</summary>
        <div className="device-traffic-tabs" role="tablist" aria-label={label(isFa, "نوع داده", "Traffic view")}>
          {([["interfaces", label(isFa, "اینترفیس", "Interfaces")], ["ports", label(isFa, "پورت", "Ports")], ["sourceIps", label(isFa, "IP مبدأ", "Source IP")], ["destinationIps", label(isFa, "IP مقصد", "Destination IP")]] as const)
            .map(([key, title]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "is-active" : ""} onClick={() => setView(key)}>{title}</button>)}
        </div>
        {view === "interfaces" ? <>{selected.interfaces.length ? <div className="device-traffic-list">
          {selected.interfaces.map((item) => <div className="device-traffic-interface" key={item.name}>
            <code dir="ltr">{item.name}</code><span><ArrowDown size={14} />{rate(item.rxMbps, isFa)}</span><span><ArrowUp size={14} />{rate(item.txMbps, isFa)}</span><strong dir="ltr">{rate(item.totalMbps, isFa)}</strong>
          </div>)}
        </div> : <p className="device-traffic-empty">{label(isFa, "هنوز نرخ اینترفیس دریافت نشده است.", "No interface rate yet.")}</p>}
        {selected.volume.interfaceIn.length ? <div className="device-traffic-direction"><h3>{label(isFa, "حجم ورودی", "Ingress volume")}</h3><VolumeList rows={selected.volume.interfaceIn} isFa={isFa} /></div> : null}
        {selected.volume.interfaceOut.length ? <div className="device-traffic-direction"><h3>{label(isFa, "حجم خروجی", "Egress volume")}</h3><VolumeList rows={selected.volume.interfaceOut} isFa={isFa} /></div> : null}</>
        : selected.volume[view].length ? <VolumeList rows={selected.volume[view]} isFa={isFa} />
          : <p className="device-traffic-empty">{label(isFa, "حجم این دسته ثبت نشده است.", "No volume for this view.")}</p>}
        {view !== "interfaces" && selected.observed[view].length ? <details className="device-traffic-log-fallback">
          <summary>{label(isFa, "فقط تعداد رخدادهای لاگ", "Log event counts only")}</summary>
          <LogList rows={selected.observed[view]} isFa={isFa} />
        </details> : null}
        <p className="device-traffic-note">{view === "interfaces"
          ? label(isFa, "نرخ از شمارندهٔ تجهیز است؛ Cisco ممکن است میانگین ۵ دقیقه‌ای بدهد.", "Rates come from device counters; Cisco may provide a five-minute average.")
          : label(isFa, "حجم فقط جریان‌های مشاهده‌شده است؛ نمونه‌برداری یا افت بسته ممکن است آن را ناقص کند.", "Observed flows only; sampling or packet loss can make volume incomplete.")}</p>
      </details>
      <DeviceNetflowSetup deviceId={selected.id} host={selected.host} vendor={selected.vendor} isFa={isFa} />
    </div> : null}
  </section>;
}
