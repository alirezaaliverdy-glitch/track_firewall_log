import { AssetChartPlot, orderedReadings } from "./AssetChartPlot";
import type { WorkspaceChartPoint } from "@/lib/deviceOnboarding";

export function AssetMetricCard({ title, series, locale, unit = "", binary = false, empty, subtitle, start, end, staleReading }: {
  title: string; series: Array<{ points: WorkspaceChartPoint[]; label: string; color: string }>;
  locale: string; unit?: string; binary?: boolean; empty: string; subtitle?: string;
  start: number; end: number; staleReading?: WorkspaceChartPoint;
}) {
  const fa = locale.startsWith("fa");
  const latest = orderedReadings(series.flatMap((item) => item.points)).at(-1);
  const reading = latest ?? staleReading;
  const format = (value: number) => binary ? value === 1 ? (fa ? "برقرار" : "Online") : value === 0 ? (fa ? "قطع" : "Offline") : (fa ? "نیازمند بررسی" : "Unknown / degraded") : `${value.toLocaleString(locale, { maximumFractionDigits: 3 })}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  return <article className={`asset-metric-card ${latest ? "has-readings" : "is-empty"}`} data-metric={binary ? "availability" : unit === "%" ? "cpu" : unit === "Mbps" ? "traffic" : "latency"}>
    <header><h3>{title}</h3>{series.length === 1 ? <strong>{reading ? format(reading.value) : "—"}</strong> : <span>{unit}</span>}</header>
    {subtitle ? <small className="asset-metric-card__subtitle" dir="auto">{subtitle}</small> : null}
    <div className="asset-metric-card__plot"><AssetChartPlot series={series} binary={binary} locale={locale} title={title} windowStart={start} windowEnd={end} valueUnit={unit} />
      {!latest ? <p className="asset-metric-card__empty">{staleReading ? (fa ? "آخرین مقدار خارج از بازهٔ انتخابی است" : "Latest reading is outside this range") : empty}</p> : null}
    </div>
    <footer>{reading ? <time dateTime={reading.timestamp}>{fa ? (latest ? "آخرین نمونه: " : "دادهٔ قدیمی: ") : "Last sample: "}{new Date(reading.timestamp).toLocaleString(locale, { timeZone: "Asia/Tehran" })}</time> : <span>{fa ? "نمونه‌ای ثبت نشده" : "No recorded sample"}</span>}</footer>
  </article>;
}
