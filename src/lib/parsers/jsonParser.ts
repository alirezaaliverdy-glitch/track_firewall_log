import type { RawLogRow } from "@/types/log";
import type { ImportParseResult, ImportWarning } from "@/types/import";

function toRawValue(value: unknown): RawLogRow[string] {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function objectToRow(value: unknown): RawLogRow | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row: RawLogRow = {};
  for (const [key, rawValue] of Object.entries(value)) {
    row[key] = toRawValue(rawValue);
  }
  return row;
}

export function parseJsonLog(text: string): ImportParseResult {
  const parsed = JSON.parse(text) as unknown;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const rows = values
    .map(objectToRow)
    .filter((row): row is RawLogRow => row !== undefined);

  return {
    rows,
    warnings:
      rows.length === values.length
        ? []
        : [{ message: "Some JSON entries were not objects and were skipped." }],
  };
}

export function parseNdjsonLog(text: string): ImportParseResult {
  const rows: RawLogRow[] = [];
  const warnings: ImportWarning[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const row = objectToRow(JSON.parse(trimmed) as unknown);
      if (row) {
        rows.push(row);
      } else {
        warnings.push({
          line: index + 1,
          message: "NDJSON line was valid JSON but not an object.",
        });
      }
    } catch {
      warnings.push({
        line: index + 1,
        message: "Invalid JSON line skipped.",
      });
    }
  });

  return { rows, warnings };
}
