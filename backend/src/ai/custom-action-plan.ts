import { ActionType, AiRiskLevel, type Device } from "@prisma/client";
import type { ConnectorDryRun } from "../connectors/types.js";
import { evaluateCustomCommandPolicy } from "../commands/custom-policy/custom-command-policy.registry.js";

export type CustomConnectorVendor = "linux" | "mikrotik" | "fortigate" | "cisco";

export type CustomCommandPlan = {
  schema: "ai_custom_connector_plan_v1";
  schemaVersion: "custom_action_plan_v2";
  deviceId: string;
  vendor: CustomConnectorVendor;
  platform: string | null;
  intent: string;
  source: "ai_custom";
  orderedCommands: string[];
  orderedOperations: Array<{
    id: string;
    operationType: string;
    typedParameters: Record<string, unknown>;
    generatedCommand?: string;
    dependsOn: string[];
  }>;
  typedParameters: Record<string, unknown>;
  missingFields: string[];
  riskLevel: AiRiskLevel;
  expectedImpact: string;
  verificationCommands: string[];
  verificationOperations: unknown[];
  rollbackGuidance: string[];
  requiresExplicitApproval: true;
  connectorType: "linux-ssh" | "mikrotik-ssh" | "fortigate-ssh" | "cisco-ios-xe-ssh";
  executionTemplateRef: "linux_custom_connector_command" | "mikrotik_custom_connector_command" | "fortigate_custom_connector_command" | "cisco_custom_connector_command";
  backendValidation: {
    normalized: true;
    vendorPlatformCompatible: boolean;
    commandSafety: "pending" | "passed" | "failed";
  };
  rawCommandExecution: false;
};

export type CustomCommandValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingFields: string[];
  normalizedPlan: CustomCommandPlan | null;
  rollbackJson: Record<string, unknown>;
};

const VENDOR_TEMPLATES: Record<CustomConnectorVendor, {
  connectorType: CustomCommandPlan["connectorType"];
  executionTemplateRef: CustomCommandPlan["executionTemplateRef"];
}> = {
  linux: { connectorType: "linux-ssh", executionTemplateRef: "linux_custom_connector_command" },
  mikrotik: { connectorType: "mikrotik-ssh", executionTemplateRef: "mikrotik_custom_connector_command" },
  fortigate: { connectorType: "fortigate-ssh", executionTemplateRef: "fortigate_custom_connector_command" },
  cisco: { connectorType: "cisco-ios-xe-ssh", executionTemplateRef: "cisco_custom_connector_command" },
};

const LINUX_SERVICE_PATTERN = /^[a-zA-Z0-9_.@:-]+$/;
const ROUTEROS_NAME_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function riskLevel(value: unknown): AiRiskLevel | null {
  return typeof value === "string" && Object.values(AiRiskLevel).includes(value as AiRiskLevel) ? value as AiRiskLevel : null;
}

export function customVendorFromDevice(device: Pick<Device, "type" | "vendor"> | null | undefined): CustomConnectorVendor | null {
  const vendor = String(device?.vendor ?? "").toLowerCase();
  const type = String(device?.type ?? "").toLowerCase();
  if (type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (vendor.includes("cisco")) return "cisco";
  return null;
}

export function customTemplateForVendor(vendor: CustomConnectorVendor) {
  return VENDOR_TEMPLATES[vendor];
}

function platformFromDevice(device: Pick<Device, "type" | "capabilities"> | null | undefined) {
  const capabilities = asObject(device?.capabilities);
  return text(capabilities.platform) ?? text(capabilities.os) ?? (device?.type ? String(device.type) : null);
}

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/[?؟,،;؛:.!()[\]{}"']/g, " ").replace(/\s+/g, " ").trim();
}

function serviceFromPrompt(message: string, parameters: Record<string, unknown>) {
  const explicit = text(parameters.serviceName) ?? text(parameters.service);
  if (explicit) return explicit;
  return normalizePrompt(message).match(/\b(nginx|apache2?|httpd|ssh|sshd|docker|fail2ban|postgresql|mysql|mariadb|redis|ufw)\b/)?.[1]?.replace(/^apache$/, "apache2");
}

function identityFromPrompt(message: string, parameters: Record<string, unknown>) {
  const explicit = text(parameters.identity) ?? text(parameters.name) ?? text(parameters.hostname);
  if (explicit) return explicit;
  return message.match(/\b(?:identity|hostname|name)\s+(?:to|=)\s+([A-Za-z0-9_.:-]{1,64})\b/i)?.[1];
}

function adminTimeoutFromPrompt(message: string, parameters: Record<string, unknown>) {
  const explicit = Number(parameters.adminTimeout ?? parameters.timeoutMinutes);
  if (Number.isInteger(explicit) && explicit > 0 && explicit <= 480) return explicit;
  const parsed = Number(message.match(/\b(\d{1,3})\s*(?:minutes?|min)?\b/i)?.[1]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 480 ? parsed : undefined;
}

function ciscoInterfaceFromPrompt(message: string, parameters: Record<string, unknown>) {
  return text(parameters.interfaceName) ?? text(parameters.interface) ?? message.match(/\b(?:interface)\s+([A-Za-z][A-Za-z0-9\/_.:-]{1,40})\b/i)?.[1];
}

function ciscoDescriptionFromPrompt(message: string, parameters: Record<string, unknown>) {
  return text(parameters.description) ?? message.match(/\bdescription\s+(?:to\s+)?([A-Za-z0-9 _.-]{1,80})/i)?.[1]?.trim();
}

function ciscoVlanIdFromPrompt(message: string, parameters: Record<string, unknown>) {
  const explicit = Number(parameters.vlanId ?? parameters.vlan);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 4094) return explicit;
  const parsed = Number(message.match(/\bvlan\s+(\d{1,4})\b/i)?.[1]);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4094 ? parsed : undefined;
}

function ciscoVlanNameFromPrompt(message: string, parameters: Record<string, unknown>) {
  const explicit = text(parameters.name) ?? text(parameters.vlanName);
  const parsed = explicit ?? message.match(/\b(?:named|name)\s+([A-Za-z0-9_.-]{1,64})\b/i)?.[1];
  return parsed?.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);
}

function commandsFromProvider(parameters: Record<string, unknown>) {
  const plan = asObject(parameters.customCommandPlan);
  return textArray(plan.orderedCommands).length
    ? textArray(plan.orderedCommands)
    : textArray(parameters.orderedCommands).length
      ? textArray(parameters.orderedCommands)
      : textArray(parameters.commands);
}

function providerStructuredFields(parameters: Record<string, unknown>) {
  const plan = asObject(parameters.customCommandPlan);
  const commands = commandsFromProvider(parameters);
  if (!commands.length) return null;
  const nestedTypedParameters = asObject(plan.typedParameters);
  const topLevelTypedParameters = asObject(parameters.typedParameters);
  const typedParameters = Object.keys(nestedTypedParameters).length ? nestedTypedParameters : topLevelTypedParameters;
  return {
    commands,
    typedParameters,
    missingFields: textArray(plan.missingFields).length || Array.isArray(plan.missingFields)
      ? textArray(plan.missingFields)
      : Array.isArray(parameters.missingFields)
        ? textArray(parameters.missingFields)
        : [],
    riskLevel: riskLevel(plan.riskLevel) ?? riskLevel(parameters.riskLevel),
    expectedImpact: text(plan.expectedImpact) ?? text(parameters.expectedImpact),
    verificationCommands: textArray(plan.verificationCommands).length || Array.isArray(plan.verificationCommands)
      ? textArray(plan.verificationCommands)
      : textArray(parameters.verificationCommands),
    rollbackGuidance: textArray(plan.rollbackGuidance).length || Array.isArray(plan.rollbackGuidance)
      ? textArray(plan.rollbackGuidance)
      : textArray(parameters.rollbackGuidance),
    orderedOperations: objectArray(plan.orderedOperations),
    verificationOperations: objectArray(plan.verificationOperations),
  };
}

function synthesizeCommands(input: {
  message: string;
  vendor: CustomConnectorVendor;
  parameters: Record<string, unknown>;
}): { commands: string[]; verificationCommands: string[]; typedParameters: Record<string, unknown>; missingFields: string[]; rollback: string[]; expectedImpact: string; riskLevel: AiRiskLevel } {
  const text = normalizePrompt(input.message);
  if (input.vendor === "linux") {
    const service = serviceFromPrompt(input.message, input.parameters);
    const hasOperation = (operation: string) => new RegExp(`\\b${operation}\\b`).test(text);
    const operation = hasOperation("restart") ? "restart"
      : hasOperation("reload") ? "reload"
        : hasOperation("stop") ? "stop"
          : hasOperation("disable") ? "disable"
            : hasOperation("enable") ? "enable"
              : hasOperation("start") ? "start"
                : "restart";
    if (!service) return { commands: [], verificationCommands: [], typedParameters: { operation }, missingFields: ["serviceName"], rollback: ["Use service-specific rollback after identifying the service."], expectedImpact: "Linux service change requires the target service name.", riskLevel: AiRiskLevel.medium };
    const statusCommand = operation === "enable" || operation === "disable" ? `systemctl is-enabled ${service}` : `systemctl is-active ${service}`;
    return {
      commands: [`sudo -n systemctl ${operation} ${service}`],
      verificationCommands: [statusCommand],
      typedParameters: { operation, serviceName: service },
      missingFields: [],
      rollback: operation === "stop" ? [`sudo -n systemctl start ${service}`] : operation === "disable" ? [`sudo -n systemctl enable ${service}`] : operation === "enable" ? [`sudo -n systemctl disable ${service}`] : [`sudo -n systemctl restart ${service}`],
      expectedImpact: `Runs a controlled systemd ${operation} operation for ${service}.`,
      riskLevel: operation === "stop" || operation === "restart" ? AiRiskLevel.high : AiRiskLevel.medium,
    };
  }

  if (input.vendor === "mikrotik") {
    const identity = identityFromPrompt(input.message, input.parameters);
    if (!identity) return { commands: [], verificationCommands: [], typedParameters: { operation: "set_identity" }, missingFields: ["identity"], rollback: ["Restore the previous RouterOS identity from backup or audit evidence."], expectedImpact: "RouterOS identity change requires the new identity value.", riskLevel: AiRiskLevel.low };
    return {
      commands: [`/system identity set name="${identity.replace(/"/g, "")}"`],
      verificationCommands: ["/system identity print"],
      typedParameters: { operation: "set_identity", identity },
      missingFields: [],
      rollback: ["Set the RouterOS identity back to the previous value recorded during review."],
      expectedImpact: `Changes the RouterOS system identity to ${identity}.`,
      riskLevel: AiRiskLevel.low,
    };
  }

  if (input.vendor === "fortigate") {
    const timeout = adminTimeoutFromPrompt(input.message, input.parameters);
    if (!timeout) return { commands: [], verificationCommands: [], typedParameters: { operation: "set_admin_timeout" }, missingFields: ["adminTimeout"], rollback: ["Restore the previous admintimeout value from backup or audit evidence."], expectedImpact: "FortiGate admin timeout change requires a timeout in minutes.", riskLevel: AiRiskLevel.medium };
    return {
      commands: ["config system global", `set admintimeout ${timeout}`, "end"],
      verificationCommands: ["show system global"],
      typedParameters: { operation: "set_admin_timeout", adminTimeout: timeout },
      missingFields: [],
      rollback: ["Restore the previous admintimeout value under config system global."],
      expectedImpact: `Changes FortiGate administrative idle timeout to ${timeout} minutes.`,
      riskLevel: AiRiskLevel.medium,
    };
  }

  const vlanId = ciscoVlanIdFromPrompt(input.message, input.parameters);
  if (/\bdhcp\s+snooping\b/i.test(text)) {
    if (!vlanId) return { commands: [], verificationCommands: [], typedParameters: { operation: "enable_dhcp_snooping" }, missingFields: ["vlanId"], rollback: ["Disable DHCP snooping for the affected VLAN if review requires rollback."], expectedImpact: "Cisco DHCP snooping requires a VLAN ID.", riskLevel: AiRiskLevel.medium };
    return {
      commands: ["configure terminal", "ip dhcp snooping", `ip dhcp snooping vlan ${vlanId}`, "end"],
      verificationCommands: ["show ip dhcp snooping"],
      typedParameters: { operation: "enable_dhcp_snooping", vlanId },
      missingFields: [],
      rollback: [`Remove VLAN ${vlanId} from DHCP snooping or disable DHCP snooping after impact review.`],
      expectedImpact: `Enables DHCP snooping for Cisco VLAN ${vlanId}.`,
      riskLevel: AiRiskLevel.medium,
    };
  }

  if (/\b(create|add|configure)\b.*\bvlan\b|\bvlan\b.*\b(create|add|configure)\b/i.test(text)) {
    if (!vlanId) return { commands: [], verificationCommands: [], typedParameters: { operation: "create_vlan" }, missingFields: ["vlanId"], rollback: ["Remove the VLAN only after confirming it is unused."], expectedImpact: "Cisco VLAN creation requires a VLAN ID.", riskLevel: AiRiskLevel.medium };
    const vlanName = ciscoVlanNameFromPrompt(input.message, input.parameters);
    return {
      commands: ["configure terminal", `vlan ${vlanId}`, ...(vlanName ? [`name ${vlanName}`] : []), "end"],
      verificationCommands: [`show vlan brief | include ^${vlanId}\\b`],
      typedParameters: { operation: "create_vlan", vlanId, ...(vlanName ? { name: vlanName } : {}) },
      missingFields: [],
      rollback: [`Remove VLAN ${vlanId} only after confirming it is unused and not referenced by access or trunk ports.`],
      expectedImpact: `Creates Cisco VLAN ${vlanId}${vlanName ? ` named ${vlanName}` : ""}.`,
      riskLevel: AiRiskLevel.medium,
    };
  }

  const interfaceName = ciscoInterfaceFromPrompt(input.message, input.parameters);
  const description = ciscoDescriptionFromPrompt(input.message, input.parameters);
  if (!interfaceName || !description) {
    return { commands: [], verificationCommands: [], typedParameters: { operation: "set_interface_description", interfaceName, description }, missingFields: [!interfaceName ? "interfaceName" : null, !description ? "description" : null].filter(Boolean) as string[], rollback: ["Restore the previous interface description from running configuration."], expectedImpact: "Cisco interface description change requires interfaceName and description.", riskLevel: AiRiskLevel.low };
  }
  return {
    commands: ["configure terminal", `interface ${interfaceName}`, `description ${description}`, "end", "show running-config interface " + interfaceName],
    verificationCommands: [`show running-config interface ${interfaceName}`],
    typedParameters: { operation: "set_interface_description", interfaceName, description },
    missingFields: [],
    rollback: ["Restore the previous interface description from saved configuration or audit evidence."],
    expectedImpact: `Changes description on Cisco interface ${interfaceName}.`,
    riskLevel: AiRiskLevel.low,
  };
}

function orderedOperations(input: { vendor: CustomConnectorVendor; commands: string[]; typedParameters: Record<string, unknown> }) {
  const operationType = String(input.typedParameters.operation ?? `${input.vendor}_custom_command`);
  return input.commands.map((command, index) => ({
    id: `op-${index + 1}`,
    operationType,
    typedParameters: input.typedParameters,
    generatedCommand: command,
    dependsOn: index === 0 ? [] : [`op-${index}`],
  }));
}

function basePlan(input: {
  message: string;
  device: Pick<Device, "id" | "type" | "vendor" | "capabilities">;
  parameters?: Record<string, unknown>;
}): CustomCommandPlan | null {
  const vendor = customVendorFromDevice(input.device);
  if (!vendor) return null;
  const params = input.parameters ?? {};
  const provider = providerStructuredFields(params);
  const synthesized = synthesizeCommands({ message: input.message, vendor, parameters: params });
  const template = customTemplateForVendor(vendor);
  const commands = provider?.commands ?? synthesized.commands;
  const typedParameters = provider ? provider.typedParameters : { ...synthesized.typedParameters, ...asObject(params.typedParameters) };
  const verification = provider?.verificationCommands ?? synthesized.verificationCommands;
  const operations = provider?.orderedOperations.length ? provider.orderedOperations as CustomCommandPlan["orderedOperations"] : orderedOperations({ vendor, commands, typedParameters });
  const verificationOperations = provider?.verificationOperations.length
    ? provider.verificationOperations
    : verification.map((command, index) => ({
      id: `verify-${index + 1}`,
      operationType: "verification",
      generatedCommand: command,
      dependsOn: commands.length ? [`op-${commands.length}`] : [],
    }));
  return {
    schema: "ai_custom_connector_plan_v1",
    schemaVersion: "custom_action_plan_v2",
    deviceId: input.device.id,
    vendor,
    platform: platformFromDevice(input.device),
    intent: input.message,
    source: "ai_custom",
    orderedCommands: commands,
    orderedOperations: operations,
    typedParameters,
    missingFields: provider?.missingFields ?? synthesized.missingFields,
    riskLevel: provider?.riskLevel ?? synthesized.riskLevel,
    expectedImpact: provider?.expectedImpact ?? text(params.expectedImpact) ?? synthesized.expectedImpact,
    verificationCommands: verification,
    verificationOperations,
    rollbackGuidance: provider?.rollbackGuidance ?? (textArray(params.rollbackGuidance).length ? textArray(params.rollbackGuidance) : synthesized.rollback),
    requiresExplicitApproval: true,
    ...template,
    backendValidation: {
      normalized: true,
      vendorPlatformCompatible: true,
      commandSafety: "pending",
    },
    rawCommandExecution: false,
  };
}

export function buildCustomCommandPlan(input: {
  message: string;
  device: Pick<Device, "id" | "type" | "vendor" | "capabilities"> | null;
  parameters?: Record<string, unknown>;
}): CustomCommandPlan | null {
  if (!input.device?.id) return null;
  return basePlan({ message: input.message, device: input.device, parameters: input.parameters });
}

export function validateCustomCommandPlan(input: {
  plan: CustomCommandPlan | null;
  device: Pick<Device, "id" | "type" | "vendor" | "protocol"> | null;
  actionType: ActionType | string;
}): CustomCommandValidation {
  return evaluateCustomCommandPolicy(input);
}

export function customDryRun(plan: CustomCommandPlan): ConnectorDryRun {
  return {
    plannedCommands: [...plan.orderedCommands, ...plan.verificationCommands],
    validationWarnings: [
      "AI-generated custom commands were normalized and validated by the backend; no command has executed during preview.",
      ...(!plan.verificationCommands.length ? ["No explicit verification command was provided."] : []),
    ],
    affectedPorts: [],
    affectedServices: text(plan.typedParameters.serviceName) ? [String(plan.typedParameters.serviceName)] : [],
    rollbackSteps: plan.rollbackGuidance,
    riskLevel: plan.riskLevel,
    requiresApproval: true,
    commandSpecs: [
      ...plan.orderedCommands.map((command, index) => ({ template: `custom step ${index + 1}`, command, write: true, target: { deviceId: plan.deviceId, vendor: plan.vendor } })),
      ...plan.verificationCommands.map((command, index) => ({ template: `custom verification ${index + 1}`, command, write: false, target: { deviceId: plan.deviceId, vendor: plan.vendor } })),
    ],
    exactTarget: {
      deviceId: plan.deviceId,
      vendor: plan.vendor,
      platform: plan.platform,
      intent: plan.intent,
      typedParameters: plan.typedParameters,
      executionTemplateRef: plan.executionTemplateRef,
    },
  };
}

export function customPlanFromParameters(parametersJson: unknown): CustomCommandPlan | null {
  const parameters = asObject(parametersJson);
  const direct = asObject(parameters.customCommandPlan);
  if (direct.schema === "ai_custom_connector_plan_v1") return direct as CustomCommandPlan;
  const metadataPlan = asObject(asObject(parameters.metadata).customCommandPlan);
  if (metadataPlan.schema === "ai_custom_connector_plan_v1") return metadataPlan as CustomCommandPlan;
  return null;
}
