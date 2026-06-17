import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useLogContext } from "@/context/LogContext";
import type { NormalizedLog } from "@/types/log";

// ---------------------------------------------------------------------------
// Safe coercion — undefined tells Recharts to render a gap, not crash
// ---------------------------------------------------------------------------

function toNum(val: number | undefined): number | undefined {
  return val !== undefined && Number.isFinite(val) ? val : undefined;
}

function toChartRow(log: NormalizedLog) {
  // Prefer combined timestamp; fall back to time-only
  const label = log.timestamp ?? log.time ?? log.date ?? "";

  // Prefer the dedicated total; fall back to sent+received when both are present
  const bytesRaw = log.bytes ?? (
    log.bytesSent !== undefined && log.bytesReceived !== undefined
      ? log.bytesSent + log.bytesReceived
      : undefined
  );

  return {
    label,
    Bytes:           toNum(bytesRaw),
    "Bytes Sent":    toNum(log.bytesSent),
    "Bytes Received": toNum(log.bytesReceived),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogChart() {
  const { filteredLogs } = useLogContext();

  // Limit to first 50 rows for rendering performance
  const chartData = useMemo(
    () => filteredLogs.slice(0, 50).map(toChartRow),
    [filteredLogs]
  );

  // Show an empty state rather than an empty chart frame when no byte data exists
  const hasData = chartData.some(
    (r) => r.Bytes !== undefined || r["Bytes Sent"] !== undefined
  );

  if (!hasData) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 flex items-center justify-center h-48 mb-4">
        <p className="text-sm text-zinc-500">
          No byte / packet data available for the current selection.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 mb-4">
      <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide mb-3">
        Bytes Over Time (first 50 rows)
      </h3>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 6,
                color: "#e4e4e7",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
            <Line
              type="monotone"
              dataKey="Bytes"
              stroke="#8b5cf6"
              name="Bytes"
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="Bytes Sent"
              stroke="#22c55e"
              name="Bytes Sent"
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="Bytes Received"
              stroke="#f97316"
              name="Bytes Received"
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
