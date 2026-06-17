import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useLogContext } from "@/context/LogContext";
import { isRiskyPort } from "@/lib/riskyPorts";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 12,
};

const legend = (
  <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" aria-hidden="true" />
    Risky port
    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 ml-1" aria-hidden="true" />
    Normal
  </span>
);

export default function TopPortsChart() {
  const { summary } = useLogContext();

  const data = useMemo(
    () =>
      summary.topDstPorts.map((e) => ({
        port: e.value,
        count: e.count,
        risky: isRiskyPort(Number(e.value)),
      })),
    [summary.topDstPorts]
  );

  return (
    <SectionCard title="Top Destination Ports" headerRight={legend}>
      {data.length === 0 ? (
        <EmptyState compact title="No destination port data available" />
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="port"
                tick={{ fill: "#71717a", fontSize: 10 }}
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
                formatter={(value: number) => [value, "Events"]}
              />
              <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell
                    key={entry.port}
                    fill={entry.risky ? "#f97316" : "#3b82f6"}
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
