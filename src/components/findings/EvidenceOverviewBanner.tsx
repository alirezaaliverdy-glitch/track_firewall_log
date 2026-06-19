import { ArrowDown, List, XCircle } from "lucide-react";
import { useLogContext } from "@/context/LogContext";

export default function EvidenceOverviewBanner() {
  const { selectedFinding, evidenceLogs, logs, clearSelectedFinding, setSearch } = useLogContext();

  if (!selectedFinding) return null;

  const clearEvidence = () => {
    clearSelectedFinding();
    setSearch("");
  };

  const scrollToLogs = () => {
    document.getElementById("evidence-log-area")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="mb-4 rounded-lg border border-blue-700/60 bg-blue-950/30 px-4 py-3 shadow-[inset_0_1px_0_rgba(59,130,246,0.12)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-blue-100">
            <span className="font-semibold">Evidence view:</span>{" "}
            {selectedFinding.title}
          </p>
          <p className="mt-1 text-xs text-blue-300/80">
            Charts still show the full imported dataset. The log table below is filtered to {evidenceLogs.length.toLocaleString()} related row{evidenceLogs.length !== 1 ? "s" : ""} from {logs.length.toLocaleString()} total.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={scrollToLogs}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/70 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            Go to Evidence Logs
          </button>
          <button
            type="button"
            onClick={clearEvidence}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-blue-700/60 hover:text-blue-200"
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            Show All Logs
          </button>
          <button
            type="button"
            onClick={clearEvidence}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-blue-700/60 hover:text-blue-200"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Clear Evidence Filter
          </button>
        </div>
      </div>
    </div>
  );
}
