import Papa from "papaparse";
import type { RawLogRow } from "@/types/log";

export interface ParseResult {
  rows: RawLogRow[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

/**
 * Parse a CSV string using PapaParse.
 *
 * Handles:
 *  - Headers (first row)
 *  - Quoted fields and commas inside quotes
 *  - Empty lines (skipped)
 *  - Malformed rows (collected in errors, never throws)
 *  - Leading/trailing whitespace on header names
 *
 * All field values are returned as strings — no automatic type coercion —
 * so downstream consumers can decide how to interpret them.
 * Treat every value as untrusted input.
 */
export function parseCSV(csvText: string): ParseResult {
  const result = Papa.parse<RawLogRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    // Trim whitespace from header names so column lookups are reliable
    transformHeader: (h: string) => h.trim(),
    // Keep values as strings — no automatic type coercion.
    // Downstream consumers decide how to interpret each field.
    dynamicTyping: false,
  });

  return {
    rows: result.data,
    errors: result.errors,
    meta: result.meta,
  };
}
