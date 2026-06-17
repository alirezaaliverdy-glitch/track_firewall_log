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
import type { RawLogRow } from "@/types/log";

/**
 * Safely coerce a RawLogRow field to a number for Recharts.
 * Returns undefined (which Recharts treats as a gap) if the value is
 * missing, empty, or not numeric — so the chart never crashes.
 */
function toNum(val: RawLogRow[string]): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Prepare chart-safe rows: keep only the fields Recharts will use,
 * coercing them to numbers so booleans/nulls/undefined never reach the chart.
 */
function toChartRow(row: RawLogRow) {
  return {
    Time: String(row["Time"] ?? row["time"] ?? ""),
    Bytes: toNum(row["Bytes"] ?? row["bytes"]),
    "Bytes Sent": toNum(row["Bytes Sent"] ?? row["bytes_sent"]),
    "Bytes Received": toNum(row["Bytes Received"] ?? row["bytes_received"]),
  };
}

export default function LogChart() {
  const { filteredData } = useLogContext();

  // Limit chart to first 50 records for performance; coerce values safely
  const chartData = useMemo(
    () => filteredData.slice(0, 50).map(toChartRow),
    [filteredData]
  );

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="Bytes"
            stroke="#8884d8"
            name="Bytes"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Bytes Sent"
            stroke="#82ca9d"
            name="Bytes Sent"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Bytes Received"
            stroke="#ff7300"
            name="Bytes Received"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
