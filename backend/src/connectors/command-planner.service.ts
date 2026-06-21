import { ActionType, type ActionPlan } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { selectPlanner } from "./connector-registry.service.js";
import type { VendorCommandPlan } from "./types.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function genericPlan(plan: ActionPlan, reason: string): VendorCommandPlan {
  return {
    status: "unsupported",
    vendor: "generic",
    deviceId: plan.deviceId,
    actionType: plan.actionType,
    transport: "manual",
    commands: [],
    apiCalls: [],
    warnings: ["No vendor-specific connector template matched this action/device.", "Dry-run only. No command or API call was executed."],
    rollbackSteps: ["A future connector must provide rollback metadata before execution."],
    riskLevel: plan.riskLevel,
    requiresApproval: true,
    unsupportedReason: reason
  };
}

export async function buildVendorCommandPlan(plan: ActionPlan): Promise<VendorCommandPlan> {
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
  if (!device) {
    return {
      ...genericPlan(plan, "ActionPlan has no registered target device."),
      status: "needs_clarification",
      missingFields: ["deviceId"],
      questions: ["Which registered device should receive this planned change?"]
    };
  }

  if (!(plan.actionType in ActionType)) {
    return genericPlan(plan, "Action type is not registered.");
  }

  const planner = selectPlanner(device);
  if (!planner) {
    return genericPlan(plan, `No planner registered for device type ${device.type} / vendor ${device.vendor}.`);
  }

  if (!planner.supportedActions.includes(plan.actionType)) {
    return genericPlan(plan, `${planner.vendor} planner does not support ${plan.actionType} yet.`);
  }

  return planner.plan({
    actionType: plan.actionType,
    riskLevel: plan.riskLevel,
    device,
    parameters: asObject(plan.parametersJson)
  });
}
