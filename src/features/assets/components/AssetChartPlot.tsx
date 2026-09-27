import { useEffect, useMemo, useRef } from "react";
import Highcharts from "highcharts";
import "highcharts/modules/accessibility";
import type { WorkspaceChartPoint } from "@/lib/deviceOnboarding";
import { chartReadings, orderedReadings } from "./assetChartData";
export { orderedReadings } from "./assetChartData";

export function AssetChartPlot({ series, binary = false, locale, title, windowStart, windowEnd, valueUnit }: {
  series: Array<{ points: WorkspaceChartPoint[]; label: string; color: string }>;
  binary?: boolean; locale: string; title: string; windowStart?: number; windowEnd?: number; valueUnit?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<Highcharts.Chart | null>(null);
  const options = useMemo<Highcharts.Options>(() => {
    const readings = series.flatMap((item) => orderedReadings(item.points));
    const percentage = valueUnit === "%" || readings.length > 0 && readings.every((point) => point.unit === "percent" || point.unit === "%");
    const unit = valueUnit ?? (percentage ? "%" : readings[0]?.unit === "count" ? "" : readings[0]?.unit ?? "");
    const fa = locale.startsWith("fa");
    const state = (value: number) => value === 1 ? (fa ? "برقرار" : "Online") : value === 0 ? (fa ? "قطع" : "Offline") : (fa ? "نامشخص / نیازمند بررسی" : "Unknown / degraded");
    return {
      chart: { type: "line", backgroundColor: "transparent", height: 210, animation: false, spacing: [12, 8, 8, 8], style: { fontFamily: "inherit", fontSize: "12px" }, zooming: { type: "x" } },
      title: { text: undefined }, time: { timezone: "Asia/Tehran" },
      credits: { enabled: true, style: { color: "#8297a4", fontSize: "9px" } },
      accessibility: { description: title },
      legend: { enabled: series.length > 1, itemStyle: { color: "#b5c8d2", fontWeight: "normal", fontSize: "12px" }, itemHoverStyle: { color: "#eff8fc" } },
      xAxis: { type: "datetime", min: windowStart, max: windowEnd, lineColor: "#263947", tickColor: "#263947", tickPixelInterval: 115,
        labels: { style: { color: "#95aab7", fontSize: "11px" }, formatter() { return new Date(Number(this.value)).toLocaleString(locale, { timeZone: "Asia/Tehran", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } } },
      yAxis: { title: { text: binary ? undefined : unit, style: { color: "#95aab7" } }, min: 0, max: binary ? 1 : percentage ? 100 : undefined,
        tickPositions: binary ? [0, .5, 1] : undefined, gridLineColor: "rgba(148,163,184,.12)", startOnTick: true, endOnTick: !binary,
        labels: { style: { color: "#95aab7", fontSize: "11px" }, formatter() { return binary ? state(Number(this.value)) : Number(this.value).toLocaleString(locale, { maximumFractionDigits: 3 }); } } },
      tooltip: { shared: false, useHTML: false, backgroundColor: "#142b3a", borderColor: "#375365", style: { color: "#e2eef4", fontSize: "13px" },
        formatter() { const time = new Date(this.x ?? 0).toLocaleString(locale, { timeZone: "Asia/Tehran" }); const reading = this.y === null || this.y === undefined ? "—" : binary ? state(this.y) : `${this.y.toLocaleString(locale, { maximumFractionDigits: 3 })} ${unit}`; return `${time}\n${this.series.name}: ${reading}`; } },
      plotOptions: { series: { animation: false, connectNulls: false, lineWidth: 2, marker: { enabled: readings.length < 3, radius: 4, states: { hover: { enabled: true, radius: 5 } } }, states: { inactive: { opacity: .65 } } } },
      series: series.map((item, index) => ({ type: "line", id: `asset-series-${index}`, name: item.label, color: item.color, step: binary ? "left" : undefined, data: chartReadings(item.points, binary) }))
    };
  }, [series, binary, locale, title, windowStart, windowEnd, valueUnit]);
  useEffect(() => {
    if (!container.current) return;
    chart.current = Highcharts.chart(container.current, {});
    const observer = new ResizeObserver(() => chart.current?.reflow());
    observer.observe(container.current);
    return () => { observer.disconnect(); chart.current?.destroy(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.update(options, true, true, false); }, [options]);
  return <div ref={container} className="asset-chart-plot asset-highchart" dir="ltr" aria-label={title} />;
}
