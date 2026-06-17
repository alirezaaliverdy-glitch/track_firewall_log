import { sanitizeCsvCell } from "@/lib/sanitize";
import type { NormalizedLog } from "@/types/log";
import type { Finding } from "@/types/finding";
import type { LogSummary } from "@/lib/analytics";
import type { DataQualityResult } from "@/lib/dataQuality";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Trigger a browser file download using a Blob.
 * Fully client-side — no network request is made.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Append, click, and clean up synchronously to avoid popup blockers
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a short tick so the download has time to start
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/**
 * Serialise `data` as pretty-printed JSON and download it.
 * No server upload. No eval. No dangerouslySetInnerHTML.
 */
export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Convert an array of plain objects to a CSV string and download it.
 *
 * - Headers are derived from the keys of the first row.
 * - Every cell is passed through sanitizeCsvCell to prevent formula injection.
 * - Rows with no data are skipped.
 */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(sanitizeCsvCell).join(",");

  const dataLines = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h])).join(",")
  );

  const csv = [headerLine, ...dataLines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

// ---------------------------------------------------------------------------
// Domain-specific export helpers
// ---------------------------------------------------------------------------

/** Export security findings as JSON. relatedLogs are stripped to avoid huge files. */
export function exportFindings(findings: Finding[]): void {
  const payload = findings.map((f) => ({
    id:              f.id,
    type:            f.type,
    severity:        f.severity,
    title:           f.title,
    description:     f.description,
    recommendation:  f.recommendation,
    count:           f.count,
    mitreTactic:     f.mitreTactic,
    mitreTechnique:  f.mitreTechnique,
  }));
  downloadJson(`findings-${timestamp()}.json`, payload);
}

/** Export summary + dataQuality as a single JSON report. */
export function exportSummary(
  summary: LogSummary,
  dataQuality: DataQualityResult,
  hygieneScore: number
): void {
  downloadJson(`summary-${timestamp()}.json`, {
    exportedAt: new Date().toISOString(),
    hygieneScore,
    summary,
    dataQuality,
  });
}

/**
 * Export the currently filtered normalized logs as CSV.
 * Each row is the flat normalized fields (no raw sub-object).
 * All values are sanitized before writing.
 */
export function exportFilteredLogs(logs: NormalizedLog[]): void {
  const rows = logs.map((l) => ({
    timestamp:        l.timestamp  ?? "",
    date:             l.date       ?? "",
    time:             l.time       ?? "",
    action:           l.action     ?? "",
    protocol:         l.protocol   ?? "",
    srcIp:            l.srcIp      ?? "",
    srcPort:          l.srcPort    ?? "",
    dstIp:            l.dstIp      ?? "",
    dstPort:          l.dstPort    ?? "",
    natSrcPort:       l.natSrcPort ?? "",
    natDstPort:       l.natDstPort ?? "",
    bytes:            l.bytes      ?? "",
    bytesSent:        l.bytesSent  ?? "",
    bytesReceived:    l.bytesReceived ?? "",
    packets:          l.packets    ?? "",
    packetsSent:      l.packetsSent ?? "",
    packetsReceived:  l.packetsReceived ?? "",
    service:          l.service    ?? "",
    application:      l.application ?? "",
    ruleName:         l.ruleName   ?? "",
    user:             l.user       ?? "",
    message:          l.message    ?? "",
    vendor:           l.vendor,
  }));
  downloadCsv(`filtered-logs-${timestamp()}.csv`, rows);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
