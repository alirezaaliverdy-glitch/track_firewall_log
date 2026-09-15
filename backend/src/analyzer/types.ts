export type RawLogRow = Record<string, string | number | boolean | null | undefined>;

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
export type ServiceCategory = "management" | "database" | "dns" | "mail" | "file-sharing" | "web" | "unknown";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type NormalizedLog = {
  timestamp?: string;
  date?: string;
  time?: string;
  action?: string;
  protocol?: string;
  srcIp?: string;
  dstIp?: string;
  srcPort?: number;
  dstPort?: number;
  natSrcPort?: number;
  natDstPort?: number;
  bytes?: number;
  bytesSent?: number;
  bytesReceived?: number;
  packets?: number;
  packetsSent?: number;
  packetsReceived?: number;
  service?: string;
  application?: string;
  ruleName?: string;
  policyId?: string;
  policyName?: string;
  ruleDisplayName?: string;
  user?: string;
  message?: string;
  srcIpCategory?: IpCategory;
  dstIpCategory?: IpCategory;
  trafficDirection?: TrafficDirection;
  serviceCategory?: ServiceCategory;
  isManagementTraffic?: boolean;
  isDatabaseTraffic?: boolean;
  isRiskyServiceTraffic?: boolean;
  vendor: FirewallVendor;
  raw: RawLogRow;
};

export type ImportWarning = {
  line?: number;
  message: string;
};

export type ImportParseResult = {
  rows: RawLogRow[];
  warnings: ImportWarning[];
};

export type ImportedFileType = "csv" | "tsv" | "json" | "ndjson" | "logfmt" | "syslog" | "text" | "unknown";

export type FreqEntry = { value: string; count: number };

export type AnalysisSummary = {
  total: number;
  allowed: number;
  denied: number;
  dropped: number;
  reset: number;
  unknownAction: number;
  totalBytes: number;
  totalPackets: number;
  uniqueSrcIps: number;
  uniqueDstIps: number;
  topDstPorts: FreqEntry[];
  topSrcPorts: FreqEntry[];
  topActions: FreqEntry[];
  hasFields: {
    srcIp: boolean;
    dstIp: boolean;
    timestamp: boolean;
    protocol: boolean;
    dstPort: boolean;
  };
};

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

export type SecurityFinding = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  count: number;
  relatedLogs: NormalizedLog[];
  mitreTactic?: string;
  mitreTechnique?: string;
};

export type SensitivePortSummary = {
  port: number;
  service: string;
  severity: Severity;
  reason: string;
  recommendation: string;
  total: number;
  allowed: number;
  blocked: number;
  other: number;
};

export type TrafficIntelligence = {
  directionCounts: Record<TrafficDirection, number>;
  exposedManagement: number;
  exposedDatabase: number;
  inboundRisky: number;
  missingIpData: number;
};

export type PolicyFreqEntry = { value: string; count: number };

export type PolicyReview = {
  policyKey: string;
  policyName: string;
  policyId?: string;
  totalEvents: number;
  allowedEvents: number;
  blockedEvents: number;
  deniedEvents: number;
  droppedEvents: number;
  inboundEvents: number;
  outboundEvents: number;
  internalEvents: number;
  unknownDirectionEvents: number;
  managementTrafficEvents: number;
  databaseTrafficEvents: number;
  sensitivePortEvents: number;
  uniqueSourceIps: number;
  uniqueDestinationIps: number;
  topDestinationPorts: PolicyFreqEntry[];
  topServices: PolicyFreqEntry[];
  topSourceIps: PolicyFreqEntry[];
  topDestinationIps: PolicyFreqEntry[];
  firstSeen?: string;
  lastSeen?: string;
  riskScore: number;
  riskLevel: Severity;
  recommendation: string;
  relatedLogs: NormalizedLog[];
};

export type AnalysisResult = {
  summary: AnalysisSummary;
  logProfile: LogProfile;
  trafficIntelligence: TrafficIntelligence;
  sensitivePorts: SensitivePortSummary[];
  policyReview: PolicyReview[];
  findings: SecurityFinding[];
  normalizedLogs: NormalizedLog[];
  parseWarnings: ImportWarning[];
  rowCount: number;
};
