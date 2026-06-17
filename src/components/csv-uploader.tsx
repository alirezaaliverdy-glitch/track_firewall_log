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

export default function CsvUploader() {
  const { setRawData, resetData, summary } = useLogContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const isDataLoaded = summary.total > 0;

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

      setRawData(rows);
      setUploadState({ status: "done", fileName: file.name, rowCount: rows.length });
    };

    reader.onerror = () => {
      setUploadState({ status: "error", message: "An error occurred while reading the file." });
    };

    // Fully client-side — no server upload
    reader.readAsText(file);
  };

  const handleReset = () => {
    resetData();
    setUploadState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3">
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

        {isDataLoaded && (
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
            aria-label="Clear uploaded data and reset to sample logs"
          >
            Reset
          </button>
        )}
      </div>

      {/* Status line */}
      <div className="mt-2 min-h-[1.25rem]">
        {uploadState.status === "loading" && (
          <p className="text-xs text-zinc-400" role="status" aria-live="polite">
            <span className="inline-block animate-pulse mr-1">⏳</span>
            Parsing {uploadState.fileName}…
          </p>
        )}

        {uploadState.status === "done" && (
          <p className="text-xs text-green-400" role="status" aria-live="polite">
            ✓ Loaded {uploadState.rowCount.toLocaleString()} rows from{" "}
            <span className="font-medium">{uploadState.fileName}</span>
          </p>
        )}

        {uploadState.status === "error" && (
          <p className="text-xs text-red-400" role="alert" aria-live="assertive">
            {uploadState.message}
          </p>
        )}
      </div>

      <PrivacyNotice />
    </div>
  );
}
