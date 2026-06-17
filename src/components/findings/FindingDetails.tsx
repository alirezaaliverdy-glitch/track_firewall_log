import { useState } from "react";
import {
  X,
  Copy,
  Check,
  Download,
  FileDown,
  ExternalLink,
} from "lucide-react";
import { useLogContext } from "@/context/LogContext";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import {
  getAffectedSrcIps,
  getAffectedDstIps,
  getAffectedDstPorts,
  getSampleEvidenceLogs,
  getFindingSummaryText,
  copyToClipboard,
} from "@/lib/findingUtils";
import { exportFindingEvidence, exportFindingJson } from "@/lib/exportUtils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] text-zinc-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-xs text-zinc-200 break-all">{value}</span>
    </div>
  );
}

function TagList({ items, emptyText }: { items: (string | number)[]; emptyText?: string }) {
  if (items.length === 0) {
    return <span className="text-xs text-zinc-600">{emptyText ?? "None detected"}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={String(item)}
          className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-zinc-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function SampleLogRow({ log }: { log: import("@/types/log").NormalizedLog }) {
  return (
    <div className="rounded border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-[11px] font-mono text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
      {log.timestamp && <span>{log.timestamp}</span>}
      {log.action && (
        <span
          className={
            log.action === "allow" ? "text-green-400" :
            log.action === "deny"  ? "text-red-400" :
            log.action === "drop"  ? "text-orange-400" :
            "text-zinc-300"
          }
        >
          {log.action}
        </span>
      )}
      {log.srcIp   && <span>{log.srcIp}{log.srcPort !== undefined ? `:${log.srcPort}` : ""}</span>}
      {log.dstIp   && <span>→ {log.dstIp}{log.dstPort !== undefined ? `:${log.dstPort}` : ""}</span>}
      {log.protocol && <span className="uppercase">{log.protocol}</span>}
      {log.bytes   !== undefined && <span>{log.bytes.toLocaleString()} B</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FindingDetails() {
  const { selectedFinding, clearSelectedFinding } = useLogContext();
  const [copied, setCopied] = useState(false);

  if (!selectedFinding) return null;

  const f = selectedFinding;
  const srcIps   = getAffectedSrcIps(f);
  const dstIps   = getAffectedDstIps(f);
  const dstPorts = getAffectedDstPorts(f);
  const samples  = getSampleEvidenceLogs(f, 5);

  const handleCopy = async () => {
    const ok = await copyToClipboard(getFindingSummaryText(f));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900 mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-3.5 border-b border-zinc-700/60 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={f.severity} />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{f.type}</span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="text-[10px] text-zinc-500">
              {f.count} event{f.count !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">{f.title}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy finding summary to clipboard"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {copied
              ? <><Check className="w-3 h-3 text-green-400" /> Copied</>
              : <><Copy className="w-3 h-3" /> Copy</>
            }
          </button>
          <button
            type="button"
            onClick={() => exportFindingEvidence(f)}
            title="Export evidence logs as CSV"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            type="button"
            onClick={() => exportFindingJson(f)}
            title="Export finding as JSON"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <FileDown className="w-3 h-3" /> JSON
          </button>
          <button
            type="button"
            onClick={clearSelectedFinding}
            title="Close details panel"
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Close finding details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* Meta */}
        <div className="space-y-1.5">
          {f.mitreTactic && (
            <DetailRow label="MITRE Tactic" value={f.mitreTactic} />
          )}
          {f.mitreTechnique && (
            <DetailRow label="Technique" value={f.mitreTechnique} />
          )}
        </div>

        {/* Description */}
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
            Description
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed">{f.description}</p>
        </div>

        {/* Recommendation */}
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
            Recommendation
          </p>
          <p className="text-xs text-zinc-200 leading-relaxed">{f.recommendation}</p>
        </div>

        {/* Evidence summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Source IPs
            </p>
            <TagList
              items={srcIps}
              emptyText="Not available"
            />
            {f.relatedLogs.length > 0 &&
              new Set(f.relatedLogs.map((l) => l.srcIp).filter(Boolean)).size > 10 && (
              <p className="text-[10px] text-zinc-600 mt-1">
                +{new Set(f.relatedLogs.map((l) => l.srcIp).filter(Boolean)).size - 10} more
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Destination IPs
            </p>
            <TagList
              items={dstIps}
              emptyText="Not available"
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Destination Ports
            </p>
            <TagList
              items={dstPorts}
              emptyText="Not available"
            />
          </div>
        </div>

        {/* Sample logs */}
        {samples.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                Sample Evidence ({samples.length} of {f.relatedLogs.length})
              </p>
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                Full list in table below
              </span>
            </div>
            <div className="space-y-1.5">
              {samples.map((log, i) => (
                <SampleLogRow key={i} log={log} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
