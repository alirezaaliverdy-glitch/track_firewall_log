import { DeviceType } from "@prisma/client";
import { mikroTikSupportedActions, validateMikroTikAction } from "../../actions/mikrotik-action-catalog.js";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

export const mikrotikPlanner: VendorPlanner = {
  vendor: "mikrotik",
  supportedActions: mikroTikSupportedActions(),
  supports(device) {
    return device?.type === DeviceType.mikrotik || String(device?.vendor ?? "").toLowerCase().includes("mikrotik");
  },
  plan(input: PlannerInput): VendorCommandPlan {
    const validation = validateMikroTikAction({
      actionType: input.actionType,
      parametersJson: input.parameters,
      riskLevel: input.riskLevel
    });

    if (!validation.valid) {
      return {
        status: "needs_clarification",
        vendor: "mikrotik",
        deviceId: input.device?.id ?? null,
        actionType: input.actionType,
        transport: "ssh",
        commands: [],
        apiCalls: [],
        warnings: validation.warnings,
        rollbackSteps: [],
        riskLevel: validation.riskLevel,
        requiresApproval: true,
        missingFields: validation.errors,
        questions: validation.errors
      };
    }

    return {
      status: "planned",
      vendor: "mikrotik",
      deviceId: input.device?.id ?? null,
      actionType: input.actionType,
      transport: "ssh",
      commands: validation.commandSpecs.map((spec) => spec.command),
      apiCalls: [],
      warnings: validation.warnings,
      rollbackSteps: validation.commandSpecs.flatMap((spec) => spec.rollbackSteps),
      riskLevel: validation.riskLevel,
      requiresApproval: validation.commandSpecs.some((spec) => spec.write),
      unsupportedReason: undefined
    };
  }
};
