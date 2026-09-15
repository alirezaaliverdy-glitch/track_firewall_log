import type { Severity } from "@/types/finding";

const CONFIG: Record<Severity, { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "bg-red-950/70 text-red-200 border border-red-700/80" },
  high:     { label: "High",     classes: "bg-orange-950/70 text-orange-200 border border-orange-700/80" },
  medium:   { label: "Medium",   classes: "bg-amber-950/70 text-amber-200 border border-amber-700/80" },
  low:      { label: "Low",      classes: "bg-blue-950/60 text-blue-200 border border-blue-800/80" },
  info:     { label: "Info",     classes: "bg-slate-800 text-slate-300 border border-slate-600" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, classes } = CONFIG[severity];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

/** Dot-only variant for use in tight spaces. */
export function SeverityDot({ severity }: { severity: Severity }) {
  const dotColors: Record<Severity, string> = {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-yellow-500",
    low:      "bg-blue-400",
    info:     "bg-zinc-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColors[severity]}`}
      aria-hidden="true"
    />
  );
}
