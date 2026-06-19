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
      className={`flex min-h-[112px] flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.06)] ${border}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest leading-none text-slate-400">
          {label}
        </span>
        {icon && (
          <span className="text-slate-600" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <span className={`text-2xl font-bold leading-tight ${valueColor}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[11px] leading-none text-slate-500">{sub}</span>
      )}
    </div>
  );
}
