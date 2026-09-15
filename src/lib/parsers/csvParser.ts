import Papa from "papaparse";
import type { RawLogRow } from "@/types/log";
import type { ImportParseResult } from "@/types/import";

export type DelimitedParseOptions = {
  delimiter?: "," | ";" | "\t";
};

function isEmptyRow(row: RawLogRow): boolean {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

export function parseDelimitedLog(
  text: string,
  options: DelimitedParseOptions = {}
): ImportParseResult {
  const result = Papa.parse<RawLogRow>(text, {
    header: true,
    delimiter: options.delimiter,
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    dynamicTyping: false,
  });

  return {
    rows: result.data.filter((row) => !isEmptyRow(row)),
    warnings: result.errors.map((error) => ({
      line: error.row === undefined ? undefined : error.row + 1,
      message: error.message,
    })),
  };
}
