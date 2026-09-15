import { Shield } from "lucide-react";
import CsvUploader from "@/components/csv-uploader";
import ExportButtons from "@/components/export/ExportButtons";

/**
 * Top-of-page app shell header.
 * Contains branding, subtitle, upload controls, and export actions.
 */
export default function AppHeader() {
  return (
    <header className="border-b border-zinc-700/60 bg-zinc-950 sticky top-0 z-20">
      {/* Branding row */}
      <div className="max-w-screen-2xl mx-auto px-5 py-3 flex items-center gap-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex-shrink-0">
          <Shield className="w-4 h-4 text-blue-400" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-zinc-100 leading-none">
            Firewall Log Analyzer
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-none">
            Turn firewall logs into actionable security findings
          </p>
        </div>

        {/* Privacy badge */}
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800/60 text-[10px] text-zinc-400 font-medium flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
          Client-side processing
        </span>
      </div>

      {/* Upload / export toolbar */}
      <div className="max-w-screen-2xl mx-auto px-5 pb-3">
        <CsvUploader />
        <ExportButtons />
      </div>
    </header>
  );
}
