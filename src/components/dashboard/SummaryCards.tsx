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
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 flex flex-col gap-1">
      <span className="text-xs text-zinc-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-semibold ${valueClass ?? "text-zinc-100"}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
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
