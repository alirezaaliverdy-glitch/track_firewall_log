import type {
  ColumnMapping,
  MappableField,
  MappingConfidence,
} from "@/types/mapping";
import {
  IMPORTANT_FIELDS,
  TIMESTAMP_FIELDS,
} from "@/types/mapping";

// ---------------------------------------------------------------------------
// Alias registry
//
// Each entry maps a normalized field to a list of lowercase raw-header
// aliases.  This is the same knowledge that lives in normalizer.ts, but
// expressed here as data so columnMapping.ts can use it independently.
// ---------------------------------------------------------------------------

const ALIAS_MAP: Record<MappableField, string[]> = {
  timestamp:       ["timestamp", "time stamp", "datetime", "date time", "receive_time"],
  date:            ["date", "log date", "logdate"],
  time:            ["time", "log time", "logtime"],
  action:          ["action", "act", "policy action", "disposition", "policyaction"],
  protocol:        ["protocol", "proto"],
  srcIp:           ["srcip", "src_ip", "source ip", "sourceip", "src-address",
                    "source address", "source", "srcaddr", "src"],
  dstIp:           ["dstip", "dst_ip", "destination ip", "destinationip", "dst-address",
                    "destination address", "destination", "dstaddr", "dst"],
  srcPort:         ["srcport", "src_port", "source port", "sourceport",
                    "src-port", "sport"],
  dstPort:         ["dstport", "dst_port", "destination port", "destinationport",
                    "dst-port", "dport"],
  natSrcPort:      ["nat source port", "natsrcport", "nat_src_port"],
  natDstPort:      ["nat destination port", "natdstport", "nat_dst_port"],
  bytes:           ["bytes", "total bytes", "totalbytes"],
  bytesSent:       ["bytes sent", "bytessent", "sentbyte", "tx_bytes", "txbytes",
                    "bytes_sent", "byts_sent"],
  bytesReceived:   ["bytes received", "bytesreceived", "rcvdbyte", "rx_bytes",
                    "rxbytes", "bytes_received", "byts_received"],
  packets:         ["packets", "total packets", "totalpackets", "pkt"],
  packetsSent:     ["pkts_sent", "packets sent", "packetssent", "tx_packets"],
  packetsReceived: ["pkts_received", "packets received", "packetsreceived", "rx_packets"],
  service:         ["service"],
  application:     ["application", "app", "appname"],
  ruleName:        ["rule", "rule name", "rulename", "policy", "policyname"],
  user:            ["user", "username", "srcuser", "src_user"],
  message:         ["message", "msg", "description", "log message", "logmessage"],
};

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/**
 * Examine a list of CSV headers and return the best-guess ColumnMapping.
 *
 * Strategy:
 * 1. Lowercase every header.
 * 2. For each normalized field, find the first header that matches one of its
 *    known aliases (first alias wins → more specific aliases should come first).
 * 3. A raw header is never assigned to more than one normalized field —
 *    whichever field claims it first (in ALIAS_MAP key order) wins.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const loweredHeaders = headers.map((h) => h.toLowerCase().trim());
  // Map from lowered header → original header (to return original casing)
  const originalByLower = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    originalByLower.set(loweredHeaders[i], headers[i]);
  }

  const mapping: ColumnMapping = {};
  const claimed = new Set<string>(); // lowered headers already assigned

  for (const [field, aliases] of Object.entries(ALIAS_MAP) as [MappableField, string[]][]) {
    for (const alias of aliases) {
      if (loweredHeaders.includes(alias) && !claimed.has(alias)) {
        const original = originalByLower.get(alias) ?? alias;
        mapping[field] = original;
        claimed.add(alias);
        break; // first match wins for this field
      }
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Score the mapping 0–100.
 *
 * Scoring:
 * - Each important field that is mapped adds (80 / IMPORTANT_FIELDS.length) points.
 * - Having at least one timestamp field adds 20 points.
 */
export function getMappingConfidence(mapping: ColumnMapping): MappingConfidence {
  const mappedImportant = IMPORTANT_FIELDS.filter(
    (f) => mapping[f] !== undefined
  );
  const missingImportant = IMPORTANT_FIELDS.filter(
    (f) => mapping[f] === undefined
  );
  const hasTimestamp = TIMESTAMP_FIELDS.some((f) => mapping[f] !== undefined);

  const importantScore =
    IMPORTANT_FIELDS.length > 0
      ? (mappedImportant.length / IMPORTANT_FIELDS.length) * 80
      : 80;
  const timestampScore = hasTimestamp ? 20 : 0;
  const score = Math.round(importantScore + timestampScore);

  return { score, mappedImportant, missingImportant, hasTimestamp };
}

/**
 * Return the human-readable names of important fields that are not yet mapped.
 * Used to surface warnings in the UI.
 */
export function getMissingImportantMappings(mapping: ColumnMapping): MappableField[] {
  return IMPORTANT_FIELDS.filter((f) => mapping[f] === undefined);
}
