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
import { getRiskyPort } from "@/lib/riskyPorts";
import type { Finding, Severity } from "@/types/finding";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

type PortFindingSummary = {
  port?: number;
  service?: string;
  actionContext: "Allowed" | "Blocked" | "Mixed";
};

function titleCase(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function getPortSummary(finding: Finding): PortFindingSummary {
  const port = finding.relatedLogs.find((log) => log.dstPort !== undefined)?.dstPort;
  const riskyPort = port !== undefined ? getRiskyPort(port) : undefined;
  const service = riskyPort?.service ?? finding.relatedLogs.find((log) => log.service)?.service;

  const actions = new Set(
    finding.relatedLogs
      .map((log) => log.action?.toLowerCase())
      .filter((action): action is string => action !== undefined)
  );
  const allowed = ["allow", "accept", "pass", "permit"].some((action) => actions.has(action));
  const blocked = ["deny", "drop", "block"].some((action) => actions.has(action));

  return {
    port,
    service,
    actionContext: allowed && blocked ? "Mixed" : allowed ? "Allowed" : blocked ? "Blocked" : "Mixed",
  };
}

function isPortFinding(finding: Finding, port?: number): port is number {
  return port !== undefined && (
    finding.type.includes("risk") ||
    finding.type.includes("port") ||
    getRiskyPort(port) !== undefined
  );
}

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
  const portSummary = getPortSummary(finding);
  const showPortFirst = isPortFinding(finding, portSummary.port);

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
      document.getElementById("analysis-overview")?.scrollIntoView({
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
      <button
        type="button"
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
          isSelected ? "bg-blue-950/25 hover:bg-blue-950/35" : "hover:bg-slate-900/70"
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {!showPortFirst && <SeverityDot severity={finding.severity} />}

        <div className="min-w-0 flex-1">
          {showPortFirst ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">Port</p>
                    <p className="font-mono text-3xl font-bold leading-none text-blue-100">
                      {portSummary.port}
                    </p>
                  </div>
                  <div className="pb-0.5">
                    <p className="text-sm font-semibold text-slate-100">
                      {portSummary.service ?? "Sensitive service"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {titleCase(finding.severity)} Risk · {finding.count} event{finding.count !== 1 ? "s" : ""} · {portSummary.actionContext}
                    </p>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">
                  Recommendation: {finding.recommendation}
                </p>
              </div>
              <SeverityBadge severity={finding.severity} />
            </div>
          ) : (
            <>
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <SeverityBadge severity={finding.severity} />
                <span className="text-xs text-slate-500">
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
              <p className="text-sm font-medium leading-snug text-slate-100">
                {finding.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Recommendation: {finding.recommendation}
              </p>
            </>
          )}
        </div>

        <span className="mt-0.5 flex-shrink-0 text-slate-500">
          {open
            ? <ChevronDown className="w-4 h-4" aria-hidden="true" />
            : <ChevronRight className="w-4 h-4" aria-hidden="true" />
          }
        </span>
      </button>

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
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
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
            <p className="text-[11px] text-slate-500">
              <span className="font-medium text-slate-400">Technique: </span>
              {finding.mitreTechnique}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
        <span className="text-xs text-slate-500">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {findings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            isSelected={selectedFindingId === finding.id}
            onSelect={() => onSelect(finding.id)}
            onFilterLogs={() => onFilterLogs(finding.id)}
          />
        ))}
      </div>
    </div>
  );
}

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
    SEVERITY_ORDER.map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity),
    ])
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
        <span className="text-xs text-slate-400">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );

  return (
    <div id="security-findings" className="scroll-mt-4">
      <SectionCard title="Security Findings" subtitle="Prioritized findings with port-first risky service context" headerRight={headerRight}>
        {findings.length === 0 ? (
          <EmptyState
            compact
            title="No major security findings detected"
            description="Based on the available fields in the uploaded log."
          />
        ) : (
          <div className="space-y-5">
            {SEVERITY_ORDER.map((severity) => (
              <SeverityGroup
                key={severity}
                severity={severity}
                findings={grouped[severity]}
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
