import { useLogContext } from "@/context/LogContext";
import {
  exportFindings,
  exportSummary,
  exportFilteredLogs,
} from "@/lib/exportUtils";

export default function ExportButtons() {
  const { summary, dataQuality, findings, filteredLogs, hygieneScore } =
    useLogContext();

  // Don't render until there is data to export
  if (summary.total === 0) return null;

  const btnBase =
    "px-3 py-1.5 rounded text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";
  const btnSecondary =
    `${btnBase} border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700`;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs text-zinc-500 mr-1">Export:</span>

      <button
        type="button"
        className={btnSecondary}
        onClick={() => exportSummary(summary, dataQuality, hygieneScore)}
        title="Download summary analytics and data quality as JSON"
      >
        Summary JSON
      </button>

      <button
        type="button"
        className={btnSecondary}
        onClick={() => exportFindings(findings)}
        disabled={findings.length === 0}
        title={
          findings.length === 0
            ? "No findings to export"
            : `Export ${findings.length} finding${findings.length !== 1 ? "s" : ""} as JSON`
        }
      >
        Findings JSON
        {findings.length > 0 && (
          <span className="ml-1 text-zinc-400">({findings.length})</span>
        )}
      </button>

      <button
        type="button"
        className={btnSecondary}
        onClick={() => exportFilteredLogs(filteredLogs)}
        title={`Export ${filteredLogs.length} filtered log row${filteredLogs.length !== 1 ? "s" : ""} as CSV`}
      >
        Filtered Logs CSV
        <span className="ml-1 text-zinc-400">({filteredLogs.length})</span>
      </button>
    </div>
  );
}
