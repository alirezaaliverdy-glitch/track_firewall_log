import type { RawLogRow } from "@/types/log";
import type { ImportParseResult } from "@/types/import";
import { parseLogfmtLine } from "@/lib/parsers/logfmtParser";

const RFC3164_RE = /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/;
const ISO_RE = /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/;
const HOST_PROCESS_RE = /^(\S+)\s+([\w./-]+)(?:\[(\d+)\])?:\s*(.*)$/;

function parseSyslogLine(line: string): RawLogRow {
  const row: RawLogRow = {
    rawMessage: line,
    message: line,
  };
  let rest = line;

  const timestampMatch = rest.match(ISO_RE) ?? rest.match(RFC3164_RE);
  if (timestampMatch) {
    row.timestamp = timestampMatch[1];
    rest = timestampMatch[2];
  }

  const hostMatch = rest.match(HOST_PROCESS_RE);
  if (hostMatch) {
    row.host = hostMatch[1];
    row.process = hostMatch[2];
    if (hostMatch[3]) row.pid = hostMatch[3];
    rest = hostMatch[4];
  }

  row.message = rest || line;

  if (/\b[\w.-]+=/.test(rest)) {
    Object.assign(row, parseLogfmtLine(rest), { rawMessage: line });
    if (!row.message || row.message === rest) row.message = rest;
  }

  return row;
}

export function parseSyslogLog(text: string): ImportParseResult {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseSyslogLine);

  return { rows, warnings: [] };
}
