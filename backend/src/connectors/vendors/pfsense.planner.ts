import { ActionType, DeviceType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

function planManual(input: PlannerInput, reason: string): VendorCommandPlan {
  return {
    status: "unsupported",
    vendor: "pfsense",
    deviceId: input.device?.id ?? null,
    actionType: input.actionType,
    transport: "manual",
    commands: [],
    apiCalls: [],
    warnings: ["pfSense API connector is not enabled in this task.", "Dry-run only. No pfSense change was executed."],
    rollbackSteps: ["Document the current pfSense rule/object state before any future manual change."],
    riskLevel: input.riskLevel,
    requiresApproval: true,
    unsupportedReason: reason
  };
}

export const pfsensePlanner: VendorPlanner = {
  vendor: "pfsense",
  supportedActions: [
    ActionType.create_egress_policy,
    ActionType.open_port,
    ActionType.close_port,
    ActionType.block_source_ip_temporary,
    ActionType.unblock_source_ip
  ],
  supports(device) {
    return device?.type === DeviceType.pfsense || String(device?.vendor ?? "").toLowerCase().includes("pfsense");
  },
  plan(input) {
    return planManual(input, "pfSense planner is a manual placeholder until a configured pfSense API integration is available.");
  }
};
