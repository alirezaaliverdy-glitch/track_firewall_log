import { ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { isMikroTikAction, validateMikroTikAction } from "../actions/mikrotik-action-catalog.js";
import { evaluateMikroTikExpertPolicy } from "./mikrotik-policy-guard.service.js";
import { prisma } from "../db/prisma.js";

const PROTECTED_CLOSE_PORTS = new Set([22, 22022, 80, 443, 4000, 4050, 50, 5173]);
const WARNING_PORTS = new Set([22, 22022, 80, 443, 8080, 4000, 4050, 50, 5173]);
const SHELL_KEYS = new Set(["command", "cmd", "shell", "script", "exec", "args"]);
const DEVICE_REQUIRED_ACTIONS = new Set<ActionType>([
  ActionType.create_egress_policy,
  ActionType.update_policy_schedule,
  ActionType.create_address_object,
  ActionType.create_schedule_object,
  ActionType.create_service_object,
  ActionType.add_firewall_rule,
  ActionType.remove_firewall_rule,
  ActionType.enable_rule,
  ActionType.disable_rule,
  ActionType.mikrotik_add_address_list_entry,
  ActionType.mikrotik_remove_address_list_entry,
  ActionType.mikrotik_block_ip_temporary,
  ActionType.mikrotik_create_managed_drop_rule,
  ActionType.mikrotik_enable_managed_rule,
  ActionType.mikrotik_disable_managed_rule,
  ActionType.mikrotik_add_comment_to_rule,
  ActionType.mikrotik_read_firewall_summary
]);

type ValidationResult = {
  valid: boolean;
  requiresApproval: boolean;
  riskLevel: AiRiskLevel;
  errors: string[];
  warnings: string[];
  normalizedParameters: Record<string, unknown>;
  rollbackJson?: Record<string, unknown>;
  device?: Device | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberParam(parameters: Record<string, unknown>, key: string) {
  const value = Number(parameters[key]);
  return Number.isInteger(value) ? value : undefined;
}

function validPort(value: number | undefined) {
  return value !== undefined && value >= 1 && value <= 65535;
}

function validProtocol(value: unknown) {
  const protocol = String(value ?? "tcp").toLowerCase();
  return protocol === "tcp" || protocol === "udp";
}

function textParam(parameters: Record<string, unknown>, key: string) {
  const value = parameters[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayParam(parameters: Record<string, unknown>, key: string) {
  const value = parameters[key];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function hasSource(parameters: Record<string, unknown>) {
  return Boolean(textParam(parameters, "sourceIp") || textParam(parameters, "sourceCidr") || textParam(parameters, "sourceAddressObject"));
}

function hasDestination(parameters: Record<string, unknown>) {
  return Boolean(textParam(parameters, "destination") || textParam(parameters, "dstCidr") || textParam(parameters, "destinationAddressObject"));
}

function isAny(value: unknown) {
  return typeof value === "string" && ["any", "all", "internet", "0.0.0.0/0"].includes(value.toLowerCase());
}

function containsShellShape(parameters: Record<string, unknown>) {
  return Object.keys(parameters).some((key) => SHELL_KEYS.has(key));
}

function currentManagementIp() {
  return process.env.MANAGEMENT_IP ?? process.env.ADMIN_IP;
}

function isPrivateOrLocalIp(ip: string) {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80:");
  }
  const [a, b] = parts;
  return a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
}

export async function validateActionPlan(plan: ActionPlan): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parameters = asObject(plan.parametersJson);
  let device: Device | null = null;

  if (plan.deviceId) {
    device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
    if (!device) errors.push("Target device does not exist.");
  }

  if (!(plan.actionType in ActionType)) errors.push("actionType is not supported.");
  if (containsShellShape(parameters)) errors.push("Free-form shell, command, script, or exec parameters are not allowed.");

  if (isMikroTikAction(plan.actionType)) {
    if (!device) {
      errors.push(`${plan.actionType} requires a valid registered MikroTik device.`);
    } else if (device.type !== "mikrotik" && !String(device.vendor ?? "").toLowerCase().includes("mikrotik")) {
      errors.push(`${plan.actionType} requires a MikroTik device.`);
    } else if (device.protocol !== "ssh") {
      errors.push(`${plan.actionType} requires MikroTik SSH protocol.`);
    }

    const expert = device ? evaluateMikroTikExpertPolicy(plan, device) : null;
    const mikrotikValidation = expert?.validation ?? validateMikroTikAction(plan);
    errors.push(...(expert?.errors ?? mikrotikValidation.errors));
    warnings.push(...(expert?.warnings ?? mikrotikValidation.warnings));
    if (expert?.requiresBackup) warnings.push(`Backup/export preflight required: ${expert.backupName}`);
    if (expert?.requiresBreakGlass) warnings.push("Break-glass confirmation is required.");
    if (expert?.lockoutWarning) warnings.push(expert.lockoutWarning);

    return {
      valid: errors.length === 0,
      requiresApproval: plan.actionType !== ActionType.mikrotik_read_firewall_summary,
      riskLevel: mikrotikValidation.riskLevel,
      errors,
      warnings,
      normalizedParameters: mikrotikValidation.normalizedParameters,
      rollbackJson: {
        ...mikrotikValidation.rollbackJson,
        backupName: expert?.backupName,
        requiresBackup: expert?.requiresBackup,
        requiresBreakGlass: expert?.requiresBreakGlass,
        lockoutSensitive: expert?.lockoutSensitive
      },
      device
    };
  }

  if (DEVICE_REQUIRED_ACTIONS.has(plan.actionType)) {
    if (!plan.deviceId) errors.push(`${plan.actionType} requires deviceId.`);
    if (plan.deviceId && !device) errors.push(`${plan.actionType} requires a valid registered device.`);
  }

  if (plan.actionType === ActionType.create_egress_policy) {
    if (!hasSource(parameters)) errors.push("create_egress_policy requires sourceIp, sourceCidr, or sourceAddressObject.");
    if (!hasDestination(parameters)) errors.push("create_egress_policy requires destination, dstCidr, or destinationAddressObject.");
    if (!textParam(parameters, "action")) errors.push("create_egress_policy requires action allow or deny.");
    if (!textParam(parameters, "scheduleName") && !textParam(parameters, "scheduleDefinition") && parameters.always !== true) {
      errors.push("create_egress_policy requires scheduleName, scheduleDefinition, or always=true.");
    }
    if (arrayParam(parameters, "services").length === 0 && parameters.anyService !== true) {
      errors.push("create_egress_policy requires explicit services or anyService=true.");
    }
    const sourceAny = isAny(parameters.sourceIp) || isAny(parameters.sourceCidr) || isAny(parameters.sourceAddressObject);
    const destinationAny = isAny(parameters.destination) || isAny(parameters.dstCidr) || isAny(parameters.destinationAddressObject);
    const allowAction = String(parameters.action ?? "").toLowerCase() === "allow";
    if (sourceAny && destinationAny && allowAction) {
      warnings.push("Any-source to any-destination allow is critically broad.");
      if (parameters.explicitOverride !== true) {
        errors.push("Any-source to any-destination allow requires explicitOverride=true.");
      }
    }
  }

  if (plan.actionType === ActionType.create_address_object) {
    if (!textParam(parameters, "name")) errors.push("create_address_object requires name.");
    if (!textParam(parameters, "ip") && !textParam(parameters, "cidr")) errors.push("create_address_object requires ip or cidr.");
  }

  if (plan.actionType === ActionType.create_schedule_object || plan.actionType === ActionType.update_policy_schedule) {
    if (!textParam(parameters, "scheduleName")) errors.push(`${plan.actionType} requires scheduleName.`);
    if (!textParam(parameters, "scheduleDefinition") && parameters.always !== true) {
      errors.push(`${plan.actionType} requires scheduleDefinition or always=true.`);
    }
  }

  if (plan.actionType === ActionType.create_service_object) {
    const port = numberParam(parameters, "port");
    if (!textParam(parameters, "name")) errors.push("create_service_object requires name.");
    if (!validPort(port)) errors.push("create_service_object requires a valid port.");
  }

  if (plan.actionType === ActionType.close_port) {
    const port = numberParam(parameters, "port");
    if (!validPort(port)) errors.push("close_port requires a valid port between 1 and 65535.");
    if (!validProtocol(parameters.protocol)) errors.push("close_port protocol must be tcp or udp.");
    if (port && PROTECTED_CLOSE_PORTS.has(port)) errors.push(`Closing protected port ${port} is blocked by policy.`);
    if (port && WARNING_PORTS.has(port)) warnings.push(`Port ${port} is operationally sensitive.`);
  }

  if (plan.actionType === ActionType.open_port) {
    const port = numberParam(parameters, "port");
    if (!validPort(port)) errors.push("open_port requires a valid port between 1 and 65535.");
    if (!validProtocol(parameters.protocol)) errors.push("open_port protocol must be tcp or udp.");
    warnings.push("Opening ports can expose services and requires approval.");
  }

  if (plan.actionType === ActionType.change_ssh_port) {
    const fromPort = numberParam(parameters, "fromPort");
    const toPort = numberParam(parameters, "toPort");
    if (!validPort(fromPort)) errors.push("change_ssh_port requires a valid fromPort.");
    if (!validPort(toPort)) errors.push("change_ssh_port requires a valid toPort between 1 and 65535.");
    if (fromPort && toPort && fromPort === toPort) errors.push("toPort must be different from fromPort.");
  }

  if (plan.actionType === ActionType.block_source_ip_temporary || plan.actionType === ActionType.unblock_source_ip) {
    const srcIp = typeof parameters.srcIp === "string" ? parameters.srcIp : undefined;
    if (!srcIp) errors.push(`${plan.actionType} requires srcIp.`);
    if (plan.actionType === ActionType.block_source_ip_temporary && srcIp && isPrivateOrLocalIp(srcIp)) {
      errors.push("Blocking private, local, or management IPs is blocked by policy.");
    }
    if (srcIp && currentManagementIp() && srcIp === currentManagementIp() && parameters.managementOverride !== true) {
      errors.push("Blocking the current management IP requires managementOverride=true.");
    }
  }

  const rollbackJson = rollbackFor(plan.actionType, parameters);
  if (plan.actionType === ActionType.change_ssh_port && !rollbackJson) {
    errors.push("change_ssh_port requires rollback metadata.");
  }

  return {
    valid: errors.length === 0,
    requiresApproval: true,
    riskLevel: plan.riskLevel,
    errors,
    warnings,
    normalizedParameters: parameters,
    rollbackJson,
    device
  };
}

export function rollbackFor(actionType: ActionType, parameters: Record<string, unknown>) {
  if (actionType === ActionType.change_ssh_port) {
    return {
      type: "restore_ssh_port",
      steps: [
        `Keep old SSH port ${parameters.fromPort ?? "unknown"} available until validation succeeds.`,
        `If validation fails, restore SSH listener to ${parameters.fromPort ?? "previous port"}.`,
        "Reload SSH service after restoring config.",
        "Remove temporary allow rule for the new SSH port."
      ]
    };
  }

  if (actionType === ActionType.close_port) {
    return {
      type: "reopen_port",
      port: parameters.port,
      protocol: parameters.protocol ?? "tcp"
    };
  }

  if (actionType === ActionType.open_port) {
    return {
      type: "close_opened_port",
      port: parameters.port,
      protocol: parameters.protocol ?? "tcp"
    };
  }

  if (actionType === ActionType.block_source_ip_temporary) {
    return {
      type: "remove_temporary_block",
      srcIp: parameters.srcIp,
      expiresAfterMinutes: parameters.durationMinutes ?? 30
    };
  }

  if (actionType === ActionType.unblock_source_ip) {
    return {
      type: "restore_source_block",
      srcIp: parameters.srcIp
    };
  }

  if (actionType === ActionType.create_egress_policy) {
    return {
      type: "remove_created_policy_objects",
      steps: [
        "Remove the created firewall policy if future execution succeeds.",
        "Remove created schedule/address/service objects only if they are not reused.",
        "Restore previous policy order if insertion position caused shadowing."
      ]
    };
  }

  return {
    type: "manual_review",
    note: "Rollback must be defined by the future device connector before execution."
  };
}
