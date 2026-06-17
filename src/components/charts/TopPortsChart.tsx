import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLogContext } from "@/context/LogContext";
import { isRiskyPort } from "@/lib/riskyPorts";

export default function TopPortsChart() {
  const { summary } = useLogContext();

  const data = useMemo(
    () =>
      summary.topDstPorts.map((entry) => ({
        port: entry.value,
        count: entry.count,
        risky: isRiskyPort(Number(entry.value)),
      })),
    [summary.topDstPorts]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 flex items-center justify-center h-48">
        <p className="text-sm text-zinc-500">No destination port data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide mb-1">
        Top Destination Ports
      </h3>
      <p className="text-xs text-zinc-500 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" aria-hidden="true" />
        Orange bars are in the risky ports registry.
      </p>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="port"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
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
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              formatter={(value: number) => [value, "Count"]}
            />
            <Bar
              dataKey="count"
              name="Count"
              radius={[4, 4, 0, 0]}
              // Single fill; risky ports highlighted via tooltip and legend note
              fill="#3b82f6"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
