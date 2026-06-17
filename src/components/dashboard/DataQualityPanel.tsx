import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";

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

const CRITICAL_FIELDS = new Set([
  "action", "dstPort", "srcIp", "dstIp", "timestamp", "protocol",
]);

function CoverageBar({ coverage, field }: { coverage: number; field: string }) {
  const pct = Math.round(coverage * 100);
  const isCritical = CRITICAL_FIELDS.has(field);
  const barColor =
    pct >= 75 ? "bg-green-500" :
    pct >= 40 ? "bg-yellow-500" :
                "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isCritical ? "text-zinc-200 font-medium" : "text-zinc-400"}`}>
          {FIELD_LABELS[field] ?? field}
          {isCritical && (
            <span className="ml-1.5 text-[10px] text-zinc-500 font-normal uppercase tracking-wide">
              critical
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-zinc-400">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-700/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${FIELD_LABELS[field] ?? field}: ${pct}% coverage`}
        />
      </div>
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

  const warnings: string[] = [];
  if (!summary.hasFields.srcIp || !summary.hasFields.dstIp) {
    warnings.push(
      "Some detections are limited because Source IP or Destination IP was not detected."
    );
  }
  if (!summary.hasFields.timestamp) {
    warnings.push("Timestamp was not detected — time-based correlation is unavailable.");
  }
  if (!summary.hasFields.protocol) {
    warnings.push("Protocol was not detected — protocol-based filtering is unavailable.");
  }
  if (!summary.hasFields.dstPort) {
    warnings.push("Destination Port was not detected — port-based detections are unavailable.");
  }

  const scoreLabel = (
    <span className={`text-xl font-bold ${scoreColor}`}>
      {dataQuality.score}%
    </span>
  );

  return (
    <SectionCard title="Data Quality" headerRight={scoreLabel}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-4">
        {dataQuality.fields.map((f) => (
          <CoverageBar key={f.field} coverage={f.coverage} field={f.field} />
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5 pt-3 border-t border-zinc-700/60">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-xs text-yellow-400" role="status">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
