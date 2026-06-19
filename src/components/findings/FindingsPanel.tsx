import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Table2,
  Copy,
  Check,
  Download,
  XCircle,
} from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { SectionCard } from "@/components/ui/SectionCard";
import { SeverityBadge, SeverityDot } from "@/components/ui/SeverityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getFindingSummaryText,
  copyToClipboard,
} from "@/lib/findingUtils";
import { exportFindingEvidence } from "@/lib/exportUtils";
import type { Finding, Severity } from "@/types/finding";

// ---------------------------------------------------------------------------
// Single finding card
// ---------------------------------------------------------------------------

function FindingCard({
  finding,
  isSelected,
  onSelect,
  onFilterLogs,
}: {
  finding: Finding;
  isSelected: boolean;
  onSelect: () => void;
  onFilterLogs: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(getFindingSummaryText(finding));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    exportFindingEvidence(finding);
  };

  const handleFilterLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFilterLogs();
  };

  const handleViewEvidence = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    setOpen(true);
    window.setTimeout(() => {
      document.getElementById("evidence-log-area")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const selectedRing = isSelected
    ? "ring-2 ring-blue-500/80 border-blue-500 bg-blue-950/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
    : "border-slate-800";

  return (
    <div className={`overflow-hidden rounded-lg border bg-slate-950/50 transition-all ${selectedRing}`}>
      {/* Header row — clickable to expand */}
      <button
        type="button"
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
          isSelected ? "bg-blue-950/25 hover:bg-blue-950/35" : "hover:bg-slate-900/70"
        }`}
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
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400"
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

      {/* Action bar */}
      <div className={`flex flex-wrap items-center gap-1.5 border-t border-slate-800 px-4 py-2 ${
        isSelected ? "bg-blue-950/10" : "bg-slate-900/40"
      }`}>
        <button
          type="button"
          onClick={handleViewEvidence}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            isSelected
              ? "border border-blue-600/70 bg-blue-600 text-white hover:bg-blue-500"
              : "border border-blue-800/70 bg-blue-950/40 text-blue-200 hover:bg-blue-900/50"
          }`}
          title="Show details and evidence"
        >
          <Eye className="w-3 h-3" aria-hidden="true" />
          View Evidence
        </button>

        <button
          type="button"
          onClick={handleFilterLogs}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            isSelected
              ? "text-blue-200 hover:bg-blue-900/40"
              : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          }`}
          title="Filter log table to this finding's evidence"
        >
          <Table2 className="w-3 h-3" aria-hidden="true" />
          {isSelected ? "Evidence Active" : "Filter Table"}
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
          title="Copy finding summary to clipboard"
        >
          {copied
            ? <><Check className="w-3 h-3 text-green-400" /> Copied</>
            : <><Copy className="w-3 h-3" /> Copy Summary</>
          }
        </button>

        {finding.relatedLogs.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
            title="Export evidence as CSV"
          >
            <Download className="w-3 h-3" aria-hidden="true" />
            Export Evidence
          </button>
        )}
      </div>

      {/* Expanded description / recommendation */}
      {open && (
        <div className="space-y-3 border-t border-slate-800 bg-slate-900/40 px-4 pb-4 pt-3">
          <p className="text-xs leading-relaxed text-slate-300">{finding.description}</p>
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Recommendation
            </p>
            <p className="text-xs text-slate-200">{finding.recommendation}</p>
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
// Severity group
// ---------------------------------------------------------------------------

function SeverityGroup({
  severity,
  findings,
  selectedFindingId,
  onSelect,
  onFilterLogs,
}: {
  severity: Severity;
  findings: Finding[];
  selectedFindingId: string | null;
  onSelect: (id: string) => void;
  onFilterLogs: (id: string) => void;
}) {
  if (findings.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <SeverityBadge severity={severity} />
        <span className="text-xs text-zinc-500">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            isSelected={selectedFindingId === f.id}
            onSelect={() => onSelect(f.id)}
            onFilterLogs={() => onFilterLogs(f.id)}
          />
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
  const {
    findings,
    summary,
    selectedFindingId,
    setSelectedFindingId,
    clearSelectedFinding,
    selectedFinding,
  } = useLogContext();

  if (summary.total === 0) return null;

  const grouped = Object.fromEntries(
    SEVERITY_ORDER.map((sev) => [sev, findings.filter((f) => f.severity === sev)])
  ) as Record<Severity, Finding[]>;

  const headerRight = (
    <div className="flex items-center gap-3">
      {selectedFinding && (
        <button
          type="button"
          onClick={clearSelectedFinding}
          className="flex items-center gap-1.5 rounded border border-blue-800/70 bg-blue-950/40 px-2.5 py-1 text-[11px] font-medium text-blue-200 transition-colors hover:bg-blue-900/50"
          title="Clear finding filter and show all logs"
        >
          <XCircle className="w-3 h-3" aria-hidden="true" />
          Show All Logs
        </button>
      )}
      {findings.length > 0 && (
        <span className="text-xs text-zinc-400">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );

  return (
    <div id="security-findings" className="scroll-mt-4">
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
              selectedFindingId={selectedFindingId}
              onSelect={setSelectedFindingId}
              onFilterLogs={setSelectedFindingId}
            />
          ))}
        </div>
      )}
      </SectionCard>
    </div>
  );
}
