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

function actionParameters(parameters: Record<string, unknown>) {
  const metadata = object(parameters.metadata);
  const normalizedParams = object(metadata.normalizedParams);
  return { ...normalizedParams, ...parameters };
}

export const ciscoIosXePlanner: VendorPlanner = {
  vendor: "cisco",
  supportedActions: [ActionType.generic_security_action],
  supports(device) {
    return Boolean(device && isCiscoIosXeSshCandidate(device));
  },
  plan(input: PlannerInput): VendorCommandPlan {
    const operation = findCiscoOperation(operationId(input.parameters));
    if (!operation || operation.state !== "implemented" || (operation.commandIds.length === 0 && !operation.buildCommandSpecs)) {
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
    let commands: string[];
    try {
      commands = operation.buildCommandSpecs
        ? operation.buildCommandSpecs(actionParameters(input.parameters)).map((spec) => spec.command)
        : operation.commandIds.map(ciscoReadCommand);
    } catch (error) {
      return {
        status: "unsupported",
        vendor: "cisco",
        deviceId: input.device?.id ?? null,
        actionType: input.actionType,
        transport: "manual",
        commands: [],
        apiCalls: [],
        warnings: [(error as { message?: string })?.message ?? "Cisco action parameters are invalid."],
        rollbackSteps: [],
        riskLevel: input.riskLevel,
        requiresApproval: true,
        unsupportedReason: "Cisco action parameters are invalid for the registered command template."
      };
    }
    return {
      status: "planned",
      vendor: "cisco",
      deviceId: input.device?.id ?? null,
      actionType: input.actionType,
      transport: "ssh",
      commands,
      apiCalls: [],
      warnings: [`Cisco ${operation.titleEn} runs through the Action Center Cisco SSH2 connector workflow.`],
      rollbackSteps: operation.rollback.available ? operation.rollback.steps : [],
      riskLevel: operation.risk === "low" ? AiRiskLevel.low : input.riskLevel,
      requiresApproval: !operation.readOnly
    };
  }
};
