import type { ActionPlan, ActionType, AiRiskLevel, Device, DeviceProtocol, DeviceType } from "@prisma/client";

export type VendorPlannerName = "fortigate" | "mikrotik" | "linux_edge" | "pfsense" | "cisco" | "sophos" | "generic";
export type CommandPlanStatus = "planned" | "needs_clarification" | "unsupported";
export type CommandTransport = "ssh" | "api" | "manual";

export type VendorApiCall = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  description: string;
};

export type VendorCommandPlan = {
  status: CommandPlanStatus;
  vendor: VendorPlannerName;
  deviceId: string | null;
  actionType: ActionType | string;
  transport: CommandTransport;
  commands: string[];
  apiCalls: VendorApiCall[];
  warnings: string[];
  rollbackSteps: string[];
  riskLevel: AiRiskLevel | string;
  requiresApproval: boolean;
  missingFields?: string[];
  questions?: string[];
  unsupportedReason?: string;
};

export type PlannerInput = {
  actionType: ActionType;
  riskLevel: AiRiskLevel;
  device: Device | null;
  parameters: Record<string, unknown>;
};

export type VendorPlanner = {
  vendor: VendorPlannerName;
  supports(device: Device | null): boolean;
  supportedActions: ActionType[];
  plan(input: PlannerInput): VendorCommandPlan;
};

export type ConnectorCapability = {
  vendor: VendorPlannerName;
  deviceTypes: DeviceType[];
  protocols: DeviceProtocol[];
  supportedActions: string[];
  executionEnabled: boolean;
};

export type DeviceConnectionTestResult = {
  connected: boolean;
  deviceId: string;
  vendor?: VendorPlannerName;
  host: string;
  port: number;
  detectedManagementPort?: number;
  managementPortRecovered?: boolean;
  credentialResolved?: boolean;
  credentialName?: string;
  username?: string;
  hostname?: string;
  os?: string;
  ufwAvailable?: boolean;
  ufwStatus?: string;
  listeningPorts?: string;
  listeningPortsCollected?: boolean;
  listeningPortsCheckedAt?: string;
  sshServiceStatus?: string;
  currentSshPort?: number | null;
  mikrotik?: MikroTikDiscovery;
  fortigate?: FortiGateDiscovery;
  sophos?: SophosDiscovery;
  stages: Array<{
    name: "resolve_device" | "resolve_credential" | "tcp_connect" | "ssh_handshake" | "ssh_auth" | "shell" | "prompt" | "privilege" | "platform_detection" | "basic_commands" | "readonly_discovery" | "discovery" | "optional_capabilities";
    status: "ok" | "warning" | "failed";
    code?: string;
    message?: string;
  }>;
  warnings: Array<{ code: string; message: string }>;
  capabilities: {
    canConnect: boolean;
    canRunBasicReadOnly?: boolean;
    canUseUfw?: boolean;
    canOpenPort?: boolean;
    canClosePort?: boolean;
    canReadSystem?: boolean;
    canReadInterfaces?: boolean;
    canReadFirewall?: boolean;
    canReadLogs?: boolean;
    canExecuteWriteActions?: boolean;
  };
  errorCode?: string;
  message?: string;
  diagnostic?: Record<string, unknown>;
};

export type DeviceCapabilities = {
  canTestConnection: boolean;
  canCollectStatus: boolean;
  canUseUfw?: boolean;
  canOpenPort?: boolean;
  canClosePort?: boolean;
  canBlockSourceIp?: boolean;
  canUnblockSourceIp?: boolean;
  canChangeSshPortDryRunOnly?: boolean;
  canReadSystem?: boolean;
  canReadInterfaces?: boolean;
  canReadFirewall?: boolean;
  canReadLogs?: boolean;
  canExecuteWriteActions?: boolean;
  identity?: string;
  routerosVersion?: string;
  architecture?: string;
  uptime?: string;
  cpuLoad?: string;
  memoryFree?: string;
  interfaceCount?: number;
  firewallFilterRuleCount?: number;
  natRuleCount?: number;
  addressListCount?: number;
  serviceSummary?: string[];
  warnings?: Array<{ code: string; message: string }>;
  mikrotik?: MikroTikDiscovery;
  fortigate?: FortiGateDiscovery;
  sophos?: SophosDiscovery;
  canExecuteChangeSshPort: boolean;
  supportedActions: ActionType[];
};

export type MikroTikDiscovery = {
  identity?: string;
  routerosVersion?: string;
  architecture?: string;
  uptime?: string;
  cpuLoad?: string;
  memoryFree?: string;
  interfaces: string[];
  ipAddresses: string[];
  routes: string[];
  firewallFilterRules: string[];
  natRules: string[];
  mangleRules: string[];
  addressLists: string[];
  services: string[];
  recentLogs: string[];
  raw?: Record<string, string>;
};

export type FortiGateDiscovery = {
  version?: string;
  model?: string;
  serial?: string;
  hostname?: string;
  operationMode?: string;
  systemTime?: string;
  licenseStatus?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  sessionCount?: number;
  vdomMode?: "enabled" | "disabled" | "unknown";
  currentVdom?: string;
  zones: string[];
  interfaces: string[];
  interfaceDetails: Array<{ name: string; ip?: string; allowAccess: string[]; status?: string }>;
  defaultRoute?: { gateway?: string; interface?: string };
  dnsServers: string[];
  adminUsers: Array<{ name: string; profile?: string; trustHosts: string[] }>;
  policies: string[];
  addressObjects: string[];
  addressGroups: string[];
  services: string[];
  serviceGroups: string[];
  schedules: string[];
  routes: string[];
  haStatus?: string[];
  raw?: Record<string, string>;
};

export type SophosInterface = {
  name: string;
  hardware: string;
  zone?: string;
  ipAddresses: string[];
  netmask?: string;
  macAddress?: string;
  speed?: string;
  operationalStatus: "up" | "down" | "unknown";
  administrativeStatus: "up" | "down" | "unknown";
};

export type SophosDiscovery = {
  product: "Sophos Firewall";
  apiVersion?: string;
  interfaces: SophosInterface[];
  zones: string[];
  gateways: string[];
  firewallRules: Array<{ name: string; status: "enabled" | "disabled" | "unknown"; action?: string; sourceZones: string[]; destinationZones: string[]; services: string[] }>;
  ipHosts: Array<{ name: string; address?: string; hostType?: string }>;
  services: Array<{ name: string; protocol?: string; ports: string[] }>;
  vpnConnections: Array<{ name: string; status?: string }>;
  collectedAt: string;
};

export type ConnectorDryRun = {
  plannedCommands: string[];
  validationWarnings: string[];
  affectedPorts: number[];
  affectedServices: string[];
  rollbackSteps: string[];
  riskLevel: AiRiskLevel | string;
  requiresApproval: true;
  commandSpecs?: Array<{
    template: string;
    command: string;
    write: boolean;
    target: Record<string, unknown>;
  }>;
  exactTarget?: Record<string, unknown>;
};

export type ConnectorExecutionResult = {
  executed: boolean;
  actionType: ActionType;
  deviceId: string;
  commands: Array<{
    template: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }>;
  warnings: string[];
  rollbackJson?: Record<string, unknown>;
};

export type ConnectorAudit = (eventType: string, message: string, metadata?: unknown) => Promise<unknown>;

export type DeviceConnector = {
  name: VendorPlannerName;
  supports(device: Device | null): boolean;
  supportedActions: ActionType[];
  testConnection(device: Device): Promise<DeviceConnectionTestResult>;
  getCapabilities(device: Device): Promise<DeviceCapabilities>;
  collectStatus(device: Device): Promise<DeviceConnectionTestResult>;
  dryRun(actionPlan: ActionPlan, device: Device): Promise<ConnectorDryRun>;
  execute(actionPlan: ActionPlan, device: Device, audit?: ConnectorAudit): Promise<ConnectorExecutionResult>;
  rollback(actionPlan: ActionPlan, device: Device, audit?: ConnectorAudit): Promise<ConnectorExecutionResult>;
};
