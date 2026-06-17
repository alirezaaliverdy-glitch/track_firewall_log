import { sanitizeCsvCell } from "@/lib/sanitize";
import type { NormalizedLog } from "@/types/log";
import type { Finding } from "@/types/finding";
import type { LogSummary } from "@/lib/analytics";
import type { DataQualityResult } from "@/lib/dataQuality";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ---------------------------------------------------------------------------
// Generic primitives
// ---------------------------------------------------------------------------

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

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
// Domain exports
// ---------------------------------------------------------------------------

/** Flat normalized log row for CSV — no raw sub-object. */
function flattenLog(l: NormalizedLog): Record<string, unknown> {
  return {
    timestamp:       l.timestamp       ?? "",
    date:            l.date            ?? "",
    time:            l.time            ?? "",
    action:          l.action          ?? "",
    protocol:        l.protocol        ?? "",
    srcIp:           l.srcIp           ?? "",
    srcPort:         l.srcPort         ?? "",
    dstIp:           l.dstIp           ?? "",
    dstPort:         l.dstPort         ?? "",
    natSrcPort:      l.natSrcPort      ?? "",
    natDstPort:      l.natDstPort      ?? "",
    bytes:           l.bytes           ?? "",
    bytesSent:       l.bytesSent       ?? "",
    bytesReceived:   l.bytesReceived   ?? "",
    packets:         l.packets         ?? "",
    packetsSent:     l.packetsSent     ?? "",
    packetsReceived: l.packetsReceived ?? "",
    service:         l.service         ?? "",
    application:     l.application     ?? "",
    ruleName:        l.ruleName        ?? "",
    user:            l.user            ?? "",
    message:         l.message         ?? "",
    vendor:          l.vendor,
  };
}

export function exportFindings(findings: Finding[]): void {
  const payload = findings.map((f) => ({
    id:             f.id,
    type:           f.type,
    severity:       f.severity,
    title:          f.title,
    description:    f.description,
    recommendation: f.recommendation,
    count:          f.count,
    mitreTactic:    f.mitreTactic,
    mitreTechnique: f.mitreTechnique,
  }));
  downloadJson(`findings-${timestamp()}.json`, payload);
}

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

export function exportFilteredLogs(logs: NormalizedLog[]): void {
  downloadCsv(`filtered-logs-${timestamp()}.csv`, logs.map(flattenLog));
}

// ---------------------------------------------------------------------------
// Finding evidence exports (Task 9)
// ---------------------------------------------------------------------------

/**
 * Export the relatedLogs of a single finding as a CSV file.
 * All values pass through sanitizeCsvCell to prevent formula injection.
 */
export function exportFindingEvidence(finding: Finding): void {
  const slug = finding.id.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
  downloadCsv(
    `evidence-${slug}-${timestamp()}.csv`,
    finding.relatedLogs.map(flattenLog)
  );
}

/**
 * Export a single finding as JSON (metadata only — no relatedLogs to
 * keep the file size predictable).
 */
export function exportFindingJson(finding: Finding): void {
  const slug = finding.id.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
  downloadJson(`finding-${slug}-${timestamp()}.json`, {
    id:             finding.id,
    type:           finding.type,
    severity:       finding.severity,
    title:          finding.title,
    description:    finding.description,
    recommendation: finding.recommendation,
    count:          finding.count,
    mitreTactic:    finding.mitreTactic,
    mitreTechnique: finding.mitreTechnique,
  });
}
