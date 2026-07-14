import { ActionType, AiRiskLevel } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";
import { isCiscoIosXeSshCandidate } from "../cisco/ios-xe/cisco-iosxe.ssh.connector.js";

function commandId(parameters: Record<string, unknown>) {
  const metadata = parameters.metadata && typeof parameters.metadata === "object" && !Array.isArray(parameters.metadata)
    ? parameters.metadata as Record<string, unknown>
    : {};
  return String(metadata.catalogCommandId ?? "");
}

export const ciscoIosXePlanner: VendorPlanner = {
  vendor: "cisco",
  supportedActions: [ActionType.generic_security_action],
  supports(device) {
    return Boolean(device && isCiscoIosXeSshCandidate(device));
  },
  plan(input: PlannerInput): VendorCommandPlan {
    if (commandId(input.parameters) !== "cisco.show-version") {
      return {
        status: "unsupported",
        vendor: "cisco",
        deviceId: input.device?.id ?? null,
        actionType: input.actionType,
        transport: "manual",
        commands: [],
        apiCalls: [],
        warnings: ["Only the registered Cisco show version template is executable."],
        rollbackSteps: [],
        riskLevel: input.riskLevel,
        requiresApproval: true,
        unsupportedReason: "Cisco action is not registered for controlled execution."
      };
    }
    return {
      status: "planned",
      vendor: "cisco",
      deviceId: input.device?.id ?? null,
      actionType: input.actionType,
      transport: "ssh",
      commands: ["show version"],
      apiCalls: [],
      warnings: ["Read-only Cisco IOS-XE command."],
      rollbackSteps: [],
      riskLevel: AiRiskLevel.low,
      requiresApproval: false
    };
  }
};
