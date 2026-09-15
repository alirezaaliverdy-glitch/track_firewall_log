import type { ActionPlan, DeviceDetails, PlanValidationResult, RiskLevel } from "../../contracts/src/index";

const RAW_SHELL_KEYS = new Set(["command", "cmd", "shell", "script", "exec", "args"]);

export function hasRawShellShape(parameters: Record<string, unknown>) {
  return Object.keys(parameters).some((key) => RAW_SHELL_KEYS.has(key));
}

export function isMonitoringPlan(plan: Pick<ActionPlan, "actionType" | "parameters" | "commandSpecs">) {
  return plan.actionType.startsWith("monitoring.") || plan.parameters.monitoring === true;
}

export function evaluateLocalPolicyGuard(plan: ActionPlan, device?: DeviceDetails | null): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let riskLevel: RiskLevel = plan.riskLevel;

  if (!device) errors.push("Target device is required.");
  if (device && device.id !== plan.deviceId) errors.push("ActionPlan device binding does not match the selected device.");
  if (hasRawShellShape(plan.parameters)) errors.push("Raw shell parameters are not allowed.");
  if (plan.commandSpecs.length === 0) errors.push("A deterministic command template is required.");
  if (isMonitoringPlan(plan) && plan.commandSpecs.some((command) => !command.readOnly)) {
    errors.push("Monitoring plans must contain only read-only commands.");
  }
  if (plan.commandSpecs.some((command) => /StrictHostKeyChecking\s*=\s*no|accept.?all/i.test(command.command))) {
    errors.push("Host-key bypass is not allowed.");
  }
  if (plan.commandSpecs.some((command) => !command.readOnly)) riskLevel = riskLevel === "low" ? "medium" : riskLevel;
  if (device && !device.credentialRef) warnings.push("Credential reference is required before SSH execution.");
  if (device && !device.trustedHostKeyRef) warnings.push("Trusted host-key fingerprint is required before SSH execution.");

  return { valid: errors.length === 0, errors, warnings, riskLevel };
}
