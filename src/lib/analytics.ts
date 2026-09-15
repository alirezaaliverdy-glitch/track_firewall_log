import type { NormalizedLog } from "@/types/log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in a ranked frequency list, e.g. top destination ports. */
export type FreqEntry = { value: string; count: number };

/**
 * Summary analytics derived from a set of normalized firewall logs.
 * All counts and totals operate on normalized fields only.
 */
export type LogSummary = {
  // Counts
  total: number;
  allowed: number;
  denied: number;
  dropped: number;
  reset: number;
  unknownAction: number;

  // Volume
  totalBytes: number;
  totalPackets: number;

  // Unique IPs
  uniqueSrcIps: number;
  uniqueDstIps: number;

  // Ranked lists (top 10)
  topDstPorts: FreqEntry[];
  topSrcPorts: FreqEntry[];
  topActions: FreqEntry[];

  // Field coverage flags — tell the UI whether key fields are present
  hasFields: {
    srcIp: boolean;
    dstIp: boolean;
    timestamp: boolean;
    protocol: boolean;
    dstPort: boolean;
  };
};

// ---------------------------------------------------------------------------
// Empty / zero state
// ---------------------------------------------------------------------------

export function emptySummary(): LogSummary {
  return {
    total: 0,
    allowed: 0,
    denied: 0,
    dropped: 0,
    reset: 0,
    unknownAction: 0,
    totalBytes: 0,
    totalPackets: 0,
    uniqueSrcIps: 0,
    uniqueDstIps: 0,
    topDstPorts: [],
    topSrcPorts: [],
    topActions: [],
    hasFields: {
      srcIp: false,
      dstIp: false,
      timestamp: false,
      protocol: false,
      dstPort: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a top-N ranked list from a frequency map. */
function topN(freq: Map<string, number>, n: number): FreqEntry[] {
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

/** Increment a key in a Map<string, number>, initialising to 0 if absent. */
function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Compute summary analytics from an array of normalized firewall logs.
 *
 * Rules:
 * - Only normalized fields are used (never the raw row).
 * - Missing / undefined fields are skipped gracefully.
 * - Invalid port numbers (non-integer, <0, >65535) are excluded from rankings.
 * - An empty array returns emptySummary().
 */
export function buildSummary(logs: NormalizedLog[]): LogSummary {
  if (logs.length === 0) return emptySummary();

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
    // --- Action counts ---
    switch (log.action) {
      case "allow":  allowed++;  break;
      case "deny":   denied++;   break;
      case "drop":   dropped++;  break;
      case "reset":  reset++;    break;
      default:
        unknownAction++;
        break;
    }

    if (log.action) inc(actionFreq, log.action);

    // --- Volume ---
    // Prefer the explicit total; fall back to sent+received sum.
    // Use separate variables to avoid mixing ?? and || in one expression.
    const bytesSum = (log.bytesSent ?? 0) + (log.bytesReceived ?? 0);
    const bytesForRow = log.bytes ?? (bytesSum > 0 ? bytesSum : undefined);
    if (bytesForRow !== undefined) totalBytes += bytesForRow;

    const packetsSum = (log.packetsSent ?? 0) + (log.packetsReceived ?? 0);
    const packetsForRow = log.packets ?? (packetsSum > 0 ? packetsSum : undefined);
    if (packetsForRow !== undefined) totalPackets += packetsForRow;

    // --- Unique IPs ---
    if (log.srcIp) srcIps.add(log.srcIp);
    if (log.dstIp) dstIps.add(log.dstIp);

    // --- Port rankings — only valid 0-65535 integers ---
    if (
      log.dstPort !== undefined &&
      Number.isInteger(log.dstPort) &&
      log.dstPort >= 0 &&
      log.dstPort <= 65535
    ) {
      inc(dstPortFreq, String(log.dstPort));
    }

    if (
      log.srcPort !== undefined &&
      Number.isInteger(log.srcPort) &&
      log.srcPort >= 0 &&
      log.srcPort <= 65535
    ) {
      inc(srcPortFreq, String(log.srcPort));
    }
  }

  // Field coverage: true if at least one log has that field populated
  const hasFields = {
    srcIp:     srcIps.size > 0,
    dstIp:     dstIps.size > 0,
    timestamp: logs.some((l) => l.timestamp !== undefined),
    protocol:  logs.some((l) => l.protocol  !== undefined),
    dstPort:   dstPortFreq.size > 0,
  };

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
    topActions:  topN(actionFreq,  10),
    hasFields,
  };
}
