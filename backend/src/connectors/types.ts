import type { ActionPlan, ActionType, AiRiskLevel, Device, DeviceProtocol, DeviceType } from "@prisma/client";

export type VendorPlannerName = "fortigate" | "mikrotik" | "linux_edge" | "pfsense" | "generic";
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
  username?: string;
  hostname?: string;
  os?: string;
  ufwAvailable?: boolean;
  ufwStatus?: string;
  listeningPorts?: string;
  sshServiceStatus?: string;
  currentSshPort?: number | null;
  warnings: string[];
  errorCode?: string;
  message?: string;
};

export type DeviceCapabilities = {
  canTestConnection: boolean;
  canCollectStatus: boolean;
  canUseUfw: boolean;
  canOpenPort: boolean;
  canClosePort: boolean;
  canBlockSourceIp: boolean;
  canUnblockSourceIp: boolean;
  canChangeSshPortDryRunOnly: boolean;
  canExecuteChangeSshPort: false;
  supportedActions: ActionType[];
};

export type ConnectorDryRun = {
  plannedCommands: string[];
  validationWarnings: string[];
  affectedPorts: number[];
  affectedServices: string[];
  rollbackSteps: string[];
  riskLevel: AiRiskLevel | string;
  requiresApproval: true;
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
