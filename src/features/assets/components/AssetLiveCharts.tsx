import { useState } from "react";
import { Activity, Cpu, MemoryStick, Network } from "lucide-react";
import { AssetMiniChart } from "./AssetMiniChart";
import { orderedReadings, type Reading } from "./assetChartData";
import "./AssetLiveCharts.css";

type Series = { name: string; color: string; points: Reading[] };
type Props = {
  cpu: Reading[]; memory: Reading[]; availability: Reading[];
  traffic: { interface: string | null; method: string; rx: Reading[]; tx: Reading[] };
  connection: string; isFa: boolean; refreshFailed?: boolean;
};

export function AssetLiveCharts({ cpu, memory, availability, traffic, connection, isFa, refreshFailed = false }: Props) {
  const [motion, setMotion] = useState(true);
  const locale = isFa ? "fa-IR" : "en-US", t = (fa: string, en: string) => isFa ? fa : en;
  const percent = (points: Reading[]) => orderedReadings(points.filter(p => p.value >= 0 && p.value <= 100));
  const rate = (points: Reading[]) => orderedReadings(points.filter(p => p.value >= 0));
  const resources = { cpu: percent(cpu), memory: percent(memory), rx: rate(traffic.rx), tx: rate(traffic.tx) };
  const states = orderedReadings(availability.filter(p => [0, .5, 1].includes(p.value)));
  const number = (value: number | undefined, unit: string) => value === undefined ? "—" : `${value.toLocaleString(locale, { maximumFractionDigits: unit === "Mbps" ? 3 : 1 })}${unit === "%" ? "%" : ""}`;
  const status = (value: number | undefined) => value === 1 ? t("برقرار", "Online") : value === 0 ? t("قطع", "Offline") : t("نامشخص", "Unknown");
  const plots: Array<{ key: string; title: string; icon: typeof Cpu; unit: string; series: Series[] }> = [
    { key: "cpu", title: t("مصرف CPU", "CPU usage"), icon: Cpu, unit: "%", series: [{ name: "CPU", color: "#86aee5", points: resources.cpu }] },
    { key: "memory", title: t("مصرف حافظه", "Memory usage"), icon: MemoryStick, unit: "%", series: [{ name: t("حافظه", "Memory"), color: "#b2a1d9", points: resources.memory }] },
    { key: "traffic", title: t("ترافیک عبوری", "Network traffic"), icon: Network, unit: "Mbps", series: [{ name: t("دریافت", "RX"), color: "#88b5bf", points: resources.rx }, { name: t("ارسال", "TX"), color: "#c9b387", points: resources.tx }] },
    { key: "availability", title: t("دسترسی دستگاه", "Device availability"), icon: Activity, unit: "", series: [{ name: t("دسترسی", "Availability"), color: "#94bea9", points: states }] }
  ];
  return <div className="asset-live-charts" data-motion={motion}>
    <div className="asset-live-toolbar"><span>{t("CPU و حافظه: درصد مصرف · ترافیک: Mbps", "CPU & RAM: utilization % · traffic: Mbps")}</span><button type="button" aria-pressed={motion} onClick={() => setMotion(v => !v)}>{t("انیمیشن", "Animation")}: {motion ? t("روشن", "On") : t("خاموش", "Off")}</button></div>
    <div className="asset-live-grid">{plots.map(plot => {
      const latest = orderedReadings(plot.series.flatMap(s => s.points)).at(-1);
      const recent = !!latest && Date.now() - Date.parse(latest.timestamp) <= 300_000 && Date.parse(latest.timestamp) <= Date.now() + 30_000;
      const live = recent && !refreshFailed && (plot.key === "availability" || connection === "online");
      const value = plot.key === "availability" ? status(latest?.value) : plot.key === "traffic" ? null : number(latest?.value, plot.unit);
      const Icon = plot.icon;
      return <article key={plot.key} className={`asset-live-metric ${live ? "is-live" : ""}`}>
        <header><span><Icon size={17} aria-hidden="true" />{plot.title}</span>{plot.unit === "Mbps" && <small>Mbps</small>}</header>
        <div className="asset-live-reading">{plot.key === "traffic" ? <div className="asset-live-rates">{plot.series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}<strong>{number(s.points.at(-1)?.value, "Mbps")}</strong></span>)}</div> : <strong>{value}</strong>}</div>
        {latest ? <AssetMiniChart title={plot.title} series={plot.series} unit={plot.unit} binary={plot.key === "availability"} motion={motion && live} locale={locale} /> : <div className="asset-live-empty">{t("هنوز دادهٔ معتبر نداریم", "No verified readings yet")}<small>{t("اتصال و مجوز خواندن سنسورها را بررسی کنید.", "Check connection and sensor read permissions.")}</small></div>}
        <footer><span className={`asset-live-freshness ${live ? "is-current" : ""}`}><i />{latest ? live ? t("به‌روز", "Current") : t("تاریخی / تأییدنشده", "Historical / unverified") : t("بدون نمونه", "No sample")}</span>{latest && <time dateTime={latest.timestamp}>{new Date(latest.timestamp).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</time>}</footer>
      </article>;
    })}</div>
    {traffic.interface && <p className="asset-live-interface">{t("منبع ترافیک", "Traffic source")}: <b dir="ltr">{traffic.interface}</b> · {traffic.method === "device_5m_average" ? t("میانگین ۵ دقیقه‌ای دستگاه", "Device 5-minute average") : t("اختلاف شمارنده‌های واقعی اینترفیس", "Measured interface counter delta")}</p>}
  </div>;
}
