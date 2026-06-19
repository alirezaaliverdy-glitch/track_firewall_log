import React, { useRef, useState } from "react";
import { parseCSV } from "@/lib/csv";
import { useLogContext } from "@/context/LogContext";
import { Input } from "./ui/input";
import PrivacyNotice from "./upload/PrivacyNotice";

const ACCEPTED_MIME = ["text/csv", "application/vnd.ms-excel", "application/csv"];

function isCsvFile(file: File): boolean {
  const byExt  = file.name.toLowerCase().endsWith(".csv");
  const byMime = ACCEPTED_MIME.includes(file.type);
  return byExt || byMime;
}

type UploadState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "done"; fileName: string; rowCount: number }
  | { status: "error"; message: string };

import { AlertTriangle } from "lucide-react";

const SUPPORTED_VENDORS = [
  "FortiGate", "MikroTik", "pfSense", "Palo Alto", "Generic CSV",
];

export default function CsvUploader() {
  const {
    setRawData, resetData, summary, csvHeaders,
    detectedVendor, mappingConfidence,
  } = useLogContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isCsvFile(file)) {
      setUploadState({ status: "error", message: "Only CSV files are accepted." });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploadState({ status: "loading", fileName: file.name });

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        setUploadState({ status: "error", message: "Failed to read file." });
        return;
      }

      const { rows, errors } = parseCSV(text);

      if (rows.length === 0) {
        const msg =
          errors.length > 0
            ? `CSV parsed with errors and no valid rows. First error: ${errors[0].message}`
            : "The CSV file appears to be empty or has no data rows.";
        setUploadState({ status: "error", message: msg });
        return;
      }

      if (errors.length > 0) {
        // Non-fatal parse warnings — logged only, never surfaced as raw values
        console.warn(`CSV parsed with ${errors.length} non-fatal error(s):`, errors);
      }

      // setRawData also auto-detects column mapping and vendor
      setRawData(rows);
      setUploadState({ status: "done", fileName: file.name, rowCount: rows.length });
    };

    reader.onerror = () => {
      setUploadState({
        status: "error",
        message: "An error occurred while reading the file.",
      });
    };

    // Fully client-side — no server upload
    reader.readAsText(file);
  };

  const handleReset = () => {
    resetData();
    setUploadState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  if (summary.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-zinc-700 bg-zinc-900 mb-4">
        <h2 className="text-xl font-semibold text-zinc-200 mb-2">
          Start by uploading a firewall CSV
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Your logs stay in your browser. No file is uploaded to any server.
        </p>

        <label className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium
                           ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none
                           disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2 mb-4">
          <span className="mr-2">Upload CSV</span>
          <Input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            onChange={onFileChange}
            className="hidden"
            aria-label="Upload firewall log CSV file"
          />
        </label>

        <p className="text-xs text-zinc-500 mb-2">
          Supported examples: {SUPPORTED_VENDORS.join(", ")}
        </p>
        <p className="text-xs text-zinc-500 max-w-sm">
          Hint: CSV exports with Action, Source IP, Destination IP, Port, Bytes, or Packets work best.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-zinc-300 whitespace-nowrap">Upload CSV:</span>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              onChange={onFileChange}
              className="text-sm"
              aria-label="Upload firewall log CSV file"
            />
          </label>
          {uploadState.status === "done" && (
            <span className="text-sm text-zinc-400">
              File: <span className="font-medium">{uploadState.fileName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {uploadState.status === "done" && (
            <span className="text-sm text-zinc-400">
              Rows: <span className="font-medium">{summary.total.toLocaleString()}</span>
            </span>
          )}
          {detectedVendor && (
            <span className="text-sm text-zinc-400">
              Vendor: <span className="font-medium">{detectedVendor}</span>
            </span>
          )}
          {summary.total > 0 && (
            <span className="text-sm text-zinc-400">
              Mapping: <span className={`font-medium ${confidenceColor(mappingConfidence.score)}`}>{mappingConfidence.score}%</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            aria-label="Clear uploaded data and reset to sample logs"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Status line */}
      <div className="mt-2 min-h-[1.25rem]">
        {uploadState.status === "loading" && (
          <p className="text-xs text-zinc-400" role="status" aria-live="polite">
            <span className="inline-block animate-pulse mr-1">⏳</span>
            Parsing {uploadState.fileName}…
          </p>
        )}

        {uploadState.status === "error" && (
          <p className="flex items-start gap-2 text-xs text-red-400" role="alert" aria-live="assertive">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{uploadState.message}</span>
          </p>
        )}

        {uploadState.status === "done" && csvHeaders.length === 0 && (
          <p className="flex items-start gap-2 text-xs text-yellow-400" role="status">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Uploaded CSV has no detectable headers. Check file format.</span>
          </p>
        )}
      </div>

      <PrivacyNotice />
    </div>
  );



function confidenceColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}


}
