import { ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { validateMikroTikAction } from "../actions/mikrotik-action-catalog.js";

export type MikroTikExpertPolicy = ReturnType<typeof evaluateMikroTikExpertPolicy>;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function backupName(device: Device, suffix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const safeDevice = device.name.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 32) || "mikrotik";
  return `firewall-log-analyzer-before-${safeDevice}-${stamp}-${suffix}`;
}

function deviceNameConfirmed(device: Device, parameters: Record<string, unknown>) {
  return text(parameters.deviceNameConfirmation) === device.name;
}

export function evaluateMikroTikExpertPolicy(plan: ActionPlan, device: Device) {
  const parameters = asObject(plan.parametersJson);
  const validation = validateMikroTikAction(plan);
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const breakGlass = parameters.breakGlass === true;
  const reason = text(parameters.reason);
  const requiresBackup = validation.commandSpecs.some((spec) => spec.write) && ["high", "critical"].includes(validation.riskLevel);
  const requiresBreakGlass = validation.riskLevel === AiRiskLevel.critical;
  const lockoutSensitiveActions = new Set<ActionType>([
    ActionType.mikrotik_disable_interface,
    ActionType.mikrotik_change_service_port,
    ActionType.mikrotik_disable_service,
    ActionType.mikrotik_reboot,
    ActionType.mikrotik_schedule_reboot,
    ActionType.mikrotik_disable_rule_by_id,
    ActionType.mikrotik_remove_rule_by_id
  ]);
  const lockoutSensitive = lockoutSensitiveActions.has(plan.actionType);

  if (requiresBreakGlass && !breakGlass) warnings.push("Critical MikroTik action requires breakGlass=true before execution.");
  if (requiresBreakGlass && !deviceNameConfirmed(device, parameters)) warnings.push("Critical MikroTik action requires deviceNameConfirmation to match the device name before execution.");
  if (requiresBreakGlass && !reason) warnings.push("Critical MikroTik action requires a reason before execution.");
  if (lockoutSensitive && !breakGlass) {
    warnings.push("Management lockout risk detected. Execution is blocked unless break-glass is enabled when required.");
  }

  const backupBase = backupName(device, plan.id.slice(-6));
  const backupCommands = requiresBackup ? [
    `/system backup save name="${backupBase}"`,
    `/export hide-sensitive file="${backupBase}"`
  ] : [];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validation,
    requiresBackup,
    backupName: requiresBackup ? backupBase : undefined,
    backupCommands,
    requiresBreakGlass,
    breakGlass,
    lockoutSensitive,
    lockoutWarning: lockoutSensitive ? "This action may affect the current management path. Verify alternate access before executing." : undefined
  };
}
