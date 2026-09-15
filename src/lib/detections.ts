import type { NormalizedLog } from "@/types/log";
import type { Finding, Severity } from "@/types/finding";
import { getRiskyPort, isRiskyPort } from "@/lib/riskyPorts";
import { logRuntimeError } from "@/lib/runtimeLogging";

const ALLOWED_ACTIONS = new Set(["allow", "accept", "pass", "permit"]);
const BLOCKED_ACTIONS = new Set(["deny", "drop", "block"]);
const MAX_RELATED_LOGS = 50;

function isAllowed(action?: string): boolean {
  return action ? ALLOWED_ACTIONS.has(action.toLowerCase()) : false;
}

function isBlocked(action?: string): boolean {
  return action ? BLOCKED_ACTIONS.has(action.toLowerCase()) : false;
}

export function detectAllowedRiskyServices(logs: NormalizedLog[]): Finding[] {
  const groups = new Map<number, NormalizedLog[]>();

  for (const log of logs) {
    if (log.dstPort === undefined) continue;
    if (!isAllowed(log.action)) continue;
    if (!isRiskyPort(log.dstPort)) continue;
    const bucket = groups.get(log.dstPort);
    if (bucket) bucket.push(log);
    else groups.set(log.dstPort, [log]);
  }

  const findings: Finding[] = [];
  for (const [port, portLogs] of groups) {
    const meta = getRiskyPort(port)!;
    findings.push({
      id: `allowed-risky-service-${port}`,
      type: "allowed-risky-service",
      severity: meta.severity,
      title: `Allowed traffic to risky port ${port} (${meta.service})`,
      description:
        `${portLogs.length} log entr${portLogs.length === 1 ? "y" : "ies"} show traffic to port ${port} (${meta.service}) was permitted. ${meta.reason}`,
      recommendation: meta.recommendation,
      count: portLogs.length,
      relatedLogs: portLogs.slice(0, MAX_RELATED_LOGS),
    });
  }
  return findings;
}

export function detectDeniedRiskyServices(logs: NormalizedLog[]): Finding[] {
  const groups = new Map<number, NormalizedLog[]>();

  for (const log of logs) {
    if (log.dstPort === undefined) continue;
    if (!isBlocked(log.action)) continue;
    if (!isRiskyPort(log.dstPort)) continue;
    const bucket = groups.get(log.dstPort);
    if (bucket) bucket.push(log);
    else groups.set(log.dstPort, [log]);
  }

  const findings: Finding[] = [];
  for (const [port, portLogs] of groups) {
    const meta = getRiskyPort(port)!;
    findings.push({
      id: `denied-risky-service-${port}`,
      type: "denied-risky-service",
      severity: "medium",
      title: `Blocked attempts to risky port ${port} (${meta.service})`,
      description:
        `${portLogs.length} blocked connection attempt${portLogs.length === 1 ? "" : "s"} to port ${port} (${meta.service}) detected. Repeated probing may indicate reconnaissance or an active attack attempt.`,
      recommendation: meta.recommendation,
      count: portLogs.length,
      relatedLogs: portLogs.slice(0, MAX_RELATED_LOGS),
    });
  }
  return findings;
}

const BYTE_THRESHOLD = 1_000_000;
const PACKET_THRESHOLD = 1_000;

export function detectTrafficAnomalies(logs: NormalizedLog[]): Finding[] {
  const highBytes: NormalizedLog[] = [];
  const highPackets: NormalizedLog[] = [];

  for (const log of logs) {
    const bytesSum = (log.bytesSent ?? 0) + (log.bytesReceived ?? 0);
    const bytes = log.bytes ?? (bytesSum > 0 ? bytesSum : undefined);
    if (bytes !== undefined && bytes > BYTE_THRESHOLD) highBytes.push(log);

    const packetsSum = (log.packetsSent ?? 0) + (log.packetsReceived ?? 0);
    const packets = log.packets ?? (packetsSum > 0 ? packetsSum : undefined);
    if (packets !== undefined && packets > PACKET_THRESHOLD) highPackets.push(log);
  }

  const findings: Finding[] = [];
  if (highBytes.length > 0) {
    findings.push({
      id: "traffic-anomaly-high-bytes",
      type: "traffic-anomaly",
      severity: "medium",
      title: `High-volume traffic: ${highBytes.length} flow${highBytes.length === 1 ? "" : "s"} exceed ${(BYTE_THRESHOLD / 1_000_000).toFixed(0)} MB`,
      description:
        `${highBytes.length} log entr${highBytes.length === 1 ? "y" : "ies"} record more than ${(BYTE_THRESHOLD / 1_000_000).toFixed(0)} MB of data in a single flow. Large flows may indicate data exfiltration, misconfigured backups, or media streaming.`,
      recommendation: "Investigate the source and destination of high-volume flows. Correlate with user activity and business justification.",
      count: highBytes.length,
      relatedLogs: highBytes.slice(0, MAX_RELATED_LOGS),
    });
  }

  if (highPackets.length > 0) {
    findings.push({
      id: "traffic-anomaly-high-packets",
      type: "traffic-anomaly",
      severity: "medium",
      title: `High packet count: ${highPackets.length} flow${highPackets.length === 1 ? "" : "s"} exceed ${PACKET_THRESHOLD} packets`,
      description:
        `${highPackets.length} log entr${highPackets.length === 1 ? "y" : "ies"} record more than ${PACKET_THRESHOLD} packets in a single flow. Unusually high packet rates can indicate flooding, DDoS activity, or scanning.`,
      recommendation: "Review the source IPs involved. Check for rate-limiting rules and consider alerting thresholds.",
      count: highPackets.length,
      relatedLogs: highPackets.slice(0, MAX_RELATED_LOGS),
    });
  }

  return findings;
}

const VERTICAL_SCAN_THRESHOLD = 20;

export function detectVerticalPortScan(logs: NormalizedLog[]): Finding[] {
  const pairs = new Map<string, { ports: Set<number>; logs: NormalizedLog[] }>();

  for (const log of logs) {
    if (!log.srcIp || !log.dstIp || log.dstPort === undefined) continue;
    const key = `${log.srcIp}|${log.dstIp}`;
    const entry = pairs.get(key);
    if (entry) {
      entry.ports.add(log.dstPort);
      entry.logs.push(log);
    } else {
      pairs.set(key, { ports: new Set([log.dstPort]), logs: [log] });
    }
  }

  const findings: Finding[] = [];
  for (const [key, { ports, logs: pairLogs }] of pairs) {
    if (ports.size < VERTICAL_SCAN_THRESHOLD) continue;
    const [srcIp, dstIp] = key.split("|");
    findings.push({
      id: `vertical-scan-${srcIp}-${dstIp}`,
      type: "vertical-port-scan",
      severity: "high",
      title: `Possible port scan: ${srcIp} -> ${dstIp} (${ports.size} ports)`,
      description:
        `Source IP ${srcIp} was observed connecting to ${ports.size} unique destination ports on ${dstIp}. This pattern is consistent with a vertical port scan used to map open services on a target host.`,
      recommendation: "Investigate the source IP. Block or rate-limit if not a legitimate scanner. Ensure only required ports are exposed on the destination host.",
      count: pairLogs.length,
      relatedLogs: pairLogs.slice(0, MAX_RELATED_LOGS),
      mitreTactic: "Reconnaissance",
      mitreTechnique: "T1046 - Network Service Discovery",
    });
  }
  return findings;
}

const HORIZONTAL_SCAN_THRESHOLD = 20;

export function detectHorizontalPortScan(logs: NormalizedLog[]): Finding[] {
  const pairs = new Map<string, { dstIps: Set<string>; logs: NormalizedLog[] }>();

  for (const log of logs) {
    if (!log.srcIp || !log.dstIp || log.dstPort === undefined) continue;
    const key = `${log.srcIp}|${log.dstPort}`;
    const entry = pairs.get(key);
    if (entry) {
      entry.dstIps.add(log.dstIp);
      entry.logs.push(log);
    } else {
      pairs.set(key, { dstIps: new Set([log.dstIp]), logs: [log] });
    }
  }

  const findings: Finding[] = [];
  for (const [key, { dstIps, logs: scanLogs }] of pairs) {
    if (dstIps.size < HORIZONTAL_SCAN_THRESHOLD) continue;
    const [srcIp, dstPort] = key.split("|");
    findings.push({
      id: `horizontal-scan-${srcIp}-port-${dstPort}`,
      type: "horizontal-port-scan",
      severity: "high",
      title: `Possible host sweep: ${srcIp} probing port ${dstPort} on ${dstIps.size} hosts`,
      description:
        `Source IP ${srcIp} was observed connecting to port ${dstPort} on ${dstIps.size} unique destination IPs. This pattern is consistent with a horizontal scan used to discover hosts running a specific service.`,
      recommendation: "Block or rate-limit the source IP at the perimeter. Investigate whether any of the targeted hosts were compromised.",
      count: scanLogs.length,
      relatedLogs: scanLogs.slice(0, MAX_RELATED_LOGS),
      mitreTactic: "Reconnaissance",
      mitreTechnique: "T1046 - Network Service Discovery",
    });
  }
  return findings;
}

const REPEATED_DENY_THRESHOLD = 50;
const BRUTE_FORCE_PORTS = new Set([22, 23, 3389, 5900, 8291]);

export function detectRepeatedDeniedAttempts(logs: NormalizedLog[]): Finding[] {
  const groups = new Map<string, NormalizedLog[]>();

  for (const log of logs) {
    if (!log.srcIp || log.dstPort === undefined) continue;
    if (!isBlocked(log.action)) continue;
    const key = `${log.srcIp}|${log.dstPort}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(log);
    else groups.set(key, [log]);
  }

  const findings: Finding[] = [];
  for (const [key, groupLogs] of groups) {
    if (groupLogs.length < REPEATED_DENY_THRESHOLD) continue;
    const [srcIp, dstPortStr] = key.split("|");
    const dstPort = Number(dstPortStr);
    const isBrutePort = BRUTE_FORCE_PORTS.has(dstPort);
    const severity: Severity = isBrutePort ? "high" : "medium";
    const mitre = isBrutePort
      ? { mitreTactic: "Credential Access", mitreTechnique: "T1110 - Brute Force" }
      : { mitreTactic: "Reconnaissance", mitreTechnique: "T1046 - Network Service Discovery" };

    findings.push({
      id: `repeated-deny-${srcIp}-port-${dstPort}`,
      type: "repeated-denied-attempts",
      severity,
      title: `${groupLogs.length} blocked attempts from ${srcIp} to port ${dstPort}`,
      description:
        `Source IP ${srcIp} made ${groupLogs.length} blocked connection attempts to port ${dstPort}. ${isBrutePort ? `Port ${dstPort} is commonly targeted for credential brute-forcing.` : "Repeated denies suggest automated scanning or probing activity."}`,
      recommendation: isBrutePort
        ? `Block ${srcIp} at the perimeter. Ensure strong authentication and account lockout policies are in place.`
        : `Investigate ${srcIp}. Consider adding a block rule if traffic is not expected.`,
      count: groupLogs.length,
      relatedLogs: groupLogs.slice(0, MAX_RELATED_LOGS),
      ...mitre,
    });
  }
  return findings;
}

export function runDetections(logs: NormalizedLog[]): Finding[] {
  if (logs.length === 0) return [];

  const detectors = [
    detectAllowedRiskyServices,
    detectDeniedRiskyServices,
    detectTrafficAnomalies,
    detectVerticalPortScan,
    detectHorizontalPortScan,
    detectRepeatedDeniedAttempts,
  ];

  const all: Finding[] = [];
  for (const detector of detectors) {
    try {
      all.push(...detector(logs));
    } catch (err) {
      logRuntimeError(`Detection failed in ${detector.name}`, err);
    }
  }

  const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  all.sort((a, b) => (ORDER[a.severity] ?? 5) - (ORDER[b.severity] ?? 5));
  return all;
}
