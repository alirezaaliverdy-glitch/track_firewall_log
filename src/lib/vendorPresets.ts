import type { VendorPreset } from "@/types/mapping";

/**
 * Vendor presets provide a starting-point column mapping for common firewall
 * CSV export formats.  They are intentionally incomplete — the auto-detector
 * in columnMapping.ts fills gaps, and users can override everything in the
 * Column Mapping Wizard.
 */
const VENDOR_PRESETS: VendorPreset[] = [
  // -------------------------------------------------------------------------
  // Generic CSV — minimal assumptions
  // -------------------------------------------------------------------------
  {
    vendor: "generic",
    name: "Generic CSV",
    description: "Use auto-detection for an unknown or custom CSV format.",
    mapping: {},
  },

  // -------------------------------------------------------------------------
  // MikroTik — RouterOS firewall log export
  // Typical columns: time, src-address, dst-address, protocol, src-port, dst-port, action
  // -------------------------------------------------------------------------
  {
    vendor: "mikrotik",
    name: "MikroTik RouterOS",
    description: "RouterOS firewall log export. Uses src-address / dst-address columns.",
    mapping: {
      time:      "time",
      srcIp:     "src-address",
      dstIp:     "dst-address",
      srcPort:   "src-port",
      dstPort:   "dst-port",
      protocol:  "protocol",
      action:    "action",
    },
  },

  // -------------------------------------------------------------------------
  // FortiGate — FortiOS traffic log CSV
  // Typical columns: date, time, srcip, dstip, srcport, dstport, proto,
  //                  action, sentbyte, rcvdbyte, policyname
  // -------------------------------------------------------------------------
  {
    vendor: "fortigate",
    name: "FortiGate FortiOS",
    description: "FortiOS traffic log export. Uses srcip/dstip and sentbyte/rcvdbyte.",
    mapping: {
      date:            "date",
      time:            "time",
      srcIp:           "srcip",
      dstIp:           "dstip",
      srcPort:         "srcport",
      dstPort:         "dstport",
      protocol:        "proto",
      action:          "action",
      bytesSent:       "sentbyte",
      bytesReceived:   "rcvdbyte",
      ruleName:        "policyname",
      service:         "service",
      application:     "app",
    },
  },

  // -------------------------------------------------------------------------
  // pfSense — filterlog CSV export
  // Typical columns: time, interface, action, protocol, src, dst, sport, dport
  // -------------------------------------------------------------------------
  {
    vendor: "pfsense",
    name: "pfSense / OPNsense",
    description: "pfSense filterlog CSV export.",
    mapping: {
      timestamp: "time",
      srcIp:     "src",
      dstIp:     "dst",
      srcPort:   "sport",
      dstPort:   "dport",
      protocol:  "protocol",
      action:    "action",
    },
  },

  // -------------------------------------------------------------------------
  // Palo Alto — traffic log CSV
  // Typical columns: receive_time, src, dst, sport, dport, proto, action,
  //                  bytes, bytes_sent, bytes_received, packets, rule
  // -------------------------------------------------------------------------
  {
    vendor: "paloalto",
    name: "Palo Alto Networks",
    description: "PAN-OS traffic log export. Uses receive_time and rule columns.",
    mapping: {
      timestamp:       "receive_time",
      srcIp:           "src",
      dstIp:           "dst",
      srcPort:         "sport",
      dstPort:         "dport",
      protocol:        "proto",
      action:          "action",
      bytes:           "bytes",
      bytesSent:       "bytes_sent",
      bytesReceived:   "bytes_received",
      packets:         "packets",
      ruleName:        "rule",
      application:     "app",
    },
  },

  // -------------------------------------------------------------------------
  // Sophos XG / Firewall Manager log export
  // Typical columns: Date, Time, Src IP, Dst IP, Src Port, Dst Port,
  //                  Protocol, Action, Bytes Sent, Bytes Received, Rule Name
  // -------------------------------------------------------------------------
  {
    vendor: "sophos",
    name: "Sophos XG / Firewall",
    description: "Sophos XG traffic log export.",
    mapping: {
      date:            "Date",
      time:            "Time",
      srcIp:           "Src IP",
      dstIp:           "Dst IP",
      srcPort:         "Src Port",
      dstPort:         "Dst Port",
      protocol:        "Protocol",
      action:          "Action",
      bytesSent:       "Bytes Sent",
      bytesReceived:   "Bytes Received",
      ruleName:        "Rule Name",
    },
  },

  // -------------------------------------------------------------------------
  // Cisco ASA — CSV export from ASDM or syslog parser
  // Typical columns: Timestamp, Source IP, Source Port, Destination IP,
  //                  Destination Port, Protocol, Action, Bytes, Rule
  // -------------------------------------------------------------------------
  {
    vendor: "ciscoasa",
    name: "Cisco ASA",
    description: "Cisco ASA log export (ASDM or syslog-to-CSV).",
    mapping: {
      timestamp:  "Timestamp",
      srcIp:      "Source IP",
      srcPort:    "Source Port",
      dstIp:      "Destination IP",
      dstPort:    "Destination Port",
      protocol:   "Protocol",
      action:     "Action",
      bytes:      "Bytes",
      ruleName:   "Rule",
    },
  },
];

/** Map from vendor key to preset for O(1) lookup. */
const PRESET_MAP = new Map<string, VendorPreset>(
  VENDOR_PRESETS.map((p) => [p.vendor, p])
);

export function getVendorPreset(vendor: string): VendorPreset | undefined {
  return PRESET_MAP.get(vendor);
}

export function getAllPresets(): VendorPreset[] {
  return VENDOR_PRESETS;
}
