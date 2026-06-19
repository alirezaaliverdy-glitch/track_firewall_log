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
    pct >= 75 ? "bg-blue-500" :
    pct >= 40 ? "bg-amber-500" :
                "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isCritical ? "font-medium text-slate-200" : "text-slate-400"}`}>
          {FIELD_LABELS[field] ?? field}
        </span>
        <span className="text-xs tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
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

import { AlertTriangle } from "lucide-react";

export default function DataQualityPanel() {
  const { dataQuality, summary, missingMappings, columnMapping } = useLogContext();

  if (summary.total === 0) return null;

  const scoreColorClass =
    dataQuality.score >= 75 ? "text-blue-300" :
    dataQuality.score >= 50 ? "text-amber-300" :
                               "text-red-300";
  
  const scoreLabel = dataQuality.score >= 75 ? "Good" : dataQuality.score >= 50 ? "Needs Attention" : "Poor";

  const recommendations: { text: string; id: string }[] = [];

  if (missingMappings.includes("action") || missingMappings.includes("dstPort")) {
    recommendations.push({
      id: "action_dstport",
      text: "Map Action and Destination Port to improve risky service detection.",
    });
  }
  if (missingMappings.includes("srcIp") || missingMappings.includes("dstIp")) {
    recommendations.push({
      id: "srcip_dstip",
      text: "Map Source IP and Destination IP to enable scan detection.",
    });
  }
  if (missingMappings.includes("timestamp")) {
    recommendations.push({
      id: "timestamp",
      text: "Timestamp is missing, so time-based analysis is limited.",
    });
  }

  const detectedFields = Object.entries(columnMapping).filter(([, mappedTo]) => mappedTo !== undefined).length;

  return (
    <SectionCard title="Data Quality" subtitle="Field coverage used for normalization and detections">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${scoreColorClass}`}>{dataQuality.score}%</span>
            <span className="text-sm font-medium text-slate-300">{scoreLabel}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Overall import quality</p>
        </div>
        <div className="text-xs text-slate-400">
          Detected fields: <span className="font-medium text-slate-200">{detectedFields}</span> / <span className="font-medium text-slate-200">{Object.keys(FIELD_LABELS).length}</span>
          <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            Required fields highlighted
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-4">
        {dataQuality.fields.map((f) => (
          <CoverageBar key={f.field} coverage={f.coverage} field={f.field} />
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          {recommendations.map((rec) => (
            <p key={rec.id} className="flex items-start gap-2 rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300" role="status">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{rec.text}</span>
            </p>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Re-export FIELD_LABELS from mapping types or define here if truly local
// For now, let's keep it local as it might have specific needs for DataQualityPanel
// This avoids redeclaration error by removing the redundant declaration at the top


