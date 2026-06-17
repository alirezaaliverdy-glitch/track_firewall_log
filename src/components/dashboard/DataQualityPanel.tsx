import { useLogContext } from "@/context/LogContext";

const FIELD_LABELS: Record<string, string> = {
  timestamp:  "Timestamp",
  action:     "Action",
  srcIp:      "Source IP",
  dstIp:      "Destination IP",
  srcPort:    "Source Port",
  dstPort:    "Destination Port",
  protocol:   "Protocol",
  bytes:      "Bytes",
  packets:    "Packets",
};

const CRITICAL_FIELDS = new Set(["action", "dstPort", "srcIp", "dstIp", "timestamp", "protocol"]);

function CoverageBar({ coverage }: { coverage: number }) {
  const pct = Math.round(coverage * 100);
  const color =
    pct >= 75 ? "bg-green-500" :
    pct >= 40 ? "bg-yellow-500" :
                "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% coverage`}
        />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function DataQualityPanel() {
  const { dataQuality, summary } = useLogContext();

  if (summary.total === 0) return null;

  const scoreColor =
    dataQuality.score >= 75 ? "text-green-400" :
    dataQuality.score >= 50 ? "text-yellow-400" :
                               "text-red-400";

  // Build detection-limitation warnings from missing critical fields
  const warnings: string[] = [];
  if (!summary.hasFields.srcIp || !summary.hasFields.dstIp) {
    warnings.push("Some detections are limited because Source IP or Destination IP was not detected.");
  }
  if (!summary.hasFields.timestamp) {
    warnings.push("Timestamp was not detected. Time-based correlation is unavailable.");
  }
  if (!summary.hasFields.protocol) {
    warnings.push("Protocol was not detected. Protocol-based filtering is unavailable.");
  }
  if (!summary.hasFields.dstPort) {
    warnings.push("Destination Port was not detected. Port-based detections are unavailable.");
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">
          Data Quality
        </h3>
        <span className={`text-2xl font-bold ${scoreColor}`}>
          {dataQuality.score}%
        </span>
      </div>

      {/* Field coverage bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-3">
        {dataQuality.fields.map((f) => (
          <div key={f.field}>
            <div className="flex justify-between mb-0.5">
              <span className={`text-xs ${CRITICAL_FIELDS.has(f.field) ? "text-zinc-200" : "text-zinc-400"}`}>
                {FIELD_LABELS[f.field] ?? f.field}
                {CRITICAL_FIELDS.has(f.field) && (
                  <span className="ml-1 text-zinc-500" aria-hidden="true">•</span>
                )}
              </span>
            </div>
            <CoverageBar coverage={f.coverage} />
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-500 mb-2">
        Fields marked <span className="text-zinc-400">•</span> are critical for detections.
      </p>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1 mt-2">
          {warnings.map((w) => (
            <p key={w} className="text-xs text-yellow-400" role="status">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
