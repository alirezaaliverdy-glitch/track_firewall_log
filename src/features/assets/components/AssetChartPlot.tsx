import type { WorkspaceChartPoint } from "@/lib/deviceOnboarding";

export function orderedReadings(points: WorkspaceChartPoint[]) {
  const byTime = new Map<number, WorkspaceChartPoint>();
  for (const point of points) {
    const time = Date.parse(point.timestamp);
    if (Number.isFinite(time) && Number.isFinite(point.value)) byTime.set(time, point);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}

/** Both directions share a real time/value domain; single readings remain visible. */
export function AssetChartPlot({ series, binary = false, locale, title }: {
  series: Array<{ points: WorkspaceChartPoint[]; label: string; color: string }>;
  binary?: boolean; locale: string; title: string;
}) {
  const cleaned = series.map((item) => ({ ...item, points: orderedReadings(item.points) }));
  const all = cleaned.flatMap((item) => item.points);
  if (!all.length) return null;
  const times = all.map((point) => Date.parse(point.timestamp));
  const start = Math.min(...times), end = Math.max(...times);
  const percentage = all.every((point) => point.unit === "percent" || point.unit === "%");
  const max = binary ? 1 : Math.max(percentage ? 100 : 0.001, ...all.map((point) => point.value));
  const min = binary ? 0 : Math.min(0, ...all.map((point) => point.value));
  const x = (point: WorkspaceChartPoint) => start === end ? 210 : 24 + (Date.parse(point.timestamp) - start) / (end - start) * 372;
  const y = (point: WorkspaceChartPoint) => 116 - (point.value - min) / (max - min) * 92;
  const clock = (time: number) => new Date(time).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return <div className="asset-chart-plot" dir="ltr">
    <svg viewBox="0 0 420 140" role="img" aria-label={title}>
      {[24, 70, 116].map((height) => <line key={height} x1="24" x2="396" y1={height} y2={height} stroke="currentColor" opacity=".12" />)}
      {cleaned.map((item) => {
        const path = item.points.map((point, index) => index === 0 ? `M ${x(point)} ${y(point)}` : binary ? `H ${x(point)} V ${y(point)}` : `L ${x(point)} ${y(point)}`).join(" ");
        return <g key={item.label} style={{ color: item.color }}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {item.points.map((point, index) => <circle key={point.timestamp} cx={x(point)} cy={y(point)} r={item.points.length === 1 ? 5 : index === item.points.length - 1 ? 3.5 : 1.5} fill="currentColor"><title>{item.label}: {point.value.toLocaleString(locale)} {point.unit ?? ""} · {new Date(point.timestamp).toLocaleString(locale)}</title></circle>)}
        </g>;
      })}
      <text x="24" y="136" fill="currentColor" fontSize="11">{clock(start)}</text>
      <text x="396" y="136" textAnchor="end" fill="currentColor" fontSize="11">{clock(end)}</text>
      <text x="24" y="16" fill="currentColor" fontSize="11">{max.toLocaleString(locale, { maximumFractionDigits: 3 })}</text>
    </svg>
  </div>;
}
