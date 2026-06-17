import type { Finding } from "@/types/finding";
import type { NormalizedLog } from "@/types/log";

const MAX_DISPLAY = 10;

// ---------------------------------------------------------------------------
// Evidence extraction
// ---------------------------------------------------------------------------

/**
 * Return up to MAX_DISPLAY unique source IPs from a finding's related logs,
 * in insertion order (detections generally put the most-relevant log first).
 */
export function getAffectedSrcIps(finding: Finding): string[] {
  const seen = new Set<string>();
  for (const log of finding.relatedLogs) {
    if (log.srcIp) seen.add(log.srcIp);
    if (seen.size >= MAX_DISPLAY) break;
  }
  return Array.from(seen);
}

/**
 * Return up to MAX_DISPLAY unique destination IPs from a finding's related logs.
 */
export function getAffectedDstIps(finding: Finding): string[] {
  const seen = new Set<string>();
  for (const log of finding.relatedLogs) {
    if (log.dstIp) seen.add(log.dstIp);
    if (seen.size >= MAX_DISPLAY) break;
  }
  return Array.from(seen);
}

/**
 * Return up to MAX_DISPLAY unique destination ports, sorted numerically.
 */
export function getAffectedDstPorts(finding: Finding): number[] {
  const seen = new Set<number>();
  for (const log of finding.relatedLogs) {
    if (log.dstPort !== undefined) seen.add(log.dstPort);
  }
  return Array.from(seen).sort((a, b) => a - b).slice(0, MAX_DISPLAY);
}

/**
 * Return up to `limit` sample logs from a finding's related logs.
 * Defaults to 5 samples — enough to show representative evidence without
 * overwhelming the details panel.
 */
export function getSampleEvidenceLogs(
  finding: Finding,
  limit = 5
): NormalizedLog[] {
  return finding.relatedLogs.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Plain-text summary for clipboard
// ---------------------------------------------------------------------------

/**
 * Produce a plain-text summary of a finding suitable for pasting into a
 * ticket, chat, or report.
 *
 * Security: only string values already present in the Finding object are used.
 * No eval, no dangerouslySetInnerHTML.
 */
export function getFindingSummaryText(finding: Finding): string {
  const lines: string[] = [
    "SECURITY FINDING",
    "================",
    `Title:       ${finding.title}`,
    `Severity:    ${finding.severity.toUpperCase()}`,
    `Type:        ${finding.type}`,
    `Event count: ${finding.count}`,
    "",
    "DESCRIPTION",
    "-----------",
    finding.description,
    "",
    "RECOMMENDATION",
    "--------------",
    finding.recommendation,
  ];

  if (finding.mitreTactic || finding.mitreTechnique) {
    lines.push("", "MITRE ATT&CK", "------------");
    if (finding.mitreTactic)    lines.push(`Tactic:    ${finding.mitreTactic}`);
    if (finding.mitreTechnique) lines.push(`Technique: ${finding.mitreTechnique}`);
  }

  const srcIps   = getAffectedSrcIps(finding);
  const dstIps   = getAffectedDstIps(finding);
  const dstPorts = getAffectedDstPorts(finding);

  if (srcIps.length > 0) {
    lines.push("", `AFFECTED SOURCE IPs (up to ${MAX_DISPLAY})`, "----------------------------------");
    srcIps.forEach((ip) => lines.push(`  ${ip}`));
  }
  if (dstIps.length > 0) {
    lines.push("", `AFFECTED DESTINATION IPs (up to ${MAX_DISPLAY})`, "---------------------------------------");
    dstIps.forEach((ip) => lines.push(`  ${ip}`));
  }
  if (dstPorts.length > 0) {
    lines.push("", "AFFECTED DESTINATION PORTS", "--------------------------", `  ${dstPorts.join(", ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Clipboard helper
// ---------------------------------------------------------------------------

/**
 * Copy text to clipboard using the Async Clipboard API.
 * Falls back gracefully — never throws to the caller.
 * Returns true if the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API rejected (e.g. no permission) — fail silently
  }
  return false;
}
