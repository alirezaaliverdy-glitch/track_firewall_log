import type { RawLogRow } from "@/types/log";
import type { ImportParseResult } from "@/types/import";

function readQuotedValue(line: string, start: number): { value: string; next: number } {
  let value = "";
  let i = start + 1;

  while (i < line.length) {
    const char = line[i];
    if (char === "\\" && i + 1 < line.length) {
      value += line[i + 1];
      i += 2;
      continue;
    }
    if (char === "\"") {
      return { value, next: i + 1 };
    }
    value += char;
    i += 1;
  }

  return { value, next: i };
}

export function parseLogfmtLine(line: string): RawLogRow {
  const row: RawLogRow = {
    rawMessage: line,
  };
  let i = 0;

  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i += 1;

    const keyStart = i;
    while (i < line.length && /[\w.-]/.test(line[i])) i += 1;
    const key = line.slice(keyStart, i);

    if (!key || line[i] !== "=") {
      while (i < line.length && !/\s/.test(line[i])) i += 1;
      continue;
    }

    i += 1;
    if (line[i] === "\"") {
      const quoted = readQuotedValue(line, i);
      row[key] = quoted.value;
      i = quoted.next;
    } else {
      const valueStart = i;
      while (i < line.length && !/\s/.test(line[i])) i += 1;
      row[key] = line.slice(valueStart, i);
    }
  }

  if (row.msg && row.message === undefined) row.message = row.msg;
  return row;
}

export function parseLogfmtLog(text: string): ImportParseResult {
  const rows: RawLogRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const row = parseLogfmtLine(trimmed);
    if (Object.keys(row).length > 1) {
      rows.push(row);
    } else {
      rows.push({ rawMessage: trimmed, message: trimmed });
    }
  }

  return { rows, warnings: [] };
}
