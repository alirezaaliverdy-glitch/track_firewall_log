import { ActionType, AiRiskLevel } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";
import { isCiscoIosXeSshCandidate } from "../cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { ciscoReadCommand } from "../cisco/ios-xe/cisco-iosxe.templates.js";
import { findCiscoOperation } from "../../cisco/cisco-operation-registry.js";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function operationId(parameters: Record<string, unknown>) {
  const metadata = object(parameters.metadata);
  return String(metadata.catalogCommandId ?? metadata.executionTemplateRef ?? "");
}

export const ciscoIosXePlanner: VendorPlanner = {
  vendor: "cisco",
  supportedActions: [ActionType.generic_security_action],
  supports(device) {
    return Boolean(device && isCiscoIosXeSshCandidate(device));
  },
  plan(input: PlannerInput): VendorCommandPlan {
    const operation = findCiscoOperation(operationId(input.parameters));
    if (!operation || operation.state !== "implemented" || operation.commandIds.length === 0) {
      return {
        status: "unsupported",
        vendor: "cisco",
        deviceId: input.device?.id ?? null,
        actionType: input.actionType,
        transport: "manual",
        commands: [],
        apiCalls: [],
        warnings: ["This Cisco operation is not registered for controlled execution."],
        rollbackSteps: [],
        riskLevel: input.riskLevel,
        requiresApproval: true,
        unsupportedReason: "Cisco action is not registered with an implemented command template."
      };
    }
    return {
      status: "planned",
      vendor: "cisco",
      deviceId: input.device?.id ?? null,
      actionType: input.actionType,
      transport: "ssh",
      commands: operation.commandIds.map(ciscoReadCommand),
      apiCalls: [],
      warnings: [`Cisco ${operation.titleEn} is read-only and runs through the Action Center workflow.`],
      rollbackSteps: [],
      riskLevel: operation.risk === "low" ? AiRiskLevel.low : input.riskLevel,
      requiresApproval: false
    };
  }
};