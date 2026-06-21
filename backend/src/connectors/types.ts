import type { ActionType, AiRiskLevel, Device, DeviceProtocol, DeviceType } from "@prisma/client";

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
  executionEnabled: false;
};
