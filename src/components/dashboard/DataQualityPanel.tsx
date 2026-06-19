import { useState } from "react";
import { AlertTriangle, CheckCircle, ChevronDown } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";

const FIELD_LABELS: Record<string, string> = {
  timestamp: "Timestamp",
  action: "Action",
  srcIp: "Source IP",
  dstIp: "Destination IP",
  srcPort: "Source Port",
  dstPort: "Destination Port",
  protocol: "Protocol",
  bytes: "Bytes",
  packets: "Packets",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function CoverageRow({ coverage, field }: { coverage: number; field: string }) {
  const pct = Math.round(coverage * 100);
  const barColor =
    pct >= 75 ? "bg-blue-500" :
    pct >= 40 ? "bg-amber-500" :
                "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="w-32 flex-shrink-0 text-xs text-slate-300">{fieldLabel(field)}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${fieldLabel(field)}: ${pct}% coverage`}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

export default function DataQualityPanel() {
  const { dataQuality, summary, missingMappings } = useLogContext();
  const [showDetails, setShowDetails] = useState(false);

  if (summary.total === 0) return null;

  const missingLabels = missingMappings.map(fieldLabel);
  const hasScanGap = missingMappings.includes("srcIp") || missingMappings.includes("dstIp");
  const hasRiskyServiceGap = missingMappings.includes("action") || missingMappings.includes("dstPort");

  const status =
    dataQuality.score >= 75 ? "Ready" :
    dataQuality.score >= 50 ? "Needs Mapping" :
                              "Limited Analysis";

  const isReady = status === "Ready";
  const explanation = isReady
    ? "Mapping looks good. Security findings are based on the available fields."
    : hasScanGap
      ? "Source IP and Destination IP are missing, so attacker and scan detection is limited."
      : hasRiskyServiceGap
        ? "Action or Destination Port is missing, so risky service analysis is limited."
        : "Some useful fields are missing, so analysis may be less complete.";

  const suggestion = isReady
    ? "Review findings and evidence, then export anything you need to share."
    : hasScanGap
      ? "Map Source IP and Destination IP to improve attacker and scan detection."
      : hasRiskyServiceGap
        ? "Map Action and Destination Port to improve risky service detection."
        : "Review the mapping and connect any available firewall fields.";

  return (
    <SectionCard title="Analysis Readiness" subtitle="How complete this import is for security analysis">
      <div className={`rounded-lg border px-4 py-3 ${
        isReady ? "border-blue-800/70 bg-blue-950/25" : "border-amber-800/60 bg-amber-950/20"
      }`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-md border text-lg font-bold ${
              isReady
                ? "border-blue-700/70 bg-blue-900/30 text-blue-200"
                : "border-amber-700/70 bg-amber-900/20 text-amber-200"
            }`}>
              {dataQuality.score}%
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isReady ? (
                  <CheckCircle className="h-4 w-4 text-blue-300" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
                )}
                <p className={`text-sm font-semibold ${isReady ? "text-blue-100" : "text-amber-100"}`}>
                  {status}
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-300">{explanation}</p>
              <p className={`mt-1 text-xs ${isReady ? "text-blue-300" : "text-amber-300"}`}>
                Next: {suggestion}
              </p>
            </div>
          </div>

          {missingLabels.length > 0 && (
            <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              Missing: <span className="text-slate-200">{missingLabels.join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((value) => !value)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-800/70 hover:text-blue-200"
        aria-expanded={showDetails}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} aria-hidden="true" />
        View field details
      </button>

      {showDetails && (
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-slate-800 pt-3 sm:grid-cols-2">
          {dataQuality.fields.map((field) => (
            <CoverageRow key={field.field} coverage={field.coverage} field={field.field} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
