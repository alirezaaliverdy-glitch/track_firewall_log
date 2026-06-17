import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";
import { SeverityBadge, SeverityDot } from "@/components/ui/SeverityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Finding, Severity } from "@/types/finding";

// ---------------------------------------------------------------------------
// Single finding row
// ---------------------------------------------------------------------------

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
      {/* Summary row — always visible */}
      <button
        type="button"
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SeverityDot severity={finding.severity} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs text-zinc-500">
              {finding.count} event{finding.count !== 1 ? "s" : ""}
            </span>
            {finding.mitreTactic && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400"
                title={finding.mitreTechnique}
              >
                MITRE · {finding.mitreTactic}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-zinc-100 leading-snug">
            {finding.title}
          </p>
        </div>

        <span className="flex-shrink-0 mt-0.5 text-zinc-500">
          {open
            ? <ChevronDown className="w-4 h-4" aria-hidden="true" />
            : <ChevronRight className="w-4 h-4" aria-hidden="true" />
          }
        </span>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-700/40 bg-zinc-800/30 space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed">
            {finding.description}
          </p>

          <div className="rounded-md bg-zinc-900 border border-zinc-700/50 p-3">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
              Recommendation
            </p>
            <p className="text-xs text-zinc-200">{finding.recommendation}</p>
          </div>

          {finding.mitreTechnique && (
            <p className="text-[11px] text-zinc-500">
              <span className="text-zinc-400 font-medium">Technique: </span>
              {finding.mitreTechnique}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity group header
// ---------------------------------------------------------------------------

function SeverityGroup({
  severity,
  findings,
}: {
  severity: Severity;
  findings: Finding[];
}) {
  if (findings.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <SeverityBadge severity={severity} />
        <span className="text-xs text-zinc-500">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {findings.map((f) => (
          <FindingRow key={f.id} finding={f} />
        ))}
      </div>
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

  const grouped = Object.fromEntries(
    SEVERITY_ORDER.map((sev) => [
      sev,
      findings.filter((f) => f.severity === sev),
    ])
  ) as Record<Severity, Finding[]>;

  const headerRight = findings.length > 0
    ? (
      <span className="text-xs text-zinc-400">
        {findings.length} finding{findings.length !== 1 ? "s" : ""}
      </span>
    )
    : null;

  return (
    <SectionCard title="Security Findings" headerRight={headerRight}>
      {findings.length === 0 ? (
        <EmptyState
          compact
          title="No major security findings detected"
          description="Based on the available fields in the uploaded log."
        />
      ) : (
        <div className="space-y-5">
          {SEVERITY_ORDER.map((sev) => (
            <SeverityGroup
              key={sev}
              severity={sev}
              findings={grouped[sev]}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
