import { ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { validateFortiGateAction } from "../actions/fortigate-action-catalog.js";
import { normalizeFortiGateGuidedVpnParameters } from "./fortigate-guided-vpn.schema.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function backupName(device: Device, suffix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const safeDevice = device.name.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 32) || "fortigate";
  return `firewall-log-analyzer-before-${safeDevice}-${stamp}-${suffix}`;
}

export function evaluateFortiGatePolicy(plan: ActionPlan, device: Device) {
  const parameters = plan.actionType === ActionType.fortigate_guided_vpn_setup
    ? normalizeFortiGateGuidedVpnParameters(asObject(plan.parametersJson))
    : asObject(plan.parametersJson);
  const validation = validateFortiGateAction({ ...plan, parametersJson: parameters });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const breakGlass = parameters.breakGlass === true;
  const requiresBackup = validation.commandSpecs.some((spec) => spec.write) && ["high", "critical"].includes(validation.riskLevel);
  const requiresBreakGlass = validation.riskLevel === AiRiskLevel.critical;
  const reason = text(parameters.reason);
  const confirmation = text(parameters.deviceNameConfirmation);
  const executeConfirmation = text(parameters.executeConfirmation);
  const lockoutSensitiveActions = new Set<ActionType>([
    ActionType.fortigate_change_admin_port,
    ActionType.fortigate_disable_unused_admin_service,
    ActionType.fortigate_restrict_admin_trusthost,
    ActionType.fortigate_enable_policy,
    ActionType.fortigate_move_policy,
    ActionType.fortigate_disable_interface,
    ActionType.fortigate_update_interface_ip,
    ActionType.fortigate_create_vlan_interface,
    ActionType.fortigate_create_zone,
    ActionType.fortigate_add_interface_to_zone,
    ActionType.fortigate_remove_interface_from_zone,
    ActionType.fortigate_delete_managed_zone
  ]);
  const lockoutSensitive = lockoutSensitiveActions.has(plan.actionType);

  const capabilities = asObject(device.capabilities);
  const status = asObject(capabilities.fortigateStatus);
  const discovery = asObject(status.fortigate);
  const interfaces = new Set(Array.isArray(discovery.interfaces) ? discovery.interfaces.map(String) : []);
  const zones = new Set(Array.isArray(discovery.zones) ? discovery.zones.map(String) : []);
  const knownPolicyTargets = new Set([...interfaces, ...zones]);
  const vdomMode = text(discovery.vdomMode);
  const configuredVdom = text(parameters.vdom) ?? text(capabilities.fortigateVdom) ?? text(discovery.currentVdom);
  const directInterfaceActions = new Set<ActionType>([
    ActionType.fortigate_set_interface_alias,
    ActionType.fortigate_set_interface_role,
    ActionType.fortigate_enable_interface,
    ActionType.fortigate_disable_interface,
    ActionType.fortigate_update_interface_ip
  ]);
  const interfaceParameters = [
    text(parameters.interfaceName),
    text(parameters.name && directInterfaceActions.has(plan.actionType) ? parameters.name : undefined),
    text(parameters.wanInterface),
    text(parameters.lanInterface),
    text(parameters.parent),
    text(parameters.parentInterface)
  ].filter(Boolean) as string[];
  const policyTargets = [
    ...(plan.actionType === ActionType.fortigate_guided_vpn_setup ? [] : [
      text(parameters.srcintf),
      text(parameters.dstintf),
      text(parameters.srcInterface),
      text(parameters.dstInterface)
    ])
  ].filter(Boolean) as string[];

  if (vdomMode === "enabled" && !configuredVdom) errors.push("FORTIGATE_VDOM_REQUIRED");
  if (interfaces.size > 0) {
    for (const iface of interfaceParameters) {
      if (!interfaces.has(iface) && plan.actionType !== ActionType.fortigate_create_vlan_interface) errors.push(`Interface ${iface} was not found in FortiGate discovery.`);
    }
    const zoneActions = new Set<ActionType>([ActionType.fortigate_create_zone, ActionType.fortigate_add_interface_to_zone, ActionType.fortigate_remove_interface_from_zone]);
    if (zoneActions.has(plan.actionType)) {
      const raw = Array.isArray(parameters.interfaces) ? parameters.interfaces : text(parameters.interfaceName) ? [parameters.interfaceName] : [];
      for (const iface of raw.map(String)) if (!interfaces.has(iface)) errors.push(`Interface ${iface} was not found in FortiGate discovery.`);
    }
  }
  if (knownPolicyTargets.size > 0) {
    for (const target of policyTargets) if (!knownPolicyTargets.has(target)) errors.push(`Policy interface/zone ${target} was not found in FortiGate discovery.`);
  }
  if (plan.actionType === ActionType.fortigate_remove_interface_from_zone && parameters.policyImpactConfirmed !== true) {
    warnings.push("Removing an interface from a zone can affect active policies. High-risk approval is required.");
  }

  if (parameters.deleteAll === true || parameters.all === true) errors.push("Bulk all-object/all-policy operations are blocked.");
  if (parameters.rawCommand === true) errors.push("Raw command execution is blocked.");
  const nonManagedDeletes = new Set<ActionType>([
    ActionType.fortigate_delete_managed_policy,
    ActionType.fortigate_delete_managed_address_object,
    ActionType.fortigate_delete_managed_zone,
    ActionType.fortigate_delete_managed_service
  ]);
  if (nonManagedDeletes.has(plan.actionType) && parameters.managed === false && !breakGlass) {
    errors.push("Deleting non-managed FortiGate objects requires break-glass.");
  }
  if (requiresBreakGlass && !breakGlass) warnings.push("Critical FortiGate action requires breakGlass=true before execution.");
  if (requiresBreakGlass && confirmation !== device.name) warnings.push("Critical FortiGate action requires deviceNameConfirmation to match the device name before execution.");
  if (requiresBreakGlass && executeConfirmation !== "EXECUTE") warnings.push("Critical FortiGate action requires executeConfirmation=EXECUTE before execution.");
  if (requiresBreakGlass && !reason) warnings.push("Critical FortiGate action requires a reason before execution.");
  if (lockoutSensitive) warnings.push("This action may affect management access or traffic path. Verify alternate access before executing.");

  const backupBase = backupName(device, plan.id.slice(-6));
  const backupCommands = requiresBackup ? ["show full-configuration", "show"] : [];
  const preflightCommands = requiresBackup ? [
    ...backupCommands,
    "show firewall policy",
    "show firewall address"
  ] : [];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validation,
    requiresBackup,
    backupName: requiresBackup ? backupBase : undefined,
    backupCommands,
    preflightCommands,
    requiresBreakGlass,
    breakGlass,
    lockoutSensitive,
    lockoutWarning: lockoutSensitive ? "Management lockout or traffic-impact risk detected." : undefined
  };
}
