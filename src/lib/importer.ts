import type { RawLogRow } from "@/types/log";
import { FirewallImportError } from "@/types/import";
import { detectFileType } from "@/lib/fileType";
import { parseDelimitedLog } from "@/lib/parsers/csvParser";
import { parseJsonLog, parseNdjsonLog } from "@/lib/parsers/jsonParser";
import { parseLogfmtLog } from "@/lib/parsers/logfmtParser";
import { parseSyslogLog } from "@/lib/parsers/syslogParser";
import { logRuntimeWarning } from "@/lib/runtimeLogging";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") resolve(text);
      else reject(new FirewallImportError("Failed to read file as text."));
    };
    reader.onerror = () => reject(new FirewallImportError("An error occurred while reading the file."));
    reader.readAsText(file);
  });
}

function parsePlainText(text: string): RawLogRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ rawMessage: line, message: line }));
}

export async function importFirewallFile(file: File): Promise<RawLogRow[]> {
  const content = await readFileAsText(file);
  const fileType = detectFileType(file.name, content);

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

    if (result.rows.length === 0) {
      const firstWarning = result.warnings[0]?.message;
      throw new FirewallImportError(firstWarning ?? "No valid firewall log rows were found.");
    }

    if (result.warnings.length > 0) {
      logRuntimeWarning("Firewall import warnings", result.warnings);
    }

    return result.rows;
  } catch (error) {
    if (error instanceof FirewallImportError) throw error;
    const message = error instanceof Error ? error.message : "Unknown import error.";
    throw new FirewallImportError(`Could not parse ${file.name}: ${message}`);
  }
}
