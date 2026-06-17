import type { Severity } from "@/types/finding";

const CONFIG: Record<Severity, { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "bg-red-950 text-red-300 border border-red-700" },
  high:     { label: "High",     classes: "bg-orange-950 text-orange-300 border border-orange-700" },
  medium:   { label: "Medium",   classes: "bg-yellow-950 text-yellow-300 border border-yellow-700" },
  low:      { label: "Low",      classes: "bg-blue-950 text-blue-300 border border-blue-700" },
  info:     { label: "Info",     classes: "bg-zinc-800 text-zinc-400 border border-zinc-600" },
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
