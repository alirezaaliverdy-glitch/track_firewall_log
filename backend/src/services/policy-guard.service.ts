import { ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { isFortiGateAction, validateFortiGateAction } from "../actions/fortigate-action-catalog.js";
import { isMikroTikAction, validateMikroTikAction } from "../actions/mikrotik-action-catalog.js";
import { evaluateFortiGatePolicy } from "./fortigate-policy-guard.service.js";
import { evaluateMikroTikExpertPolicy } from "./mikrotik-policy-guard.service.js";
import { prisma } from "../db/prisma.js";
import { getActionCatalogEntry, validateCatalogParameters } from "../actions/action-catalog.js";
import { EXPECTED_FORMATS, validateCanonicalFieldShapes, validationError, type StructuredValidationError } from "../actions/action-validators.js";
import { normalizeIntent } from "../actions/intent-normalizer.js";
import { resolveTrustedManagementSource } from "./action-preflight.service.js";
import { env } from "../config/env.js";
import { normalizeFortiGateGuidedVpnParameters, validateFortiGateGuidedVpnParameters } from "./fortigate-guided-vpn.schema.js";
import { customPlanFromParameters, validateCustomCommandPlan } from "../ai/custom-action-plan.js";

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
  ActionType.mikrotik_read_firewall_summary,
  ActionType.linux_check_service_status,
  ...Object.values(ActionType).filter((actionType) => actionType.startsWith("linux_")),
  ...Object.values(ActionType).filter((actionType) => actionType.startsWith("fortigate_"))
]);

type ValidationResult = {
  valid: boolean;
  requiresApproval: boolean;
  riskLevel: AiRiskLevel;
  errors: string[];
  fieldErrors: StructuredValidationError[];
  warnings: string[];
  missingFields: string[];
  compilerError?: string | null;
  policyGuardError?: string | null;
  exactReason?: string | null;
  normalizedParameters: Record<string, unknown>;
  rollbackJson?: Record<string, unknown>;
  device?: Device | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isActionPlanControlSource(value: unknown) {
  return typeof value === "string" && ["command_catalog", "command_search_ai_fallback", "ai_mapped_template", "guided_action_wizard", "ai_custom_connector_plan"].includes(value);
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
  return Boolean(textParam(parameters, "destinationIp") || textParam(parameters, "destinationCidr") || textParam(parameters, "destination") || textParam(parameters, "dstCidr") || textParam(parameters, "destinationAddressObject"));
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

function missingFieldsFromErrors(errors: string[]) {
  return Array.from(new Set(errors.flatMap((error) => {
    if (/Allowed source is required/i.test(error)) return ["trustedSourceCidr"];
    const required = error.match(/\b([A-Za-z0-9_]+) is required\b/);
    if (required) return [required[1]];
    const requires = error.match(/requires ([A-Za-z0-9_]+)/);
    if (requires) return [requires[1].replace(/\.$/, "")];
    if (error.includes("deviceId")) return ["deviceId"];
    if (error.includes("target device") || error.includes("registered device")) return ["deviceId"];
    return [];
  })));
}

function exactReasonFrom(errors: string[]) {
  const invalidIp = errors.find((error) => /valid IPv4|valid IP|invalid IP|address is invalid/i.test(error));
  if (invalidIp) return "invalid IP address";
  return errors[0] ?? null;
}

async function credentialExists(device: Device | null) {
  if (!device) return false;
  if (device.credentialId) {
    return (await prisma.deviceCredential.count({ where: { id: device.credentialId } })) > 0;
  }
  if (device.credentialRef) {
    const dbCredential = await prisma.deviceCredential.count({ where: { name: device.credentialRef } });
    if (dbCredential > 0) return true;
    try {
      const envCredentials = JSON.parse(process.env.SSH_CREDENTIALS_JSON ?? "{}") as Record<string, unknown>;
      return Boolean(envCredentials[device.credentialRef]);
    } catch {
      return false;
    }
  }
  return false;
}

function connectorExists(device: Device | null, vendor: "mikrotik" | "fortigate" | "linux_edge" | "cisco" | "sophos") {
  if (!device) return false;
  const deviceVendor = String(device.vendor ?? "").toLowerCase();
  if (vendor === "mikrotik") {
    return device.protocol === "ssh" && (device.type === "mikrotik" || deviceVendor.includes("mikrotik") || deviceVendor.includes("routeros"));
  }
  if (vendor === "fortigate") {
    return device.protocol === "ssh" && (device.type === "fortigate" || deviceVendor.includes("forti"));
  }
  if (vendor === "cisco") {
    return device.protocol === "ssh" && deviceVendor.includes("cisco");
  }
  if (vendor === "sophos") {
    return device.protocol === "api" && (deviceVendor.includes("sophos") || deviceVendor.includes("sfos") || deviceVendor.includes("cyberoam"));
  }
  return device.protocol === "ssh" && (device.type === "linux_edge" || deviceVendor.includes("linux"));
}

function inferFieldError(message: string, parameters: Record<string, unknown>, actionType: ActionType): StructuredValidationError {
  let field = message.match(/^([A-Za-z][A-Za-z0-9_]*)\s+(?:is|has|must|may|requires)/)?.[1];
  const aliases: Record<string, string> = { srcIp: "sourceIp", address: "sourceIp", ip: "sourceIp", cidr: "sourceCidr", dstCidr: "destinationCidr", trustedSourceIp: "trustedSource", toPort: "newPort", srcintf: "srcInterface", dstintf: "dstInterface", scheduleName: "schedule", service: "serviceName" };
  if (field && aliases[field]) field = aliases[field];
  if (!field && /device|credential|connector/i.test(message)) field = "deviceId";
  if (/Allowed source is required/i.test(message)) field = "trustedSourceCidr";
  if (!field && /interface\/zone|Policy interface\/zone/i.test(message)) {
    const value = message.match(/(?:interface\/zone|zone)\s+([^ ]+)/i)?.[1];
    field = value && value === parameters.srcInterface ? "srcInterface" : "dstInterface";
  }
  if (!field && /address is invalid|valid IPv4|invalid IP/i.test(message)) {
    if (actionType === ActionType.mikrotik_change_service_port) field = parameters.trustedSourceCidr ? "trustedSourceCidr" : "trustedSource";
    else field = parameters.sourceCidr ? "sourceCidr" : "sourceIp";
  }
  field ??= "parameters";
  return validationError(field, message, parameters[field], EXPECTED_FORMATS[field] ?? "valid value for this action");
}

function finish(input: Omit<ValidationResult, "valid" | "missingFields" | "policyGuardError" | "exactReason" | "fieldErrors"> & { errors: string[]; fieldErrors?: StructuredValidationError[]; parameters?: Record<string, unknown>; actionType?: ActionType }): ValidationResult {
  const errors = env.actionAllowLabUnrestrictedManagement
    ? input.errors.filter((message) => !/blocked by policy|protected port|explicitOverride|managementOverride|break.?glass|backup.*required|rollback.*required/i.test(message))
    : input.errors;
  const inferred = errors.map((message) => inferFieldError(message, input.parameters ?? {}, input.actionType ?? ActionType.create_egress_policy));
  const fieldErrors = [...(input.fieldErrors ?? []), ...inferred].filter((issue, index, all) => all.findIndex((candidate) => candidate.field === issue.field && candidate.message === issue.message) === index);
  const { parameters: _parameters, actionType: _actionType, ...result } = input;
  return {
    ...result,
    errors,
    valid: errors.length === 0,
    fieldErrors,
    missingFields: Array.from(new Set([...missingFieldsFromErrors(errors), ...fieldErrors.filter((issue) => issue.currentValue === null || issue.currentValue === "").map((issue) => issue.field)])),
    policyGuardError: errors.length > 0 ? errors.join(" ") : null,
    exactReason: exactReasonFrom(errors)
  };
}

export async function validateActionPlan(plan: ActionPlan): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const originalParameters = asObject(plan.parametersJson);
  const canonical = normalizeIntent({ ...originalParameters, actionType: plan.actionType });
  delete canonical.actionType;
  if (isActionPlanControlSource(originalParameters.source) && canonical.sourceIp === originalParameters.source) {
    delete canonical.sourceIp;
    delete canonical.srcInterface;
  }
  const parameters = plan.actionType === ActionType.fortigate_guided_vpn_setup
    ? normalizeFortiGateGuidedVpnParameters({ ...originalParameters, ...canonical })
    : { ...originalParameters, ...canonical };
  const normalizedPlan = { ...plan, parametersJson: JSON.parse(JSON.stringify(parameters)) } as ActionPlan;
  const catalog = getActionCatalogEntry(plan.actionType);
  const catalogValidation = catalog ? validateCatalogParameters(catalog, parameters) : { valid: true, errors: [], fieldErrors: [] };
  const canonicalShapeErrors = validateCanonicalFieldShapes(parameters);
  const fieldErrors = [...catalogValidation.fieldErrors, ...canonicalShapeErrors];
  errors.push(...catalogValidation.errors, ...canonicalShapeErrors.map((issue) => issue.message));
  let device: Device | null = null;

  if (plan.deviceId) {
    device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
    if (!device) errors.push("Target device does not exist.");
  }

  const managementActions = new Set<ActionType>([
    ActionType.mikrotik_change_service_port,
    ActionType.mikrotik_enable_service,
    ActionType.mikrotik_disable_service,
    ActionType.change_ssh_port,
    ActionType.fortigate_restrict_admin_trusthost,
    ActionType.fortigate_change_admin_port,
    ActionType.fortigate_disable_unused_admin_service
  ]);
  if (device && managementActions.has(plan.actionType)) {
    const resolved = resolveTrustedManagementSource(parameters, device);
    if (resolved && !parameters.trustedSource && !parameters.trustedSourceCidr && !parameters.trustedSourceIp) {
      parameters.trustedSource = resolved.value;
      parameters.trustedSourceCidr = resolved.value;
      parameters.trustedSourceAutoResolved = resolved.autoResolved;
      parameters.trustedSourceResolution = resolved.source;
      normalizedPlan.parametersJson = JSON.parse(JSON.stringify(parameters));
      if (resolved.autoResolved) warnings.push("Management source was auto-resolved or unrestricted because quick execution mode is enabled.");
    }
  }

  if (!(plan.actionType in ActionType)) errors.push("actionType is not supported.");
  if (containsShellShape(parameters)) errors.push("Free-form shell, command, script, or exec parameters are not allowed.");

  if (plan.actionType === ActionType.custom_vendor_action) {
    const custom = validateCustomCommandPlan({ plan: customPlanFromParameters(parameters), device, actionType: plan.actionType });
    errors.push(...custom.errors);
    warnings.push(...custom.warnings);
    const normalizedParameters = custom.normalizedPlan
      ? {
          ...parameters,
          customCommandPlan: custom.normalizedPlan,
          orderedCommands: custom.normalizedPlan.orderedCommands,
          typedParameters: custom.normalizedPlan.typedParameters,
          verificationCommands: custom.normalizedPlan.verificationCommands,
          rollbackGuidance: custom.normalizedPlan.rollbackGuidance,
          connectorType: custom.normalizedPlan.connectorType,
          executionTemplateRef: custom.normalizedPlan.executionTemplateRef,
          executionSupport: "connector",
          implementationState: "implemented",
          supportState: "verified",
          executable: custom.valid && custom.missingFields.length === 0,
          metadata: {
            ...asObject(parameters.metadata),
            source: "ai_custom_connector_plan",
            vendor: custom.normalizedPlan.vendor,
            platform: custom.normalizedPlan.platform,
            actionType: ActionType.custom_vendor_action,
            implementationState: "implemented",
            executionSupport: "connector",
            supportState: "verified",
            supportReasonKey: "support.reason.customConnectorValidated",
            executable: custom.valid && custom.missingFields.length === 0,
            connectorType: custom.normalizedPlan.connectorType,
            executionTemplateRef: custom.normalizedPlan.executionTemplateRef,
            customCommandPlan: custom.normalizedPlan,
            normalizedParams: custom.normalizedPlan.typedParameters,
            requiredParamsSatisfied: custom.missingFields.length === 0,
            missingFields: custom.missingFields,
            rawCommandExecution: false,
          }
        }
      : parameters;
    return finish({
      requiresApproval: true,
      riskLevel: custom.normalizedPlan?.riskLevel ?? plan.riskLevel,
      errors,
      fieldErrors,
      parameters: normalizedParameters,
      actionType: plan.actionType,
      warnings,
      normalizedParameters,
      rollbackJson: custom.rollbackJson,
      device
    });
  }

  if (isMikroTikAction(plan.actionType)) {
    if (!device) {
      errors.push(`${plan.actionType} requires a valid registered MikroTik device.`);
    } else if (device.type !== "mikrotik" && !String(device.vendor ?? "").toLowerCase().includes("mikrotik")) {
      errors.push(`${plan.actionType} requires a MikroTik device.`);
    } else if (device.protocol !== "ssh") {
      errors.push(`${plan.actionType} requires MikroTik SSH protocol.`);
    }
    if (device && !await credentialExists(device)) errors.push(`${plan.actionType} requires an existing credential for the target device.`);
    if (device && !connectorExists(device, "mikrotik")) errors.push(`${plan.actionType} requires a registered MikroTik connector.`);

    const expert = device ? evaluateMikroTikExpertPolicy(normalizedPlan, device) : null;
    const mikrotikValidation = expert?.validation ?? validateMikroTikAction(normalizedPlan);
    errors.push(...(expert?.errors ?? mikrotikValidation.errors));
    warnings.push(...(expert?.warnings ?? mikrotikValidation.warnings));
    if (expert?.requiresBreakGlass) warnings.push("Break-glass confirmation is required.");
    if (expert?.lockoutWarning) warnings.push(expert.lockoutWarning);

    return finish({
      requiresApproval: plan.actionType !== ActionType.mikrotik_read_firewall_summary,
      riskLevel: mikrotikValidation.riskLevel,
      errors,
      fieldErrors,
      parameters,
      actionType: plan.actionType,
      warnings,
      normalizedParameters: mikrotikValidation.normalizedParameters,
      rollbackJson: {
        ...mikrotikValidation.rollbackJson,
        backupEnabled: false,
        requiresBackup: false,
        requiresBreakGlass: expert?.requiresBreakGlass,
        lockoutSensitive: expert?.lockoutSensitive
      },
      device
    });
  }

  if (isFortiGateAction(plan.actionType)) {
    if (!device) {
      errors.push(`${plan.actionType} requires a valid registered FortiGate device.`);
    } else if (device.type !== "fortigate" && !String(device.vendor ?? "").toLowerCase().includes("forti")) {
      errors.push(`${plan.actionType} requires a FortiGate device.`);
    } else if (device.protocol !== "ssh") {
      errors.push(`${plan.actionType} requires FortiGate SSH protocol.`);
    }
    if (device && !await credentialExists(device)) {
      errors.push(plan.actionType === ActionType.fortigate_guided_vpn_setup
        ? "Cannot execute: FortiGate SSH connector is not configured for this device."
        : `${plan.actionType} requires an existing credential for the target device.`);
    }
    if (device && !connectorExists(device, "fortigate")) errors.push(`${plan.actionType} requires a registered FortiGate connector.`);

    if (plan.actionType === ActionType.fortigate_guided_vpn_setup) {
      const capabilities = asObject(device?.capabilities);
      const status = asObject(capabilities.fortigateStatus);
      const discovery = asObject(status.fortigate);
      const discoveredInterfaces = new Set(Array.isArray(discovery.interfaces) ? discovery.interfaces.map(String) : []);
      const vpnValidation = validateFortiGateGuidedVpnParameters(parameters, discoveredInterfaces);
      Object.assign(parameters, vpnValidation.normalized);
      normalizedPlan.parametersJson = JSON.parse(JSON.stringify(parameters));
      fieldErrors.push(...vpnValidation.issues);
      errors.push(...vpnValidation.issues.map((issue) => issue.message));
    }
    const expert = device ? evaluateFortiGatePolicy(normalizedPlan, device) : null;
    const fortigateValidation = expert?.validation ?? validateFortiGateAction(normalizedPlan);
    errors.push(...(expert?.errors ?? fortigateValidation.errors));
    warnings.push(...(expert?.warnings ?? fortigateValidation.warnings));
    if (expert?.requiresBreakGlass) warnings.push("Break-glass confirmation is required.");
    if (expert?.lockoutWarning) warnings.push(expert.lockoutWarning);

    return finish({
      requiresApproval: fortigateValidation.commandSpecs.some((spec) => spec.write),
      riskLevel: fortigateValidation.riskLevel,
      errors,
      fieldErrors,
      parameters,
      actionType: plan.actionType,
      warnings,
      normalizedParameters: fortigateValidation.normalizedParameters,
      rollbackJson: {
        ...fortigateValidation.rollbackJson,
        backupEnabled: false,
        requiresBackup: false,
        requiresBreakGlass: expert?.requiresBreakGlass,
        lockoutSensitive: expert?.lockoutSensitive
      },
      device
    });
  }

  const metadata = asObject(parameters.metadata);
  const isCiscoCatalogAction = plan.actionType === ActionType.generic_security_action && (metadata.connectorType === "cisco-ios-xe-ssh" || metadata.vendor === "cisco" || parameters.vendor === "cisco");
  if (isCiscoCatalogAction) {
    if (!plan.deviceId) errors.push("Cisco catalog action requires deviceId.");
    if (plan.deviceId && !device) errors.push("Cisco catalog action requires a valid registered device.");
    if (device && !String(device.vendor ?? "").toLowerCase().includes("cisco")) errors.push("Cisco catalog action requires a Cisco device.");
    if (device && device.protocol !== "ssh") errors.push("Cisco catalog action requires SSH protocol.");
    if (device && !await credentialExists(device)) errors.push("Cisco catalog action requires an existing credential for the target device.");
    if (device && !connectorExists(device, "cisco")) errors.push("Cisco catalog action requires the registered Cisco SSH connector.");
  }
  const isSophosCatalogAction = plan.actionType === ActionType.generic_security_action && (metadata.connectorType === "sophos-api" || metadata.vendor === "sophos" || parameters.vendor === "sophos");
  if (isSophosCatalogAction) {
    if (!plan.deviceId) errors.push("Sophos catalog action requires deviceId.");
    if (plan.deviceId && !device) errors.push("Sophos catalog action requires a valid registered device.");
    if (device && !/sophos|sfos|cyberoam/i.test(String(device.vendor))) errors.push("Sophos catalog action requires a Sophos Firewall device.");
    if (device && device.protocol !== "api") errors.push("Sophos catalog action requires API protocol.");
    if (device && !await credentialExists(device)) errors.push("Sophos catalog action requires an existing credential for the target device.");
    if (device && !connectorExists(device, "sophos")) errors.push("Sophos catalog action requires the registered Sophos XML API connector.");
  }
  if (DEVICE_REQUIRED_ACTIONS.has(plan.actionType)) {
    if (!plan.deviceId) errors.push(`${plan.actionType} requires deviceId.`);
    if (plan.deviceId && !device) errors.push(`${plan.actionType} requires a valid registered device.`);
  }

  if (plan.actionType.startsWith("linux_")) {
    if (device && device.type !== "linux_edge" && !String(device.vendor ?? "").toLowerCase().includes("linux")) {
      errors.push("linux_check_service_status requires a Linux Edge device.");
    }
    if (device && device.protocol !== "ssh") errors.push("linux_check_service_status requires SSH protocol.");
    if (device && !await credentialExists(device)) errors.push("linux_check_service_status requires an existing credential for the target device.");
    if (device && !connectorExists(device, "linux_edge")) errors.push("linux_check_service_status requires a registered Linux connector.");
    if (plan.actionType === ActionType.linux_check_service_status) {
      const service = textParam(parameters, "serviceName") ?? textParam(parameters, "service");
      if (!service) errors.push("linux_check_service_status requires serviceName.");
      else if (!/^[a-zA-Z0-9_.@-]+$/.test(service)) errors.push("linux_check_service_status serviceName is invalid.");
    }
    if (new Set<ActionType>([ActionType.linux_remove_user_from_sudo, ActionType.linux_add_user_to_sudo, ActionType.linux_check_user_groups, ActionType.linux_lock_user, ActionType.linux_unlock_user]).has(plan.actionType)) {
      const username = textParam(parameters, "username");
      if (!username) errors.push(`${plan.actionType} requires username.`);
      else if (!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(username)) errors.push(`${plan.actionType} username is invalid.`);
    }
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

  if (plan.actionType === ActionType.open_port || plan.actionType === ActionType.linux_open_port) {
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

  if (plan.actionType === ActionType.block_source_ip_temporary || plan.actionType === ActionType.linux_block_ip || plan.actionType === ActionType.unblock_source_ip) {
    const srcIp = typeof parameters.srcIp === "string" ? parameters.srcIp : typeof parameters.ipAddress === "string" ? parameters.ipAddress : undefined;
    if (!srcIp) errors.push(`${plan.actionType} requires ${plan.actionType === ActionType.linux_block_ip ? "ipAddress" : "srcIp"}.`);
    if ((plan.actionType === ActionType.block_source_ip_temporary || plan.actionType === ActionType.linux_block_ip) && srcIp && isPrivateOrLocalIp(srcIp)) {
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

  return finish({
    requiresApproval: true,
    riskLevel: plan.riskLevel,
    errors,
    fieldErrors,
    parameters,
    actionType: plan.actionType,
    warnings,
    normalizedParameters: parameters,
    rollbackJson,
    device
  });
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

  if (actionType === ActionType.open_port || actionType === ActionType.linux_open_port) {
    return {
      type: "close_opened_port",
      port: parameters.port,
      protocol: parameters.protocol ?? "tcp"
    };
  }

  if (actionType === ActionType.block_source_ip_temporary || actionType === ActionType.linux_block_ip) {
    return {
      type: "remove_temporary_block",
      srcIp: parameters.srcIp ?? parameters.ipAddress,
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
