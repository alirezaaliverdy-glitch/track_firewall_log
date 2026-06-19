import React, { useRef, useState } from "react";
import { AlertTriangle, CheckCircle, FileText, RefreshCw, Upload } from "lucide-react";
import { importFirewallFile } from "@/lib/importer";
import { useLogContext } from "@/context/LogContext";
import { Input } from "./ui/input";
import PrivacyNotice from "./upload/PrivacyNotice";

const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt", ".log", ".json", ".ndjson"];
const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_EXTENSIONS,
  "text/csv",
  "text/tab-separated-values",
  "text/plain",
  "application/json",
  "application/x-ndjson",
].join(",");

const SUPPORTED_FORMATS = ["CSV", "TSV", "TXT", "LOG", "JSON", "NDJSON"];
const SUPPORTED_VENDORS = [
  "FortiGate",
  "MikroTik",
  "pfSense",
  "Palo Alto",
  "Sophos",
  "Cisco ASA",
  "Generic logs",
];

type UploadState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "done"; fileName: string; rowCount: number }
  | { status: "error"; message: string };

function isSupportedFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function confidenceColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  return "text-red-400";
}

export default function CsvUploader() {
  const {
    setRawData,
    resetData,
    summary,
    csvHeaders,
    detectedVendor,
    mappingConfidence,
  } = useLogContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupportedFile(file)) {
      setUploadState({
        status: "error",
        message: "Unsupported file type. Use CSV, TSV, TXT, LOG, JSON, or NDJSON.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploadState({ status: "loading", fileName: file.name });

    importFirewallFile(file)
      .then((rows) => {
        if (rows.length === 0) {
          setUploadState({
            status: "error",
            message: "The log file appears to be empty or has no valid rows.",
          });
          return;
        }

        setRawData(rows);
        setUploadState({ status: "done", fileName: file.name, rowCount: rows.length });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to import log file.";
        setUploadState({ status: "error", message });
      });
  };

  const handleReset = () => {
    resetData();
    setUploadState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  if (summary.total === 0) {
    return (
      <div className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-5 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-blue-700/60 bg-blue-950/50 text-blue-300">
              <Upload className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Import firewall logs
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Upload a log export to analyze traffic, findings, and evidence. Logs stay in your browser.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUPPORTED_FORMATS.map((format) => (
                  <span key={format} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                    {format}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Supported vendors: {SUPPORTED_VENDORS.join(", ")}
              </p>
            </div>
          </div>

        <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-within:ring-2 focus-within:ring-blue-500/50 md:flex-shrink-0">
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>Choose log file</span>
          <Input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={onFileChange}
            className="hidden"
            aria-label="Upload firewall log file"
          />
        </label>
        </div>
      </div>
    );
  }

  return (
      <div className="mb-4 rounded-lg border border-blue-900/50 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-blue-800/70 bg-blue-950/40 px-3 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-900/50">
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span className="whitespace-nowrap">Choose log file</span>
            <Input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              onChange={onFileChange}
              className="hidden"
              aria-label="Upload firewall log file"
            />
          </label>
          {uploadState.status === "done" && (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-zinc-300">
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-blue-400" aria-hidden="true" />
              <span className="truncate">
                Loaded <span className="font-medium text-zinc-100">{uploadState.fileName}</span>
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {uploadState.status === "done" && (
            <span className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400">
              <FileText className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              <span>{summary.total.toLocaleString()} rows</span>
            </span>
          )}
          {detectedVendor && (
            <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400">
              Vendor <span className="font-medium text-zinc-200">{detectedVendor}</span>
            </span>
          )}
          {summary.total > 0 && (
            <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400">
              Mapping{" "}
              <span className={`font-medium ${confidenceColor(mappingConfidence.score)}`}>
                {mappingConfidence.score}%
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-blue-800/70 hover:text-blue-200"
            aria-label="Clear uploaded data and reset to sample logs"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      <div className="mt-2 min-h-[1.25rem]">
        {uploadState.status === "loading" && (
          <p className="text-xs text-zinc-400" role="status" aria-live="polite">
            <span className="inline-block animate-pulse mr-1">...</span>
            Parsing {uploadState.fileName}...
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
            <span>Uploaded log file has no detectable headers. Check file format or mapping.</span>
          </p>
        )}
      </div>

      <PrivacyNotice />
    </div>
  );
}
