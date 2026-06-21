import type { ActionPlan } from "@prisma/client";
import { buildVendorCommandPlan } from "../connectors/command-planner.service.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function buildDryRun(plan: ActionPlan) {
  const vendorCommandPlan = await buildVendorCommandPlan(plan);
  return {
    ...vendorCommandPlan,
    executable: false,
    connectorStatus: "dry_run_only",
    generatedBy: "deterministic_vendor_planner",
    risk: plan.riskLevel,
    actionType: plan.actionType,
    targetDeviceId: plan.deviceId,
    parameters: asObject(plan.parametersJson),
    approvalRequired: true,
    vendorCommandPlan
  };
}
