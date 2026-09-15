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

export type LinuxServerOverview = {
  deviceId: string;
  collectedAt: string;
  connection: { host: string; connectionPort: number; status: "online" | "partial" | "error" };
  health: { status: "healthy" | "warning" | "critical"; summary: string; reasons: string[] };
  host: { hostname: string; os: string; kernel: string; uptime: string };
  cpu: { status: "normal" | "warning" | "critical" | "unknown"; usagePercent: number | null; loadAverage: number[]; coreCount: number | null; summary: string };
  memory: { status: "normal" | "warning" | "critical" | "unknown"; totalMb: number | null; usedMb: number | null; usedPercent: number | null; swapUsedPercent: number | null; summary: string };
  disks: Array<{ filesystem: string; mount: string; type: string; size: string; used: string; available: string; usedPercent: number | null; status: "normal" | "warning" | "critical" | "unknown" }>;
  diskIo: { summary: string; devices: string[] };
  network: { interfaces: Array<{ name: string; ips: string[]; rxBytes?: number; txBytes?: number; errors?: number }>; summary: string };
  topProcesses: Array<{ pid: number | null; command: string; cpuPercent: number | null; memoryPercent: number | null }>;
  services: Array<{ name: string; state: "active" | "inactive" | "failed" | "not_found" | "unknown"; summary: string }>;
  listeningPorts: Array<{ protocol: string; localAddress: string; port: number | null; process: string | null }>;
  securitySignals: { status: "normal" | "warning" | "critical"; summary: string; recentWarnings: string[] };
  recentProblems: string[];
  warnings: string[];
  rawSections?: Record<string, string>;
};

export type LinuxLiveLogEvent = {
  streamId: string;
  deviceId: string;
  source: "auth" | "system" | "kernel" | "firewall" | "nginx" | "apache" | "fail2ban" | "docker" | "journal" | "unknown";
  timestamp: string;
  raw: string;
  parsed: Record<string, unknown>;
  severity: LinuxTelemetrySeverity;
  tags: string[];
  suspicious: boolean;
  summary: string;
};
