import type { FirewallVendor, NormalizedLog, RawLogRow } from "./types.js";

function lowerKeyMap(row: RawLogRow): Map<string, RawLogRow[string]> {
  const map = new Map<string, RawLogRow[string]>();
  for (const key of Object.keys(row)) map.set(key.toLowerCase(), row[key]);
  return map;
}

function pick(map: Map<string, RawLogRow[string]>, aliases: string[]): RawLogRow[string] {
  for (const alias of aliases) {
    if (map.has(alias)) return map.get(alias);
  }
  return undefined;
}

function toStr(val: RawLogRow[string]): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  return s === "" ? undefined : s;
}

function toNum(val: RawLogRow[string]): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

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
  "reset-server": "reset"
};

function normalizeAction(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return ACTION_MAP[key] ?? raw.trim();
}

const SRC_IP = ["srcip", "src_ip", "src ip", "source ip", "sourceip", "src-address", "source address", "source", "srcaddr", "src"];
const DST_IP = ["dstip", "dst_ip", "dst ip", "destination ip", "destinationip", "dst-address", "destination address", "destination", "dstaddr", "dst"];
const SRC_PORT = ["srcport", "src_port", "src port", "source port", "sourceport", "src-port", "sport"];
const DST_PORT = ["dstport", "dst_port", "dst port", "destination port", "destinationport", "dst-port", "dport"];
const NAT_SRC_PORT = ["nat source port", "natsrcport", "nat_src_port"];
const NAT_DST_PORT = ["nat destination port", "natdstport", "nat_dst_port"];
const ACTION = ["action", "act", "policy action", "disposition", "policyaction"];
const PROTOCOL = ["protocol", "proto"];
const DATE = ["date", "log date", "logdate"];
const TIME = ["time", "log time", "logtime"];
const TIMESTAMP = ["timestamp", "time stamp", "datetime", "date time", "receive_time"];
const BYTES = ["bytes", "total bytes", "totalbytes"];
const BYTES_SENT = ["bytes sent", "bytessent", "sentbyte", "tx_bytes", "txbytes", "bytes_sent", "byts_sent"];
const BYTES_RECEIVED = ["bytes received", "bytesreceived", "rcvdbyte", "rx_bytes", "rxbytes", "bytes_received", "byts_received"];
const PACKETS = ["packets", "total packets", "totalpackets", "pkt"];
const PKTS_SENT = ["pkts_sent", "packets sent", "packetssent", "tx_packets"];
const PKTS_RECEIVED = ["pkts_received", "packets received", "packetsreceived", "rx_packets"];
const SERVICE = ["service"];
const APPLICATION = ["application", "app", "appname"];
const RULE = ["rule", "rule name", "rulename", "firewall_rule", "security_rule", "acl", "aclrule", "name"];
const POLICY_ID = ["policyid", "policy_id", "policy id"];
const POLICY_NAME = ["policyname", "policy name", "policy"];
const USER = ["user", "username", "srcuser", "src_user"];
const MESSAGE = ["message", "msg", "description", "log message", "logmessage"];

export function detectVendor(row: RawLogRow): FirewallVendor {
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  const has = (col: string) => keys.includes(col);

  if (has("src-address") || has("dst-address")) return "mikrotik";
  if (has("srcip") || has("dstip") || has("sentbyte") || has("rcvdbyte")) return "fortigate";
  if (has("receive_time")) return "paloalto";
  if (has("src_ip") || has("dst_ip") || has("src_mac") || has("dst_mac")) return "ubiquiti";
  return "generic";
}

export function normalizeRow(row: RawLogRow): NormalizedLog {
  const map = lowerKeyMap(row);
  const vendor = detectVendor(row);
  const timestampRaw = toStr(pick(map, TIMESTAMP));
  const dateRaw = toStr(pick(map, DATE));
  const timeRaw = toStr(pick(map, TIME));

  let timestamp = timestampRaw;
  if (!timestamp && dateRaw && timeRaw) timestamp = `${dateRaw} ${timeRaw}`;
  else if (!timestamp && dateRaw) timestamp = dateRaw;

  const policyId = toStr(pick(map, POLICY_ID));
  const policyName = toStr(pick(map, POLICY_NAME));
  const ruleName = toStr(pick(map, RULE)) ?? policyName;
  const ruleDisplayName = policyName ?? ruleName ?? policyId ?? "Unknown Policy";

  const result: NormalizedLog = { vendor, raw: row, ruleDisplayName };
  const fields: Partial<NormalizedLog> = {
    timestamp,
    date: dateRaw,
    time: timeRaw,
    action: normalizeAction(toStr(pick(map, ACTION))),
    protocol: toStr(pick(map, PROTOCOL))?.toLowerCase(),
    srcIp: toStr(pick(map, SRC_IP)),
    dstIp: toStr(pick(map, DST_IP)),
    srcPort: toNum(pick(map, SRC_PORT)),
    dstPort: toNum(pick(map, DST_PORT)),
    natSrcPort: toNum(pick(map, NAT_SRC_PORT)),
    natDstPort: toNum(pick(map, NAT_DST_PORT)),
    bytes: toNum(pick(map, BYTES)),
    bytesSent: toNum(pick(map, BYTES_SENT)),
    bytesReceived: toNum(pick(map, BYTES_RECEIVED)),
    packets: toNum(pick(map, PACKETS)),
    packetsSent: toNum(pick(map, PKTS_SENT)),
    packetsReceived: toNum(pick(map, PKTS_RECEIVED)),
    service: toStr(pick(map, SERVICE)),
    application: toStr(pick(map, APPLICATION)),
    policyId,
    policyName,
    ruleName,
    user: toStr(pick(map, USER)),
    message: toStr(pick(map, MESSAGE))
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

export function normalizeLogs(rows: RawLogRow[]): NormalizedLog[] {
  return rows.map(normalizeRow);
}
