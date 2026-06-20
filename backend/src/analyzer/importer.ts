import fs from "node:fs/promises";
import type { ImportParseResult, RawLogRow } from "./types.js";
import { detectFileType } from "./fileType.js";
import { parseDelimitedLog } from "./parsers/csvParser.js";
import { parseJsonLog, parseNdjsonLog } from "./parsers/jsonParser.js";
import { parseLogfmtLog } from "./parsers/logfmtParser.js";
import { parseSyslogLog } from "./parsers/syslogParser.js";

function parsePlainText(text: string): RawLogRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ rawMessage: line, message: line }));
}

function capWarnings(result: ImportParseResult): ImportParseResult {
  return {
    rows: result.rows,
    warnings: result.warnings.slice(0, 20)
  };
}

export async function importFirewallFile(filePath: string, fileName: string): Promise<ImportParseResult & { detectedFileType: string }> {
  const content = await fs.readFile(filePath, "utf8");
  const fileType = detectFileType(fileName, content);

  try {
    const result =
      fileType === "csv" ? parseDelimitedLog(content) :
      fileType === "tsv" ? parseDelimitedLog(content, { delimiter: "\t" }) :
      fileType === "json" ? parseJsonLog(content) :
      fileType === "ndjson" ? parseNdjsonLog(content) :
      fileType === "logfmt" ? parseLogfmtLog(content) :
      fileType === "syslog" ? parseSyslogLog(content) :
      fileType === "text" ? { rows: parsePlainText(content), warnings: [] } :
      { rows: [], warnings: [{ message: "Unsupported or unrecognized log file format." }] };

    return { ...capWarnings(result), detectedFileType: fileType };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error.";
    return {
      rows: [],
      warnings: [{ message: `Could not parse ${fileName}: ${message}` }],
      detectedFileType: fileType
    };
  }
}
