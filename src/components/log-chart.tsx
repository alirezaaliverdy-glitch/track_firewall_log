import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { NormalizedLog } from "@/types/log";

function toNum(val: number | undefined): number | undefined {
  return val !== undefined && Number.isFinite(val) ? val : undefined;
}

function toChartRow(log: NormalizedLog) {
  const label = log.timestamp ?? log.time ?? log.date ?? "";
  const bytesRaw =
    log.bytes ??
    (log.bytesSent !== undefined && log.bytesReceived !== undefined
      ? log.bytesSent + log.bytesReceived
      : undefined);
  return {
    label,
    Bytes:            toNum(bytesRaw),
    "Bytes Sent":     toNum(log.bytesSent),
    "Bytes Received": toNum(log.bytesReceived),
  };
}

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 12,
};

export default function LogChart() {
  const { filteredLogs } = useLogContext();

  const chartData = useMemo(
    () => filteredLogs.slice(0, 50).map(toChartRow),
    [filteredLogs]
  );

  const hasData = chartData.some(
    (r) => r.Bytes !== undefined || r["Bytes Sent"] !== undefined
  );

  return (
    <SectionCard
      title="Bytes Over Time"
      subtitle="First 50 rows of current selection"
    >
      {!hasData ? (
        <EmptyState
          compact
          title="No byte data available"
          description="Upload a log file that includes bytes or bytes sent / received columns."
        />
      ) : (
        <div className="h-72 min-h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              <Line type="monotone" dataKey="Bytes"
                stroke="#8b5cf6" name="Bytes" dot={false} connectNulls={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="Bytes Sent"
                stroke="#22c55e" name="Bytes Sent" dot={false} connectNulls={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="Bytes Received"
                stroke="#f97316" name="Bytes Received" dot={false} connectNulls={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
