import { AiRiskLevel } from "@prisma/client";
import type { CustomCommandPlan, CustomConnectorVendor } from "../../ai/custom-action-plan.js";
import type { CustomCommandPolicyDecision, CustomCommandPolicyDevice, NormalizedCustomOperation } from "./custom-command-policy.types.js";

export const SECRET_PATTERN = /(password|passphrase|private[-_ ]?key|secret|token|api[-_ ]?key)\s*[=:]\s*\S+/i;
export const LINUX_SHELL_META_PATTERN = /[`$<>]|\$\(|[;&|]|\b(curl|wget|nc|netcat|bash|sh|python|perl|ruby|powershell|cmd\.exe)\b/i;
export const CATASTROPHIC_COMMAND_PATTERN = /\b(factory[- ]?reset|reset-configuration|erase\s+(startup-)?config|write erase|format|delete\s+\*|rm\s+-rf\s+\/|shutdown|factoryreset|export\s+show-sensitive)\b/i;

export function commandLines(plan: Pick<CustomCommandPlan, "orderedCommands" | "verificationCommands">) {
  return [...plan.orderedCommands, ...plan.verificationCommands].map((line) => line.trim()).filter(Boolean);
}

export function commonCommandErrors(plan: CustomCommandPlan) {
  const errors: string[] = [];
  if (plan.orderedCommands.length === 0 && plan.missingFields.length === 0) errors.push("Custom ActionPlan requires at least one ordered command.");
  if (plan.orderedCommands.length > 12) errors.push("Custom ActionPlan may contain at most 12 ordered commands.");
  for (const command of commandLines(plan)) {
    if (command.length > 320) errors.push("Custom command exceeds maximum length.");
    if (SECRET_PATTERN.test(command)) errors.push("Custom command appears to contain a secret.");
    if (CATASTROPHIC_COMMAND_PATTERN.test(command)) errors.push("Custom command is hard-denied as catastrophic.");
  }
  return errors;
}

export function operationFromPlan(plan: CustomCommandPlan, fallback: string): NormalizedCustomOperation {
  return {
    operationType: String(plan.typedParameters.operation ?? fallback),
    typedParameters: plan.typedParameters,
    orderedCommands: plan.orderedCommands,
    verificationCommands: plan.verificationCommands,
    rollbackGuidance: plan.rollbackGuidance,
    expectedImpact: plan.expectedImpact,
    riskLevel: plan.riskLevel,
    timeoutMs: plan.riskLevel === AiRiskLevel.high || plan.riskLevel === AiRiskLevel.critical ? 30_000 : 15_000,
    outputLimitBytes: 64 * 1024,
  };
}

function executionPermissionForRisk(riskLevel: AiRiskLevel) {
  return riskLevel === AiRiskLevel.high || riskLevel === AiRiskLevel.critical
    ? "actions.execute.high_risk"
    : "actions.execute.write";
}

export function baseDecision(input: {
  plan: CustomCommandPlan;
  vendor: CustomConnectorVendor;
  device: CustomCommandPolicyDevice;
  commandAllowed: (command: string) => boolean;
  fallbackOperation: string;
  requiresBackup?: boolean;
  extraErrors?: string[];
  warnings?: string[];
}): CustomCommandPolicyDecision {
  const operation = operationFromPlan(input.plan, input.fallbackOperation);
  const errors = [...commonCommandErrors(input.plan), ...(input.extraErrors ?? [])];
  for (const command of commandLines(input.plan)) {
    if (!input.commandAllowed(command)) errors.push(`Custom command is not allowed for ${input.vendor}: ${command}`);
  }
  if (input.plan.missingFields.length > 0) errors.push(`Missing custom ActionPlan fields: ${input.plan.missingFields.join(", ")}`);
  if (input.plan.verificationCommands.length === 0) errors.push("Mutable custom operations require explicit verification.");
  const highRisk = operation.riskLevel === AiRiskLevel.high || operation.riskLevel === AiRiskLevel.critical;
  return {
    allowed: errors.length === 0,
    errors,
    warnings: input.warnings ?? [],
    missingFields: Array.from(new Set(input.plan.missingFields)),
    requiredRole: highRisk ? "admin" : "operator",
    requiredPermission: executionPermissionForRisk(operation.riskLevel),
    requiresBackup: input.requiresBackup ?? highRisk,
    normalizedOperation: operation,
  };
}

export function vendorText(device: CustomCommandPolicyDevice | null | undefined) {
  return `${String(device?.type ?? "").toLowerCase()} ${String(device?.vendor ?? "").toLowerCase()}`;
}
