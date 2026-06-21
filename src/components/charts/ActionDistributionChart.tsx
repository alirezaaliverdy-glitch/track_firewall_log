import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

const ACTION_COLORS: Record<string, string> = {
  allow:  "#22c55e",
  deny:   "#ef4444",
  drop:   "#f97316",
  reset:  "#a855f7",
};
const DEFAULT_COLOR = "#52525b";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 12,
};

export default function ActionDistributionChart() {
  const { summary } = useLogContext();

  const data = useMemo(
    () => summary.topActions.map((e) => ({ action: e.value, count: e.count })),
    [summary.topActions]
  );

  return (
    <SectionCard title="Action Distribution">
      {data.length === 0 ? (
        <EmptyState compact title="No action data available" />
      ) : (
        <div className="h-72 min-h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="action"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
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
      )}
    </SectionCard>
  );
}
