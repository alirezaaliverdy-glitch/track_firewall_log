import type { NormalizedLog, RawLogRow, FirewallTypeSelection } from "@/types/log";
import type { LogCapability, LogProfile, VendorType } from "@/types/logProfile";

type VendorScore = { vendor: VendorType; score: number; matches: string[] };

const IMPORTANT_FIELDS = ["srcIp", "dstIp", "dstPort", "action"];
function rawKeys(rawRows: RawLogRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rawRows.slice(0, 50)) {
    for (const key of Object.keys(row)) keys.add(key.toLowerCase().trim());
  }
  return Array.from(keys);
}

function rawText(rawRows: RawLogRow[]): string {
  return rawRows
    .slice(0, 50)
    .map((row) => Object.values(row).join(" "))
    .join(" ")
    .toLowerCase();
}

function scoreVendor(keys: string[], text: string, vendor: VendorType, indicators: string[], patterns: RegExp[] = []): VendorScore {
  const matches = indicators.filter((indicator) => keys.includes(indicator.toLowerCase()));
  const patternMatches = patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
  return {
    vendor,
    score: matches.length + patternMatches.length,
    matches: [...matches, ...patternMatches],
  };
}

function toVendorType(selectedVendor: FirewallTypeSelection): VendorType {
  if (selectedVendor === "ciscoasa") return "cisco-asa";
  if (selectedVendor === "auto") return "unknown";
  return selectedVendor as VendorType;
}

export function detectVendorFromFields(rawRows: RawLogRow[], normalizedLogs: NormalizedLog[]): VendorType {
  const keys = rawKeys(rawRows);
  const text = rawText(rawRows);

  const scores = [
    scoreVendor(keys, text, "fortigate", [
      "policyid", "policyname", "logid", "subtype", "vd", "srcip", "dstip",
      "dstport", "sentbyte", "rcvdbyte", "action", "service", "appcat", "utmaction",
    ]),
    scoreVendor(keys, text, "mikrotik", [
      "topics", "firewall", "chain", "in-interface", "out-interface", "src-address",
      "dst-address", "src-port", "dst-port", "protocol", "action", "connection-state",
      "routeros", "winbox",
    ], [/firewall,info/, /\binput:/, /\bforward:/, /\bprerouting:/, /\bsrcnat:/, /\bdstnat:/]),
    scoreVendor(keys, text, "pfsense", [
      "filterlog", "rule", "tracker", "interface", "reason", "act", "direction",
      "ipversion", "protocol", "src", "dst", "srcport", "dstport",
    ]),
    scoreVendor(keys, text, "paloalto", [
      "subtype", "receive_time", "serial", "type", "threat_content_type", "src",
      "dst", "rule", "app", "action", "session_end_reason",
    ]),
    scoreVendor(keys, text, "cisco-asa", [], [
      /asa-/, /%asa/, /access-list/, /built inbound/, /built outbound/, /\bdeny\b/, /teardown tcp connection/,
    ]),
  ].sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (best.score >= 3) return best.vendor;
  if (normalizedLogs.some((log) => log.vendor === "ubiquiti")) return "ubiquiti";
  if (normalizedLogs.some((log) => log.vendor === "sophos")) return "sophos";
  return "generic";
}

export function calculateFieldCoverage(normalizedLogs: NormalizedLog[]): Record<string, number> {
  const fields = [
    "timestamp", "action", "srcIp", "dstIp", "srcPort", "dstPort", "protocol",
    "bytes", "packets", "service", "application", "user", "policyId", "policyName",
    "ruleName", "ruleDisplayName", "natSrcPort", "natDstPort",
  ];
  const total = normalizedLogs.length || 1;
  return Object.fromEntries(
    fields.map((field) => [
      field,
      normalizedLogs.filter((log) => {
        const value = log[field as keyof NormalizedLog];
        if (field === "ruleDisplayName" && value === "Unknown Policy") return false;
        return value !== undefined && value !== null && String(value).trim() !== "";
      }).length / total,
    ])
  );
}

export function detectAvailableFields(normalizedLogs: NormalizedLog[], rawRows: RawLogRow[]): string[] {
  const coverage = calculateFieldCoverage(normalizedLogs);
  const normalized = Object.entries(coverage)
    .filter(([, value]) => value > 0)
    .map(([field]) => field);
  return Array.from(new Set([...normalized, ...rawKeys(rawRows)]));
}

function inferFormat(rawRows: RawLogRow[]): string {
  const keys = rawKeys(rawRows);
  if (keys.includes("rawmessage")) {
    if (keys.some((key) => ["srcip", "dstip", "policyid", "policyname"].includes(key))) return "logfmt";
    return "text";
  }
  if (keys.length <= 2 && keys.includes("message")) return "text";
  return "structured";
}

export function getDisabledCapabilityReason(capability: LogCapability, profile: LogProfile): string {
  return profile.disabledCapabilities[capability] ?? "This analysis is not supported by the available fields.";
}

export function inferCapabilities(profile: LogProfile): {
  capabilities: LogCapability[];
  disabledCapabilities: Partial<Record<LogCapability, string>>;
} {
  const has = (field: string) => (profile.fieldCoverage[field] ?? 0) > 0;
  const hasUsefulPolicy =
    has("policyId") ||
    has("policyName") ||
    has("ruleName") ||
    (profile.fieldCoverage.ruleDisplayName ?? 0) > 0.05;

  const capabilities: LogCapability[] = [];
  const disabledCapabilities: Partial<Record<LogCapability, string>> = {};
  const enable = (capability: LogCapability, enabled: boolean, reason: string) => {
    if (enabled) capabilities.push(capability);
    else disabledCapabilities[capability] = reason;
  };

  enable("trafficSummary", profile.availableFields.length > 0, "No usable log rows were found.");
  enable("trafficDirection", has("srcIp") && has("dstIp"), "Source IP and Destination IP are required for traffic direction.");
  enable("sensitivePorts", has("dstPort"), "Destination Port is required for sensitive port analysis.");
  enable("securityFindings", has("dstPort") || (has("srcIp") && has("dstIp")), "Findings require destination ports or source/destination IPs.");
  enable("policyReview", hasUsefulPolicy, "No policy or rule fields were found in this log.");
  enable("ruleReview", hasUsefulPolicy, "No rule, ACL, or policy name fields were found in this log.");
  enable("natAnalysis", has("natSrcPort") || has("natDstPort"), "No NAT fields were found in this log.");
  enable("userAnalysis", has("user"), "No user field was found in this log.");
  enable("applicationAnalysis", has("application") || has("service"), "No application or service field was found in this log.");
  enable("geoAnalysis", false, "Geo analysis is not available because no geo-enrichment is performed client-side.");
  enable("evidenceFiltering", profile.availableFields.length > 0, "No usable log rows were found.");
  enable("export", profile.availableFields.length > 0, "No usable log rows were found.");

  return { capabilities, disabledCapabilities };
}

export function buildLogProfile(
  rawRows: RawLogRow[],
  normalizedLogs: NormalizedLog[],
  selectedVendor: FirewallTypeSelection
): LogProfile {
  const detectedVendor = detectVendorFromFields(rawRows, normalizedLogs);
  const selectedVendorType = toVendorType(selectedVendor);
  const effectiveVendor = selectedVendor === "auto" ? detectedVendor : selectedVendorType;
  const fieldCoverage = calculateFieldCoverage(normalizedLogs);
  const availableFields = detectAvailableFields(normalizedLogs, rawRows);
  const missingFields = IMPORTANT_FIELDS.filter((field) => (fieldCoverage[field] ?? 0) === 0);
  const confidence = Math.min(
    0.99,
    Math.max(0.35, availableFields.length / 20 + (detectedVendor !== "generic" ? 0.35 : 0))
  );

  const baseProfile: LogProfile = {
    detectedVendor,
    selectedVendor,
    effectiveVendor,
    detectedFormat: inferFormat(rawRows),
    confidence,
    availableFields,
    missingFields,
    capabilities: [],
    disabledCapabilities: {},
    fieldCoverage,
    reasons: [],
  };

  const inferred = inferCapabilities(baseProfile);
  return {
    ...baseProfile,
    ...inferred,
    reasons: [
      `${detectedVendor} detected from field signatures.`,
      missingFields.length > 0
        ? `Missing fields: ${missingFields.join(", ")}.`
        : "Core analysis fields are present.",
    ],
  };
}
