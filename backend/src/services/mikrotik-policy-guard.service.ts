import { ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { validateMikroTikAction } from "../actions/mikrotik-action-catalog.js";

export type MikroTikExpertPolicy = ReturnType<typeof evaluateMikroTikExpertPolicy>;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function deviceNameConfirmed(device: Device, parameters: Record<string, unknown>) {
  return text(parameters.deviceNameConfirmation) === device.name;
}

function discoveredServicePorts(device: Device) {
  const capabilities = asObject(device.capabilities);
  const status = asObject(capabilities.mikrotikStatus);
  const discovery = asObject(status.mikrotik);
  const lines = Array.isArray(discovery.services) ? discovery.services.map(String) : [];
  return lines.flatMap((line) => {
    const name = line.match(/(?:^|\s)name=([^\s]+)/)?.[1]?.replace(/^"|"$/g, "");
    const port = Number(line.match(/(?:^|\s)port=(\d+)/)?.[1]);
    return name && Number.isInteger(port) ? [{ name, port }] : [];
  });
}

function detectedSshPort(device: Device) {
  const discovered = discoveredServicePorts(device).find((service) => service.name === "ssh")?.port;
  if (discovered) return discovered;
  return Number.isInteger(device.managementPort) && device.managementPort > 0 ? device.managementPort : undefined;
}

export function evaluateMikroTikExpertPolicy(plan: ActionPlan, device: Device) {
  const parameters = asObject(plan.parametersJson);
  const sshPortChange = plan.actionType === ActionType.mikrotik_change_service_port && text(parameters.service) === "ssh";
  const oldPort = sshPortChange ? detectedSshPort(device) : undefined;
  const validation = validateMikroTikAction({
    ...plan,
    parametersJson: oldPort && parameters.oldPort === undefined ? { ...parameters, oldPort } : parameters
  });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const breakGlass = parameters.breakGlass === true;
  const reason = text(parameters.reason);
  const backupEnabled = false;
  const wouldRequireBackup = validation.commandSpecs.some((spec) => spec.write) && ["high", "critical"].includes(validation.riskLevel);
  const requiresBackup = false;
  const requiresBreakGlass = validation.riskLevel === AiRiskLevel.critical;
  const lockoutSensitiveActions = new Set<ActionType>([
    ActionType.mikrotik_disable_interface,
    ActionType.mikrotik_change_service_port,
    ActionType.mikrotik_disable_service,
    ActionType.mikrotik_reboot,
    ActionType.mikrotik_shutdown,
    ActionType.mikrotik_schedule_reboot,
    ActionType.mikrotik_disable_rule_by_id,
    ActionType.mikrotik_remove_rule_by_id
  ]);
  const lockoutSensitive = lockoutSensitiveActions.has(plan.actionType);

  if (sshPortChange) {
    const newPort = Number(validation.normalizedParameters.newPort ?? validation.normalizedParameters.port);
    const collision = discoveredServicePorts(device).find((service) => service.name !== "ssh" && service.port === newPort);
    if (collision) errors.push(`newPort ${newPort} is already used by MikroTik service ${collision.name}.`);
    warnings.push("LOCKOUT WARNING: the SSH management endpoint changes immediately after the firewall allow rule is ensured.");
    if (!oldPort) warnings.push("Old SSH port could not be detected; rollback can only show a manual verification warning.");
  }

  if (requiresBreakGlass && !breakGlass) warnings.push("Critical MikroTik action requires breakGlass=true before execution.");
  if (requiresBreakGlass && !deviceNameConfirmed(device, parameters)) warnings.push("Critical MikroTik action requires deviceNameConfirmation to match the device name before execution.");
  if (requiresBreakGlass && !reason) warnings.push("Critical MikroTik action requires a reason before execution.");
  if (lockoutSensitive && !breakGlass) {
    warnings.push("Management lockout risk detected. Execution is blocked unless break-glass is enabled when required.");
  }

  const backupCommands: string[] = [];
  if (wouldRequireBackup) warnings.push("Backup is disabled for Quick Controlled execution.");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validation,
    backupEnabled,
    wouldRequireBackup,
    requiresBackup,
    backupName: undefined,
    backupCommands,
    requiresBreakGlass,
    breakGlass,
    lockoutSensitive,
    lockoutWarning: lockoutSensitive ? "This action may affect the current management path. Verify alternate access before executing." : undefined,
    detectedOldPort: oldPort
  };
}
