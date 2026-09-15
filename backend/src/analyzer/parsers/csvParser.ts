import type { ImportParseResult, ImportWarning, RawLogRow } from "../types.js";

export type DelimitedParseOptions = {
  delimiter?: "," | ";" | "\t";
};

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      value += "\"";
      i += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value.trim());
  return values;
}

function guessDelimiter(text: string, fallback?: string): string {
  if (fallback) return fallback;
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  const counts = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: parseDelimitedLine(firstLine, delimiter).length
  }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function isEmptyRow(row: RawLogRow): boolean {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

export function parseDelimitedLog(text: string, options: DelimitedParseOptions = {}): ImportParseResult {
  const warnings: ImportWarning[] = [];
  const delimiter = guessDelimiter(text, options.delimiter);
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return { rows: [], warnings: [{ message: "Delimited file is empty." }] };
  }

  const headers = parseDelimitedLine(headerLine, delimiter).map((header) => header.trim());

  if (headers.length === 0 || headers.every((header) => header === "")) {
    return { rows: [], warnings: [{ message: "Delimited file has no usable headers." }] };
  }

  const rows = dataLines
    .map((line, index) => {
      const values = parseDelimitedLine(line, delimiter);
      if (values.length !== headers.length && warnings.length < 20) {
        warnings.push({
          line: index + 2,
          message: `Expected ${headers.length} columns but found ${values.length}.`
        });
      }

      const row: RawLogRow = {};
      headers.forEach((header, columnIndex) => {
        if (!header) return;
        row[header] = values[columnIndex] ?? "";
      });
      return row;
    })
    .filter((row) => !isEmptyRow(row));

  return { rows, warnings };
}
