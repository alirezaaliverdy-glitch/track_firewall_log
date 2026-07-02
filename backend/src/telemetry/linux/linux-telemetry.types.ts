export type LinuxTelemetrySeverity = "info" | "low" | "medium" | "high" | "critical";

export type LinuxSecurityFinding = {
  id: string;
  title: string;
  severity: LinuxTelemetrySeverity;
  confidence: number;
  category: string;
  evidence: string[];
  impact: string;
  recommendation: string;
  relatedActionHints: string[];
  canCreateActionPlan: boolean;
};

export type LinuxSecuritySnapshot = {
  deviceId: string;
  collectedAt: string;
  privilegeLevel: "root" | "sudo" | "limited";
  sudoAvailable: boolean;
  connection: { host: string; connectionPort: number };
  host: { hostname: string; os: string; kernel: string; uptime: string; timezone: string; architecture: string; virtualization: string };
  network: { interfaces: string[]; routes: string[]; listeningPorts: string[]; exposedPorts: number[]; publicExposureSummary: string };
  ssh: { port: number; detectedSshServicePort: number | null; permitRootLogin: string; passwordAuthentication: string; pubkeyAuthentication: string; recentFailures: number; recentSuccesses: number; failureIps: Record<string, number>; successfulAfterFailureIps: string[]; findings: string[] };
  users: { shellUsers: string[]; sudoUsers: string[]; recentLogins: string[]; failedLoginsSummary: string[]; findings: string[] };
  firewall: { ufw: string; iptables: string; nftables: string; firewalld: string; effectiveStatus: "active" | "inactive" | "unknown"; findings: string[] };
  securityTools: { fail2ban: string; auditd: string; unattendedUpgrades: string; findings: string[] };
  containers: { dockerDetected: boolean; runningContainers: string[]; exposedPorts: number[]; privilegedContainers: string[]; findings: string[] };
  services: { importantServices: Record<string, string>; enabledWebSites: string[]; findings: string[] };
  recentLogs: { warnings: string[]; authSignals: string[]; systemSignals: string[] };
  riskSummary: { score: number; severity: LinuxTelemetrySeverity; topFindings: LinuxSecurityFinding[] };
  findings: LinuxSecurityFinding[];
  rawCommandResultsMetadata: Array<{ commandId: string; ok: boolean; skipped: boolean; outputLines: number; warning?: string }>;
};

export type LinuxLiveLogEvent = {
  streamId: string;
  deviceId: string;
  source: "auth" | "system" | "kernel" | "firewall" | "nginx" | "docker" | "journal" | "unknown";
  timestamp: string;
  raw: string;
  parsed: Record<string, unknown>;
  severity: LinuxTelemetrySeverity;
  tags: string[];
  suspicious: boolean;
  summary: string;
};
