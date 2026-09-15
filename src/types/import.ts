import type { RawLogRow } from "@/types/log";

export type ImportedFileType =
  | "csv"
  | "tsv"
  | "json"
  | "ndjson"
  | "logfmt"
  | "syslog"
  | "text"
  | "unknown";

export type ImportWarning = {
  line?: number;
  message: string;
};

export type ImportParseResult = {
  rows: RawLogRow[];
  warnings: ImportWarning[];
};

export class FirewallImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirewallImportError";
  }
}
