import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  /** Tailwind color class for the value text, e.g. "text-green-400" */
  valueColor?: string;
  /** Optional lucide-react icon element */
  icon?: ReactNode;
  /** Visual emphasis — adds a coloured left border */
  accent?: "green" | "red" | "orange" | "yellow" | "blue" | "purple" | "none";
}

const ACCENT_BORDER: Record<string, string> = {
  green:  "border-l-4 border-l-green-500",
  red:    "border-l-4 border-l-red-500",
  orange: "border-l-4 border-l-orange-500",
  yellow: "border-l-4 border-l-yellow-500",
  blue:   "border-l-4 border-l-blue-500",
  purple: "border-l-4 border-l-purple-500",
  none:   "",
};

export function MetricCard({
  label,
  value,
  sub,
  valueColor = "text-zinc-100",
  icon,
  accent = "none",
}: MetricCardProps) {
  const border = ACCENT_BORDER[accent] ?? "";
  return (
    <div
      className={`rounded-lg bg-zinc-900 border border-zinc-700/60 p-4 flex flex-col gap-1.5 ${border}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest leading-none">
          {label}
        </span>
        {icon && (
          <span className="text-zinc-600" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <span className={`text-2xl font-bold leading-tight ${valueColor}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-zinc-500 leading-none">{sub}</span>
      )}
    </div>
  );
}
