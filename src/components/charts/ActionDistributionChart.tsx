import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useLogContext } from "@/context/LogContext";

const ACTION_COLORS: Record<string, string> = {
  allow:  "#22c55e",  // green
  deny:   "#ef4444",  // red
  drop:   "#f97316",  // orange
  reset:  "#a855f7",  // purple
};

const DEFAULT_COLOR = "#71717a"; // zinc-500 for unknown actions

export default function ActionDistributionChart() {
  const { summary } = useLogContext();

  const data = useMemo(
    () =>
      summary.topActions.map((entry) => ({
        action: entry.value,
        count: entry.count,
      })),
    [summary.topActions]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 flex items-center justify-center h-48">
        <p className="text-sm text-zinc-500">No action data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide mb-3">
        Action Distribution
      </h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="action"
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
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
            />
            <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.action}
                  fill={ACTION_COLORS[entry.action] ?? DEFAULT_COLOR}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
