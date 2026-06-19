/**
 * Represents a single raw row parsed from a CSV file.
 * All values are kept as-is from PapaParse; nothing is coerced here.
 * Treat every value as untrusted input.
 */
export type RawLogRow = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// Vendor detection
// ---------------------------------------------------------------------------

export type FirewallVendor =
  | "generic"
  | "mikrotik"
  | "fortigate"
  | "pfsense"
  | "paloalto"
  | "sophos"
  | "ciscoasa"
  | "ubiquiti"
  | "unknown";

export type FirewallTypeSelection = "auto" | FirewallVendor;

export type IpCategory = "private" | "public" | "loopback" | "link-local" | "invalid" | "missing";
export type TrafficDirection = "inbound" | "outbound" | "internal" | "external" | "loopback" | "unknown";
export type ServiceCategory =
  | "management"
  | "database"
  | "dns"
  | "mail"
  | "file-sharing"
  | "web"
  | "unknown";

// ---------------------------------------------------------------------------
// Normalized log model
// ---------------------------------------------------------------------------

/**
 * A firewall log row mapped to a vendor-agnostic common model.
 * All fields are optional except `vendor` and `raw`.
 * Numeric fields are always actual numbers (never strings).
 */
export type NormalizedLog = {
  /** Combined ISO-like timestamp when available, e.g. "2025-11-08 08:00:00" */
  timestamp?: string;
  /** Date portion, e.g. "2025-11-08" */
  date?: string;
  /** Time portion, e.g. "08:00:00" */
  time?: string;
  /** Normalized action: "allow" | "deny" | "drop" | "reset" | raw value */
  action?: string;
  /** Network protocol, e.g. "tcp", "udp", "icmp" */
  protocol?: string;
  /** Source IP address */
  srcIp?: string;
  /** Destination IP address */
  dstIp?: string;
  /** Source port number */
  srcPort?: number;
  /** Destination port number */
  dstPort?: number;
  /** NAT source port */
  natSrcPort?: number;
  /** NAT destination port */
  natDstPort?: number;
  /** Total bytes transferred */
  bytes?: number;
  /** Bytes sent (outbound) */
  bytesSent?: number;
  /** Bytes received (inbound) */
  bytesReceived?: number;
  /** Total packet count */
  packets?: number;
  /** Packets sent */
  packetsSent?: number;
  /** Packets received */
  packetsReceived?: number;
  /** Service name, e.g. "http", "dns" */
  service?: string;
  /** Application name (NGFW layer-7) */
  application?: string;
  /** Firewall rule or policy name */
  ruleName?: string;
  /** Authenticated user */
  user?: string;
  /** Free-form log message */
  message?: string;
  /** Source IP category derived from RFC1918 and reserved ranges. */
  srcIpCategory?: IpCategory;
  /** Destination IP category derived from RFC1918 and reserved ranges. */
  dstIpCategory?: IpCategory;
  /** Direction derived from source/destination IP categories. */
  trafficDirection?: TrafficDirection;
  /** Service family derived from destination port. */
  serviceCategory?: ServiceCategory;
  /** True when destination port is a management or remote-access service. */
  isManagementTraffic?: boolean;
  /** True when destination port is a database service. */
  isDatabaseTraffic?: boolean;
  /** True when destination port is in the risky service registry. */
  isRiskyServiceTraffic?: boolean;
  /** Detected firewall vendor */
  vendor: FirewallVendor;
  /** Original unmodified CSV row — kept for search and raw display */
  raw: RawLogRow;
};
