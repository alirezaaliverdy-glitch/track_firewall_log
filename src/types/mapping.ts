import type { FirewallVendor } from "./log";

// ---------------------------------------------------------------------------
// Normalized field keys — every mappable field in NormalizedLog
// ---------------------------------------------------------------------------

export type MappableField =
  | "timestamp"
  | "date"
  | "time"
  | "action"
  | "protocol"
  | "srcIp"
  | "dstIp"
  | "srcPort"
  | "dstPort"
  | "natSrcPort"
  | "natDstPort"
  | "bytes"
  | "bytesSent"
  | "bytesReceived"
  | "packets"
  | "packetsSent"
  | "packetsReceived"
  | "service"
  | "application"
  | "ruleName"
  | "user"
  | "message";

/**
 * All mappable field keys in a fixed tuple — useful for iteration
 * without relying on Object.keys ordering.
 */
export const MAPPABLE_FIELDS: MappableField[] = [
  "timestamp", "date", "time",
  "action", "protocol",
  "srcIp", "dstIp",
  "srcPort", "dstPort",
  "natSrcPort", "natDstPort",
  "bytes", "bytesSent", "bytesReceived",
  "packets", "packetsSent", "packetsReceived",
  "service", "application",
  "ruleName", "user", "message",
];

/**
 * Fields that are considered important for detections and analytics.
 * Missing these degrades detection quality significantly.
 */
export const IMPORTANT_FIELDS: MappableField[] = [
  "action",
  "dstPort",
  "srcIp",
  "dstIp",
  "protocol",
];

/** Fields that together constitute a timestamp (at least one group needed). */
export const TIMESTAMP_FIELDS: MappableField[] = ["timestamp", "date", "time"];

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/**
 * Maps each normalized field to the raw CSV column name the user wants to
 * use for it.  `undefined` means "not mapped" — the normalizer will fall
 * back to alias detection for that field.
 */
export type ColumnMapping = Partial<Record<MappableField, string>>;

// ---------------------------------------------------------------------------
// Confidence result
// ---------------------------------------------------------------------------

export type MappingConfidence = {
  /** 0–100 overall confidence score. */
  score: number;
  /** Which important fields are mapped. */
  mappedImportant: MappableField[];
  /** Which important fields are missing from the mapping. */
  missingImportant: MappableField[];
  /** Whether at least one timestamp-related field is mapped. */
  hasTimestamp: boolean;
};

// ---------------------------------------------------------------------------
// Human-readable labels
// ---------------------------------------------------------------------------

export const FIELD_LABELS: Record<MappableField, string> = {
  timestamp:       "Timestamp",
  date:            "Date",
  time:            "Time",
  action:          "Action",
  protocol:        "Protocol",
  srcIp:           "Source IP",
  dstIp:           "Destination IP",
  srcPort:         "Source Port",
  dstPort:         "Destination Port",
  natSrcPort:      "NAT Source Port",
  natDstPort:      "NAT Destination Port",
  bytes:           "Bytes",
  bytesSent:       "Bytes Sent",
  bytesReceived:   "Bytes Received",
  packets:         "Packets",
  packetsSent:     "Packets Sent",
  packetsReceived: "Packets Received",
  service:         "Service",
  application:     "Application",
  ruleName:        "Rule Name",
  user:            "User",
  message:         "Message",
};

// ---------------------------------------------------------------------------
// Vendor preset shape
// ---------------------------------------------------------------------------

export type VendorPreset = {
  vendor: FirewallVendor;
  name: string;
  description: string;
  /** Suggested column mapping for this vendor's typical CSV export. */
  mapping: ColumnMapping;
};
