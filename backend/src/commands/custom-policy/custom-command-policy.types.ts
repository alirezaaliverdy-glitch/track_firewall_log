import { AiRiskLevel, type Device } from "@prisma/client";
import type { CustomCommandPlan, CustomConnectorVendor } from "../../ai/custom-action-plan.js";

export type CustomCommandPolicyDevice = Pick<Device, "id" | "type" | "vendor" | "protocol">;

export type NormalizedCustomOperation = {
  operationType: string;
  typedParameters: Record<string, unknown>;
  orderedCommands: string[];
  verificationCommands: string[];
  rollbackGuidance: string[];
  expectedImpact: string;
  riskLevel: AiRiskLevel;
  timeoutMs: number;
  outputLimitBytes: number;
};

export type CustomCommandPolicyDecision = {
  allowed: boolean;
  errors: string[];
  warnings: string[];
  missingFields: string[];
  requiredRole: "operator" | "admin";
  requiredPermission: "actions.execute.write" | "actions.execute.high_risk";
  requiresBackup: boolean;
  normalizedOperation: NormalizedCustomOperation;
};

export type CustomCommandPolicyInput = {
  plan: CustomCommandPlan;
  device: CustomCommandPolicyDevice;
};

export type VendorCustomCommandPolicy = {
  vendor: CustomConnectorVendor;
  supportsDevice(device: CustomCommandPolicyDevice | null | undefined): boolean;
  parse(input: CustomCommandPolicyInput): NormalizedCustomOperation;
  evaluate(input: CustomCommandPolicyInput): CustomCommandPolicyDecision;
};
