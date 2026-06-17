import { useState } from "react";
import { useLogContext } from "@/context/LogContext";
import type { Finding, Severity } from "@/types/finding";

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<Severity, { label: string; classes: string; dot: string }> = {
  critical: { label: "Critical", classes: "border-red-700 bg-red-950/40",   dot: "bg-red-500"    },
  high:     { label: "High",     classes: "border-orange-700 bg-orange-950/30", dot: "bg-orange-500" },
  medium:   { label: "Medium",   classes: "border-yellow-700 bg-yellow-950/30", dot: "bg-yellow-500" },
  low:      { label: "Low",      classes: "border-blue-700 bg-blue-950/30",  dot: "bg-blue-400"   },
  info:     { label: "Info",     classes: "border-zinc-700 bg-zinc-800/40",  dot: "bg-zinc-400"   },
};

// ---------------------------------------------------------------------------
// Single finding card
// ---------------------------------------------------------------------------

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[finding.severity];

  return (
    <div className={`rounded-lg border p-4 ${cfg.classes}`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full ${cfg.dot}`}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              {cfg.label}
            </span>
            <span className="text-xs text-zinc-500">·</span>
            <span className="text-xs text-zinc-400">
              {finding.count} event{finding.count !== 1 ? "s" : ""}
            </span>
            {finding.mitreTactic && (
              <>
                <span className="text-xs text-zinc-500">·</span>
                <span className="text-xs text-zinc-500" title={finding.mitreTechnique ?? ""}>
                  MITRE: {finding.mitreTactic}
                </span>
              </>
            )}
          </div>
          <p className="text-sm font-medium text-zinc-100 mt-0.5 leading-snug">
            {finding.title}
          </p>
        </div>
        <button
          className="flex-shrink-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="mt-3 ml-5 space-y-2 text-xs text-zinc-300">
          <p>{finding.description}</p>
          <p className="text-zinc-400">
            <span className="font-semibold text-zinc-200">Recommendation: </span>
            {finding.recommendation}
          </p>
          {finding.mitreTechnique && (
            <p className="text-zinc-500">
              <span className="font-semibold text-zinc-400">Technique: </span>
              {finding.mitreTechnique}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export default function FindingsPanel() {
  const { findings, summary } = useLogContext();

  if (summary.total === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">
          Security Findings
        </h3>
        {findings.length > 0 && (
          <span className="text-xs text-zinc-400">
            {findings.length} finding{findings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No major security findings detected based on available fields.
        </p>
      ) : (
        <div className="space-y-2">
          {SEVERITY_ORDER.flatMap((sev) =>
            findings
              .filter((f) => f.severity === sev)
              .map((f) => <FindingCard key={f.id} finding={f} />)
          )}
        </div>
      )}
    </div>
  );
}
