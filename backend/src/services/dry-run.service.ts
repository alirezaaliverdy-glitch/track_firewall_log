import type { ActionPlan } from "@prisma/client";
import { buildVendorCommandPlan } from "../connectors/command-planner.service.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { prisma } from "../db/prisma.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function buildDryRun(plan: ActionPlan) {
  const vendorCommandPlan = await buildVendorCommandPlan(plan);
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
  const connector = selectDeviceConnector(device);
  const connectorDryRun = connector && device && connector.supportedActions.includes(plan.actionType)
    ? await connector.dryRun(plan, device)
    : null;

  return {
    ...vendorCommandPlan,
    ...(connectorDryRun ?? {}),
    commands: connectorDryRun?.plannedCommands ?? vendorCommandPlan.commands,
    rollbackSteps: connectorDryRun?.rollbackSteps ?? vendorCommandPlan.rollbackSteps,
    executable: Boolean(connectorDryRun),
    connectorStatus: connectorDryRun ? "execution_available_after_approval" : "dry_run_only",
    generatedBy: "deterministic_vendor_planner",
    risk: plan.riskLevel,
    actionType: plan.actionType,
    targetDeviceId: plan.deviceId,
    parameters: asObject(plan.parametersJson),
    approvalRequired: true,
    vendorCommandPlan
  };
}
