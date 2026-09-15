import type { AnalysisSummary, FreqEntry, NormalizedLog, SensitivePortSummary, TrafficDirection, TrafficIntelligence } from "./types.js";
import { getRiskyPort } from "./portIntelligence.js";

function topN(freq: Map<string, number>, n: number): FreqEntry[] {
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function isAllowed(action?: string): boolean {
  return ["allow", "accept", "pass", "permit"].includes(action?.toLowerCase() ?? "");
}

function isBlocked(action?: string): boolean {
  return ["deny", "drop", "block"].includes(action?.toLowerCase() ?? "");
}

export function buildSummary(logs: NormalizedLog[]): AnalysisSummary {
  let allowed = 0;
  let denied = 0;
  let dropped = 0;
  let reset = 0;
  let unknownAction = 0;
  let totalBytes = 0;
  let totalPackets = 0;
  const srcIps = new Set<string>();
  const dstIps = new Set<string>();
  const dstPortFreq = new Map<string, number>();
  const srcPortFreq = new Map<string, number>();
  const actionFreq = new Map<string, number>();

  for (const log of logs) {
    switch (log.action) {
      case "allow":
        allowed += 1;
        break;
      case "deny":
        denied += 1;
        break;
      case "drop":
        dropped += 1;
        break;
      case "reset":
        reset += 1;
        break;
      default:
        unknownAction += 1;
    }

    if (log.action) inc(actionFreq, log.action);
    const bytesSum = (log.bytesSent ?? 0) + (log.bytesReceived ?? 0);
    totalBytes += log.bytes ?? (bytesSum > 0 ? bytesSum : 0);
    const packetsSum = (log.packetsSent ?? 0) + (log.packetsReceived ?? 0);
    totalPackets += log.packets ?? (packetsSum > 0 ? packetsSum : 0);
    if (log.srcIp) srcIps.add(log.srcIp);
    if (log.dstIp) dstIps.add(log.dstIp);
    if (log.dstPort !== undefined && Number.isInteger(log.dstPort) && log.dstPort >= 0 && log.dstPort <= 65535) inc(dstPortFreq, String(log.dstPort));
    if (log.srcPort !== undefined && Number.isInteger(log.srcPort) && log.srcPort >= 0 && log.srcPort <= 65535) inc(srcPortFreq, String(log.srcPort));
  }

  return {
    total: logs.length,
    allowed,
    denied,
    dropped,
    reset,
    unknownAction,
    totalBytes,
    totalPackets,
    uniqueSrcIps: srcIps.size,
    uniqueDstIps: dstIps.size,
    topDstPorts: topN(dstPortFreq, 10),
    topSrcPorts: topN(srcPortFreq, 10),
    topActions: topN(actionFreq, 10),
    hasFields: {
      srcIp: srcIps.size > 0,
      dstIp: dstIps.size > 0,
      timestamp: logs.some((log) => log.timestamp !== undefined),
      protocol: logs.some((log) => log.protocol !== undefined),
      dstPort: dstPortFreq.size > 0
    }
  };
}

export function buildTrafficIntelligence(logs: NormalizedLog[]): TrafficIntelligence {
  const directions: TrafficDirection[] = ["inbound", "outbound", "internal", "external", "loopback", "unknown"];
  const directionCounts = Object.fromEntries(directions.map((direction) => [direction, 0])) as Record<TrafficDirection, number>;
  let exposedManagement = 0;
  let exposedDatabase = 0;
  let inboundRisky = 0;
  let missingIpData = 0;

  for (const log of logs) {
    const direction = log.trafficDirection ?? "unknown";
    directionCounts[direction] += 1;
    if (direction === "unknown") missingIpData += 1;
    if (direction === "inbound" && log.isManagementTraffic) exposedManagement += 1;
    if (direction === "inbound" && log.isDatabaseTraffic) exposedDatabase += 1;
    if (direction === "inbound" && log.isRiskyServiceTraffic) inboundRisky += 1;
  }

  return { directionCounts, exposedManagement, exposedDatabase, inboundRisky, missingIpData };
}

export function buildSensitivePortsSummary(logs: NormalizedLog[]): SensitivePortSummary[] {
  const byPort = new Map<number, SensitivePortSummary>();

  for (const log of logs) {
    if (log.dstPort === undefined) continue;
    const meta = getRiskyPort(log.dstPort);
    if (!meta) continue;
    const current = byPort.get(log.dstPort) ?? {
      port: meta.port,
      service: meta.service,
      severity: meta.severity,
      reason: meta.reason,
      recommendation: meta.recommendation,
      total: 0,
      allowed: 0,
      blocked: 0,
      other: 0
    };
    current.total += 1;
    if (isAllowed(log.action)) current.allowed += 1;
    else if (isBlocked(log.action)) current.blocked += 1;
    else current.other += 1;
    byPort.set(log.dstPort, current);
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return Array.from(byPort.values()).sort((a, b) => order[a.severity] - order[b.severity] || b.total - a.total);
}
