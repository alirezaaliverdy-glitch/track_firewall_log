import { useLogContext } from "@/context/LogContext";

// ---------------------------------------------------------------------------
// Tiny presentational helper
// ---------------------------------------------------------------------------

function Card({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-4 flex flex-col gap-1",
        warn ? "border-yellow-500 bg-yellow-950/30" : "border-zinc-700 bg-zinc-900",
      ].join(" ")}
    >
      <span className="text-xs text-zinc-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-zinc-100">{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SummaryCards() {
  const { summary, dataQuality } = useLogContext();

  if (summary.total === 0) return null;

  const denied  = summary.denied + summary.dropped;
  const bytesFmt =
    summary.totalBytes >= 1_000_000
      ? `${(summary.totalBytes / 1_000_000).toFixed(1)} MB`
      : summary.totalBytes >= 1_000
      ? `${(summary.totalBytes / 1_000).toFixed(1)} KB`
      : `${summary.totalBytes} B`;

  const pktsFmt =
    summary.totalPackets >= 1_000_000
      ? `${(summary.totalPackets / 1_000_000).toFixed(1)} M`
      : summary.totalPackets >= 1_000
      ? `${(summary.totalPackets / 1_000).toFixed(0)} K`
      : `${summary.totalPackets}`;

  const scoreColor =
    dataQuality.score >= 75
      ? "text-green-400"
      : dataQuality.score >= 50
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card label="Total Logs"       value={summary.total.toLocaleString()} />
        <Card label="Allowed"          value={summary.allowed.toLocaleString()} />
        <Card
          label="Denied / Dropped"
          value={denied.toLocaleString()}
          sub={summary.reset > 0 ? `+${summary.reset} reset` : undefined}
        />
        <Card label="Total Bytes"      value={bytesFmt} />
        <Card label="Total Packets"    value={pktsFmt} />
        <Card label="Unique Src IPs"   value={summary.uniqueSrcIps.toLocaleString()} />
        <Card label="Unique Dst IPs"   value={summary.uniqueDstIps.toLocaleString()} />

        {/* Data Quality Score */}
        <div
          className={[
            "rounded-lg border p-4 flex flex-col gap-1",
            dataQuality.score < 50
              ? "border-yellow-500 bg-yellow-950/30"
              : "border-zinc-700 bg-zinc-900",
          ].join(" ")}
          title={
            dataQuality.missingCriticalFields.length > 0
              ? `Missing: ${dataQuality.missingCriticalFields.join(", ")}`
              : "All critical fields present"
          }
        >
          <span className="text-xs text-zinc-400 uppercase tracking-wide">
            Data Quality
          </span>
          <span className={`text-2xl font-semibold ${scoreColor}`}>
            {dataQuality.score}%
          </span>
          {dataQuality.ipDetectionsLimited && (
            <span className="text-xs text-yellow-500">IP detections limited</span>
          )}
        </div>
      </div>

      {/* Missing critical field warnings */}
      {dataQuality.missingCriticalFields.length > 0 && (
        <p className="mt-2 text-xs text-yellow-500" role="status">
          Missing fields: {dataQuality.missingCriticalFields.join(", ")}
        </p>
      )}
    </div>
  );
}
