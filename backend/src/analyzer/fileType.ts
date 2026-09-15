import type { ImportedFileType } from "./types.js";

const LOGFMT_PAIR_RE = /\b[\w.-]+=(?:"[^"]*"|\S+)/g;
const RFC3164_RE = /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+/;
const ISO_SYSLOG_RE = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s+\S+/;
const HOST_PROCESS_RE = /^\S+\s+[\w./-]+(?:\[\d+\])?:\s+/;

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? "";
}

function sampleLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function looksLikeLogfmt(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const matching = lines.filter((line) => (line.match(LOGFMT_PAIR_RE) ?? []).length >= 3);
  return matching.length / lines.length >= 0.4;
}

function looksLikeSyslog(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const matching = lines.filter((line) => {
    if (RFC3164_RE.test(line) || ISO_SYSLOG_RE.test(line)) return true;
    const withoutTimestamp = line.replace(RFC3164_RE, "").replace(ISO_SYSLOG_RE, "");
    return HOST_PROCESS_RE.test(withoutTimestamp);
  });
  return matching.length / lines.length >= 0.35;
}

export function detectFileType(fileName: string, content: string): ImportedFileType {
  const ext = extensionOf(fileName);
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "json") return "json";
  if (ext === "ndjson") return "ndjson";

  const lines = sampleLines(content);

  if (ext === "log" || ext === "txt" || ext === "") {
    if (looksLikeLogfmt(lines)) return "logfmt";
    if (looksLikeSyslog(lines)) return "syslog";
    return ext === "" ? "unknown" : "text";
  }

  if (looksLikeLogfmt(lines)) return "logfmt";
  if (looksLikeSyslog(lines)) return "syslog";
  return "unknown";
}
