import { DeviceType } from "@prisma/client";
import { fortiGateSupportedActions } from "../../actions/fortigate-action-catalog.js";
import { compileFortiGateAction } from "../../services/fortigate-command-compiler.js";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

function base(input: PlannerInput): VendorCommandPlan {
  return {
    status: "planned",
    vendor: "fortigate",
    deviceId: input.device?.id ?? null,
    actionType: input.actionType,
    transport: "ssh",
    commands: [],
    apiCalls: [],
    warnings: [],
    rollbackSteps: [],
    riskLevel: input.riskLevel,
    requiresApproval: true
  };
}

export const fortigatePlanner: VendorPlanner = {
  vendor: "fortigate",
  supportedActions: fortiGateSupportedActions(),
  supports(device) {
    return device?.type === DeviceType.fortigate || String(device?.vendor ?? "").toLowerCase().includes("forti");
  },
  plan(input) {
    const plan = base(input);
    try {
      const compiled = compileFortiGateAction({
        actionType: input.actionType,
        parameters: input.parameters,
        riskLevel: input.riskLevel
      });
      return {
        ...plan,
        commands: compiled.commandSpecs.map((spec) => spec.command),
        warnings: compiled.warnings,
        rollbackSteps: compiled.commandSpecs.flatMap((spec) => spec.rollbackSteps),
        riskLevel: compiled.riskLevel,
        requiresApproval: compiled.commandSpecs.some((spec) => spec.write)
      };
    } catch (error) {
      return {
        ...plan,
        status: "needs_clarification",
        missingFields: ["parameters"],
        questions: ["Complete the required FortiGate fields from device discovery, then dry-run again."],
        warnings: ["FortiGate commands are compiled only from structured parameters; raw CLI is not accepted."],
        unsupportedReason: error instanceof Error ? error.message : "FortiGate action could not be compiled."
      };
    }
  }
};
