import type { Finding } from "@/types/finding";

const MAX_DISPLAY = 10;

// ---------------------------------------------------------------------------
// Evidence extraction helpers
// ---------------------------------------------------------------------------

/**
 * Return up to MAX_DISPLAY unique source IPs from a finding's related logs.
 * Preserves insertion order so the most-frequent IPs (which detections tend
 * to place first) appear at the top.
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
 * Return up to MAX_DISPLAY unique destination ports from a finding's related
 * logs, sorted numerically ascending.
 */
export function getAffectedDstPorts(finding: Finding): number[] {
  const seen = new Set<number>();
  for (const log of finding.relatedLogs) {
    if (log.dstPort !== undefined) seen.add(log.dstPort);
  }
  return Array.from(seen).sort((a, b) => a - b).slice(0, MAX_DISPLAY);
}

// ---------------------------------------------------------------------------
// Plain-text summary for clipboard copy
// ---------------------------------------------------------------------------

/**
 * Produce a plain-text summary of a finding suitable for pasting into a
 * ticket, chat, or email.
 *
 * Security: uses only string values already present in the Finding object.
 * No eval, no dangerouslySetInnerHTML.
 */
export function getFindingSummaryText(finding: Finding): string {
  const lines: string[] = [
    `SECURITY FINDING`,
    `================`,
    `Title:          ${finding.title}`,
    `Severity:       ${finding.severity.toUpperCase()}`,
    `Type:           ${finding.type}`,
    `Event count:    ${finding.count}`,
    ``,
    `DESCRIPTION`,
    `-----------`,
    finding.description,
    ``,
    `RECOMMENDATION`,
    `--------------`,
    finding.recommendation,
  ];

  if (finding.mitreTactic || finding.mitreTechnique) {
    lines.push(``);
    lines.push(`MITRE ATT&CK`);
    lines.push(`------------`);
    if (finding.mitreTactic)    lines.push(`Tactic:    ${finding.mitreTactic}`);
    if (finding.mitreTechnique) lines.push(`Technique: ${finding.mitreTechnique}`);
  }

  const srcIps  = getAffectedSrcIps(finding);
  const dstIps  = getAffectedDstIps(finding);
  const dstPorts = getAffectedDstPorts(finding);

  if (srcIps.length > 0) {
    lines.push(``);
    lines.push(`AFFECTED SOURCE IPs (up to ${MAX_DISPLAY})`);
    lines.push(`----------------------------------`);
    srcIps.forEach((ip) => lines.push(`  ${ip}`));
  }

  if (dstIps.length > 0) {
    lines.push(``);
    lines.push(`AFFECTED DESTINATION IPs (up to ${MAX_DISPLAY})`);
    lines.push(`---------------------------------------`);
    dstIps.forEach((ip) => lines.push(`  ${ip}`));
  }

  if (dstPorts.length > 0) {
    lines.push(``);
    lines.push(`AFFECTED DESTINATION PORTS`);
    lines.push(`--------------------------`);
    lines.push(`  ${dstPorts.join(", ")}`);
  }

  return lines.join("\n");
}
