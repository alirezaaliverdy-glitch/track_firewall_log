import { ActionType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const sophosPlanner: VendorPlanner = {
  vendor: "sophos",
  supportedActions: [ActionType.generic_security_action],
  supports(device) {
    return Boolean(device && /sophos|sfos|cyberoam/i.test(String(device.vendor)) && device.protocol === "api");
  },
  plan(input: PlannerInput): VendorCommandPlan {
    const metadata = record(input.parameters.metadata);
    const catalogId = String(metadata.catalogCommandId ?? metadata.executionTemplateRef ?? "");
    if (!catalogId.startsWith("sophos.")) {
      return { status: "unsupported", vendor: "sophos", deviceId: input.device?.id ?? null, actionType: input.actionType, transport: "manual", commands: [], apiCalls: [], warnings: [], rollbackSteps: [], riskLevel: input.riskLevel, requiresApproval: true, unsupportedReason: "Sophos action is not registered in the controlled command catalog." };
    }
    return {
      status: "planned", vendor: "sophos", deviceId: input.device?.id ?? null, actionType: input.actionType, transport: "api",
      commands: [], apiCalls: [{ method: "POST", path: "/webconsole/APIController", description: `Controlled Sophos operation: ${catalogId}` }],
      warnings: ["The XML payload is built by the registered connector; plaintext credentials and raw AI commands are never accepted."],
      rollbackSteps: catalogId === "sophos.inventory" ? [] : ["Restore the previous object state captured by the connector."],
      riskLevel: input.riskLevel, requiresApproval: catalogId !== "sophos.inventory"
    };
  }
};
