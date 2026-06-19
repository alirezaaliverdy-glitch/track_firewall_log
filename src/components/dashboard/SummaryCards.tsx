import { useLogContext } from "@/context/LogContext";

// ---------------------------------------------------------------------------
// Presentational card
// ---------------------------------------------------------------------------

function Card({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-h-[104px] flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.06)]">
      <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`text-2xl font-semibold ${valueClass ?? "text-blue-100"}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} K`;
  return n.toLocaleString();
}

function hygieneColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SummaryCards() {
  const { summary, hygieneScore, findings } = useLogContext();

  if (summary.total === 0) return null;

  const deniedDropped = summary.denied + summary.dropped;
  const deniedSub =
    summary.reset > 0 ? `+${summary.reset.toLocaleString()} reset` : undefined;

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount     = findings.filter((f) => f.severity === "high").length;
  const findingsSub =
    findings.length > 0
      ? `${criticalCount}C · ${highCount}H`
      : "No findings";

  return (
    <div className="mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card
          label="Total Logs"
          value={summary.total.toLocaleString()}
        />
        <Card
          label="Allowed"
          value={summary.allowed.toLocaleString()}
          valueClass="text-green-400"
        />
        <Card
          label="Denied / Dropped"
          value={deniedDropped.toLocaleString()}
          sub={deniedSub}
          valueClass={deniedDropped > 0 ? "text-red-400" : "text-zinc-100"}
        />
        <Card
          label="Total Bytes"
          value={fmtBytes(summary.totalBytes)}
        />
        <Card
          label="Total Packets"
          value={fmtCount(summary.totalPackets)}
        />
        <Card
          label="Unique Src IPs"
          value={summary.uniqueSrcIps.toLocaleString()}
        />
        <Card
          label="Unique Dst IPs"
          value={summary.uniqueDstIps.toLocaleString()}
        />
        <Card
          label="Hygiene Score"
          value={`${hygieneScore}%`}
          sub={findings.length > 0 ? findingsSub : undefined}
          valueClass={hygieneColor(hygieneScore)}
        />
      </div>
    </div>
  );
}
