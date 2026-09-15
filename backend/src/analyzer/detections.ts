import type { NormalizedLog, SecurityFinding, Severity } from "./types.js";
import { getRiskyPort, isRiskyPort } from "./portIntelligence.js";

const ALLOWED_ACTIONS = new Set(["allow", "accept", "pass", "permit"]);
const BLOCKED_ACTIONS = new Set(["deny", "drop", "block"]);
const MAX_RELATED_LOGS = 50;

function isAllowed(action?: string): boolean {
  return action ? ALLOWED_ACTIONS.has(action.toLowerCase()) : false;
}

function isBlocked(action?: string): boolean {
  return action ? BLOCKED_ACTIONS.has(action.toLowerCase()) : false;
}

export function detectAllowedRiskyServices(logs: NormalizedLog[]): SecurityFinding[] {
  const groups = new Map<number, NormalizedLog[]>();
  for (const log of logs) {
    if (log.dstPort === undefined || !isAllowed(log.action) || !isRiskyPort(log.dstPort)) continue;
    groups.set(log.dstPort, [...(groups.get(log.dstPort) ?? []), log]);
  }

  return Array.from(groups.entries()).map(([port, portLogs]) => {
    const meta = getRiskyPort(port)!;
    return {
      id: `allowed-risky-service-${port}`,
      type: "allowed-risky-service",
      severity: meta.severity,
      title: `Allowed traffic to risky port ${port} (${meta.service})`,
      description: `${portLogs.length} log ${portLogs.length === 1 ? "entry shows" : "entries show"} traffic to port ${port} (${meta.service}) was permitted. ${meta.reason}`,
      recommendation: meta.recommendation,
      count: portLogs.length,
      relatedLogs: portLogs.slice(0, MAX_RELATED_LOGS)
    };
  });
}

export function detectDeniedRiskyServices(logs: NormalizedLog[]): SecurityFinding[] {
  const groups = new Map<number, NormalizedLog[]>();
  for (const log of logs) {
    if (log.dstPort === undefined || !isBlocked(log.action) || !isRiskyPort(log.dstPort)) continue;
    groups.set(log.dstPort, [...(groups.get(log.dstPort) ?? []), log]);
  }

  return Array.from(groups.entries()).map(([port, portLogs]) => {
    const meta = getRiskyPort(port)!;
    return {
      id: `denied-risky-service-${port}`,
      type: "denied-risky-service",
      severity: "medium",
      title: `Blocked attempts to risky port ${port} (${meta.service})`,
      description: `${portLogs.length} blocked connection attempt${portLogs.length === 1 ? "" : "s"} to port ${port} (${meta.service}) detected. Repeated probing may indicate reconnaissance or an active attack attempt.`,
      recommendation: meta.recommendation,
      count: portLogs.length,
      relatedLogs: portLogs.slice(0, MAX_RELATED_LOGS)
    };
  });
}

export function detectTrafficAnomalies(logs: NormalizedLog[]): SecurityFinding[] {
  const highBytes: NormalizedLog[] = [];
  const highPackets: NormalizedLog[] = [];
  for (const log of logs) {
    const bytes = log.bytes ?? (((log.bytesSent ?? 0) + (log.bytesReceived ?? 0)) || undefined);
    if (bytes !== undefined && bytes > 1_000_000) highBytes.push(log);
    const packets = log.packets ?? (((log.packetsSent ?? 0) + (log.packetsReceived ?? 0)) || undefined);
    if (packets !== undefined && packets > 1_000) highPackets.push(log);
  }

  const findings: SecurityFinding[] = [];
  if (highBytes.length > 0) {
    findings.push({
      id: "traffic-anomaly-high-bytes",
      type: "traffic-anomaly",
      severity: "medium",
      title: `High-volume traffic: ${highBytes.length} flow${highBytes.length === 1 ? "" : "s"} exceed 1 MB`,
      description: `${highBytes.length} log ${highBytes.length === 1 ? "entry records" : "entries record"} more than 1 MB of data in a single flow.`,
      recommendation: "Investigate the source and destination of high-volume flows and confirm business justification.",
      count: highBytes.length,
      relatedLogs: highBytes.slice(0, MAX_RELATED_LOGS)
    });
  }
  if (highPackets.length > 0) {
    findings.push({
      id: "traffic-anomaly-high-packets",
      type: "traffic-anomaly",
      severity: "medium",
      title: `High packet count: ${highPackets.length} flow${highPackets.length === 1 ? "" : "s"} exceed 1000 packets`,
      description: `${highPackets.length} log ${highPackets.length === 1 ? "entry records" : "entries record"} more than 1000 packets in a single flow.`,
      recommendation: "Review involved source IPs and consider rate-limiting or alerting thresholds.",
      count: highPackets.length,
      relatedLogs: highPackets.slice(0, MAX_RELATED_LOGS)
    });
  }
  return findings;
}

export function detectVerticalPortScan(logs: NormalizedLog[]): SecurityFinding[] {
  const pairs = new Map<string, { ports: Set<number>; logs: NormalizedLog[] }>();
  for (const log of logs) {
    if (!log.srcIp || !log.dstIp || log.dstPort === undefined) continue;
    const key = `${log.srcIp}|${log.dstIp}`;
    const entry = pairs.get(key) ?? { ports: new Set<number>(), logs: [] };
    entry.ports.add(log.dstPort);
    entry.logs.push(log);
    pairs.set(key, entry);
  }

  return Array.from(pairs.entries()).filter(([, entry]) => entry.ports.size >= 20).map(([key, entry]) => {
    const [srcIp, dstIp] = key.split("|");
    return {
      id: `vertical-scan-${srcIp}-${dstIp}`,
      type: "vertical-port-scan",
      severity: "high",
      title: `Possible port scan: ${srcIp} -> ${dstIp} (${entry.ports.size} ports)`,
      description: `Source IP ${srcIp} was observed connecting to ${entry.ports.size} unique destination ports on ${dstIp}.`,
      recommendation: "Investigate the source IP. Block or rate-limit if not a legitimate scanner.",
      count: entry.logs.length,
      relatedLogs: entry.logs.slice(0, MAX_RELATED_LOGS),
      mitreTactic: "Reconnaissance",
      mitreTechnique: "T1046 - Network Service Discovery"
    };
  });
}

export function detectHorizontalPortScan(logs: NormalizedLog[]): SecurityFinding[] {
  const pairs = new Map<string, { dstIps: Set<string>; logs: NormalizedLog[] }>();
  for (const log of logs) {
    if (!log.srcIp || !log.dstIp || log.dstPort === undefined) continue;
    const key = `${log.srcIp}|${log.dstPort}`;
    const entry = pairs.get(key) ?? { dstIps: new Set<string>(), logs: [] };
    entry.dstIps.add(log.dstIp);
    entry.logs.push(log);
    pairs.set(key, entry);
  }

  return Array.from(pairs.entries()).filter(([, entry]) => entry.dstIps.size >= 20).map(([key, entry]) => {
    const [srcIp, dstPort] = key.split("|");
    return {
      id: `horizontal-scan-${srcIp}-port-${dstPort}`,
      type: "horizontal-port-scan",
      severity: "high",
      title: `Possible host sweep: ${srcIp} probing port ${dstPort} on ${entry.dstIps.size} hosts`,
      description: `Source IP ${srcIp} was observed connecting to port ${dstPort} on ${entry.dstIps.size} unique destination IPs.`,
      recommendation: "Block or rate-limit the source IP at the perimeter if traffic is not expected.",
      count: entry.logs.length,
      relatedLogs: entry.logs.slice(0, MAX_RELATED_LOGS),
      mitreTactic: "Reconnaissance",
      mitreTechnique: "T1046 - Network Service Discovery"
    };
  });
}

export function detectRepeatedDeniedAttempts(logs: NormalizedLog[]): SecurityFinding[] {
  const groups = new Map<string, NormalizedLog[]>();
  const bruteForcePorts = new Set([22, 23, 3389, 5900, 8291]);
  for (const log of logs) {
    if (!log.srcIp || log.dstPort === undefined || !isBlocked(log.action)) continue;
    const key = `${log.srcIp}|${log.dstPort}`;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }

  return Array.from(groups.entries()).filter(([, groupLogs]) => groupLogs.length >= 50).map(([key, groupLogs]) => {
    const [srcIp, dstPortStr] = key.split("|");
    const dstPort = Number(dstPortStr);
    const isBrutePort = bruteForcePorts.has(dstPort);
    const severity: Severity = isBrutePort ? "high" : "medium";
    return {
      id: `repeated-deny-${srcIp}-port-${dstPort}`,
      type: "repeated-denied-attempts",
      severity,
      title: `${groupLogs.length} blocked attempts from ${srcIp} to port ${dstPort}`,
      description: `Source IP ${srcIp} made ${groupLogs.length} blocked connection attempts to port ${dstPort}.`,
      recommendation: isBrutePort ? `Block ${srcIp} at the perimeter and verify authentication controls.` : `Investigate ${srcIp}. Consider adding a block rule if traffic is not expected.`,
      count: groupLogs.length,
      relatedLogs: groupLogs.slice(0, MAX_RELATED_LOGS),
      mitreTactic: isBrutePort ? "Credential Access" : "Reconnaissance",
      mitreTechnique: isBrutePort ? "T1110 - Brute Force" : "T1046 - Network Service Discovery"
    };
  });
}

export function runDetections(logs: NormalizedLog[]): SecurityFinding[] {
  const detectors = [detectAllowedRiskyServices, detectDeniedRiskyServices, detectTrafficAnomalies, detectVerticalPortScan, detectHorizontalPortScan, detectRepeatedDeniedAttempts];
  const all: SecurityFinding[] = [];
  for (const detector of detectors) {
    try {
      all.push(...detector(logs));
    } catch {
      // Keep analysis deterministic and resilient; do not leak raw logs or stack traces.
    }
  }
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return all.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
}
