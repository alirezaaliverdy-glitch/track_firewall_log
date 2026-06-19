import type { FirewallTypeSelection } from "@/types/log";

export type VendorType =
  | "fortigate"
  | "mikrotik"
  | "pfsense"
  | "paloalto"
  | "cisco-asa"
  | "sophos"
  | "ubiquiti"
  | "generic"
  | "unknown";

export type LogCapability =
  | "trafficSummary"
  | "trafficDirection"
  | "sensitivePorts"
  | "securityFindings"
  | "policyReview"
  | "ruleReview"
  | "natAnalysis"
  | "userAnalysis"
  | "applicationAnalysis"
  | "geoAnalysis"
  | "evidenceFiltering"
  | "export";

export type LogProfile = {
  detectedVendor: VendorType;
  selectedVendor: FirewallTypeSelection;
  effectiveVendor: VendorType;
  detectedFormat: string;
  confidence: number;
  availableFields: string[];
  missingFields: string[];
  capabilities: LogCapability[];
  disabledCapabilities: Partial<Record<LogCapability, string>>;
  fieldCoverage: Record<string, number>;
  reasons: string[];
};
