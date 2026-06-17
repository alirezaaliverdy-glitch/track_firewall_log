import type { RawLogRow, NormalizedLog, FirewallVendor } from "@/types/log";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a lowercase-keyed lookup map from a raw row so all alias matching
 * can be done case-insensitively without mutating the original row.
 */
function lowerKeyMap(row: RawLogRow): Map<string, RawLogRow[string]> {
  const map = new Map<string, RawLogRow[string]>();
  for (const key of Object.keys(row)) {
    map.set(key.toLowerCase(), row[key]);
  }
  return map;
}

/**
 * Return the value of the first alias that exists in the map, or undefined.
 * All alias lookups are already lowercase; pass lowercase alias lists.
 */
function pick(
  map: Map<string, RawLogRow[string]>,
  aliases: string[]
): RawLogRow[string] {
  for (const alias of aliases) {
    if (map.has(alias)) return map.get(alias);
  }
  return undefined;
}

/** Safely convert a raw value to a trimmed string, or undefined if empty. */
function toStr(val: RawLogRow[string]): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  return s === "" ? undefined : s;
}

/** Safely convert a raw value to a finite number, or undefined if not numeric. */
function toNum(val: RawLogRow[string]): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Action normalization
// ---------------------------------------------------------------------------

const ACTION_MAP: Record<string, string> = {
  allow: "allow",
  accept: "allow",
  pass: "allow",
  permit: "allow",
  deny: "deny",
  block: "deny",
  drop: "drop",
  reset: "reset",
  "reset-both": "reset",
  "reset-client": "reset",
  "reset-server": "reset",
};

function normalizeAction(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return ACTION_MAP[key] ?? raw.trim();
}

// ---------------------------------------------------------------------------
// Alias tables (all lowercase — matched against the lowered key map)
// ---------------------------------------------------------------------------

const ALIASES_SRC_IP = [
  "srcip", "src_ip", "source ip", "sourceip", "src-address",
  "source address", "source", "srcaddr",
];

const ALIASES_DST_IP = [
  "dstip", "dst_ip", "destination ip", "destinationip", "dst-address",
  "destination address", "destination", "dstaddr",
];

const ALIASES_SRC_PORT = [
  "srcport", "src_port", "source port", "sourceport",
  "src-port", "sport",
];

const ALIASES_DST_PORT = [
  "dstport", "dst_port", "destination port", "destinationport",
  "dst-port", "dport",
];

const ALIASES_NAT_SRC_PORT = [
  "nat source port", "natsrcport", "nat_src_port", "nat source port",
];

const ALIASES_NAT_DST_PORT = [
  "nat destination port", "natdstport", "nat_dst_port", "nat destination port",
];

const ALIASES_ACTION = [
  "action", "act", "policy action", "disposition", "policyaction",
];

const ALIASES_PROTOCOL = [
  "protocol", "proto",
];

const ALIASES_DATE = [
  "date", "log date", "logdate",
];

const ALIASES_TIME = [
  "time", "log time", "logtime",
];

const ALIASES_TIMESTAMP = [
  "timestamp", "time stamp", "datetime", "date time",
];

const ALIASES_BYTES = [
  "bytes", "total bytes", "totalbytes",
];

const ALIASES_BYTES_SENT = [
  "bytes sent", "bytessent", "sentbyte", "tx_bytes", "txbytes",
  "bytes_sent", "byts_sent",
];

const ALIASES_BYTES_RECEIVED = [
  "bytes received", "bytesreceived", "rcvdbyte", "rx_bytes", "rxbytes",
  "bytes_received", "byts_received",
];

const ALIASES_PACKETS = [
  "packets", "total packets", "totalpackets", "pkt",
];

const ALIASES_PKTS_SENT = [
  "pkts_sent", "packets sent", "packetssent", "tx_packets",
];

const ALIASES_PKTS_RECEIVED = [
  "pkts_received", "packets received", "packetsreceived", "rx_packets",
];

const ALIASES_SERVICE = [
  "service",
];

const ALIASES_APPLICATION = [
  "application", "app", "appname",
];

const ALIASES_RULE = [
  "rule", "rule name", "rulename", "policy", "policyname",
];

const ALIASES_USER = [
  "user", "username", "srcuser", "src_user",
];

const ALIASES_MESSAGE = [
  "message", "msg", "description", "log message", "logmessage",
];

// ---------------------------------------------------------------------------
// Vendor detection
// ---------------------------------------------------------------------------

/**
 * Heuristically detect the firewall vendor from the column names present
 * in a raw row. Uses lowercase matching so header capitalisation doesn't matter.
 */
export function detectVendor(row: RawLogRow): FirewallVendor {
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  const has = (col: string) => keys.includes(col);

  if (has("src-address") || has("dst-address")) return "mikrotik";
  if (has("srcip") || has("dstip") || has("sentbyte") || has("rcvdbyte")) return "fortigate";
  if (has("receive_time")) return "paloalto";
  return "generic";
}

// ---------------------------------------------------------------------------
// Core normalizer
// ---------------------------------------------------------------------------

/**
 * Convert a single raw CSV row into a vendor-agnostic NormalizedLog.
 *
 * Rules:
 * - Never throws — every field is optional.
 * - All string values are trimmed.
 * - Numeric fields are converted to actual numbers.
 * - The original row is preserved in `raw` without modification.
 * - Actions are folded into canonical values (allow / deny / drop / reset).
 */
export function normalizeRow(row: RawLogRow): NormalizedLog {
  const map = lowerKeyMap(row);
  const vendor = detectVendor(row);

  // ---- Temporal fields ----
  const timestampRaw = toStr(pick(map, ALIASES_TIMESTAMP));
  const dateRaw = toStr(pick(map, ALIASES_DATE));
  const timeRaw = toStr(pick(map, ALIASES_TIME));

  // Build a combined timestamp when separate date+time columns exist
  let timestamp = timestampRaw;
  if (!timestamp && dateRaw && timeRaw) {
    timestamp = `${dateRaw} ${timeRaw}`;
  } else if (!timestamp && dateRaw) {
    timestamp = dateRaw;
  }

  // ---- Network fields ----
  const srcIp = toStr(pick(map, ALIASES_SRC_IP));
  const dstIp = toStr(pick(map, ALIASES_DST_IP));
  const srcPort = toNum(pick(map, ALIASES_SRC_PORT));
  const dstPort = toNum(pick(map, ALIASES_DST_PORT));
  const natSrcPort = toNum(pick(map, ALIASES_NAT_SRC_PORT));
  const natDstPort = toNum(pick(map, ALIASES_NAT_DST_PORT));
  const protocol = toStr(pick(map, ALIASES_PROTOCOL))?.toLowerCase();

  // ---- Action ----
  const actionRaw = toStr(pick(map, ALIASES_ACTION));
  const action = normalizeAction(actionRaw);

  // ---- Traffic volume ----
  const bytes = toNum(pick(map, ALIASES_BYTES));
  const bytesSent = toNum(pick(map, ALIASES_BYTES_SENT));
  const bytesReceived = toNum(pick(map, ALIASES_BYTES_RECEIVED));
  const packets = toNum(pick(map, ALIASES_PACKETS));
  const packetsSent = toNum(pick(map, ALIASES_PKTS_SENT));
  const packetsReceived = toNum(pick(map, ALIASES_PKTS_RECEIVED));

  // ---- Application / policy ----
  const service = toStr(pick(map, ALIASES_SERVICE));
  const application = toStr(pick(map, ALIASES_APPLICATION));
  const ruleName = toStr(pick(map, ALIASES_RULE));
  const user = toStr(pick(map, ALIASES_USER));
  const message = toStr(pick(map, ALIASES_MESSAGE));

  // Build the result, omitting undefined fields to keep objects lean
  const result: NormalizedLog = {
    vendor,
    raw: row,
  };

  if (timestamp !== undefined) result.timestamp = timestamp;
  if (dateRaw !== undefined) result.date = dateRaw;
  if (timeRaw !== undefined) result.time = timeRaw;
  if (action !== undefined) result.action = action;
  if (protocol !== undefined) result.protocol = protocol;
  if (srcIp !== undefined) result.srcIp = srcIp;
  if (dstIp !== undefined) result.dstIp = dstIp;
  if (srcPort !== undefined) result.srcPort = srcPort;
  if (dstPort !== undefined) result.dstPort = dstPort;
  if (natSrcPort !== undefined) result.natSrcPort = natSrcPort;
  if (natDstPort !== undefined) result.natDstPort = natDstPort;
  if (bytes !== undefined) result.bytes = bytes;
  if (bytesSent !== undefined) result.bytesSent = bytesSent;
  if (bytesReceived !== undefined) result.bytesReceived = bytesReceived;
  if (packets !== undefined) result.packets = packets;
  if (packetsSent !== undefined) result.packetsSent = packetsSent;
  if (packetsReceived !== undefined) result.packetsReceived = packetsReceived;
  if (service !== undefined) result.service = service;
  if (application !== undefined) result.application = application;
  if (ruleName !== undefined) result.ruleName = ruleName;
  if (user !== undefined) result.user = user;
  if (message !== undefined) result.message = message;

  return result;
}

/**
 * Normalize an array of raw CSV rows.
 * Rows that produce an empty result (no recognized fields) are still included —
 * the caller can filter them if needed, but we never silently drop data.
 */
export function normalizeLogs(rows: RawLogRow[]): NormalizedLog[] {
  return rows.map(normalizeRow);
}
