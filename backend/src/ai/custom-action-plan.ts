import { ActionType, AiRiskLevel, type Device } from "@prisma/client";
import type { ConnectorDryRun } from "../connectors/types.js";

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

const SECRET_PATTERN = /(password|passphrase|private[-_ ]?key|secret|token|api[-_ ]?key)\s*[=:]\s*\S+/i;
const SHELL_META_PATTERN = /[`$<>]|\$\(|\b(curl|wget|nc|netcat|bash|sh|python|perl|ruby|powershell|cmd\.exe)\b/i;
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

function commandsFromProvider(parameters: Record<string, unknown>) {
  const plan = asObject(parameters.customCommandPlan);
  return textArray(plan.orderedCommands).length
    ? textArray(plan.orderedCommands)
    : textArray(parameters.orderedCommands).length
      ? textArray(parameters.orderedCommands)
      : textArray(parameters.commands);
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

function requestedVendorFromText(message: string): CustomConnectorVendor | null {
  const text = normalizePrompt(message);
  if (/\bmikrotik|routeros\b/.test(text)) return "mikrotik";
  if (/\bfortigate|fortinet|fortios\b/.test(text)) return "fortigate";
  if (/\blinux|ubuntu|debian|rhel|centos\b/.test(text)) return "linux";
  if (/\bcisco|iosxe|ios-xe|ios\b/.test(text)) return "cisco";
  return null;
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
  const providedCommands = commandsFromProvider(params);
  const synthesized = synthesizeCommands({ message: input.message, vendor, parameters: params });
  const template = customTemplateForVendor(vendor);
  const commands = providedCommands.length ? providedCommands : synthesized.commands;
  const typedParameters = { ...synthesized.typedParameters, ...asObject(params.typedParameters) };
  const verification = textArray(asObject(params.customCommandPlan).verificationCommands).length
    ? textArray(asObject(params.customCommandPlan).verificationCommands)
    : textArray(params.verificationCommands).length
      ? textArray(params.verificationCommands)
      : synthesized.verificationCommands;
  return {
    schema: "ai_custom_connector_plan_v1",
    schemaVersion: "custom_action_plan_v2",
    deviceId: input.device.id,
    vendor,
    platform: platformFromDevice(input.device),
    intent: input.message,
    source: "ai_custom",
    orderedCommands: commands,
    orderedOperations: orderedOperations({ vendor, commands, typedParameters }),
    typedParameters,
    missingFields: synthesized.missingFields,
    riskLevel: synthesized.riskLevel,
    expectedImpact: text(params.expectedImpact) ?? synthesized.expectedImpact,
    verificationCommands: verification,
    verificationOperations: verification.map((command, index) => ({
      id: `verify-${index + 1}`,
      operationType: "verification",
      generatedCommand: command,
      dependsOn: commands.length ? [`op-${commands.length}`] : [],
    })),
    rollbackGuidance: textArray(params.rollbackGuidance).length ? textArray(params.rollbackGuidance) : synthesized.rollback,
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

function commandLines(plan: CustomCommandPlan) {
  return [...plan.orderedCommands, ...plan.verificationCommands].map((line) => line.trim()).filter(Boolean);
}

function commonCommandErrors(plan: CustomCommandPlan) {
  const errors: string[] = [];
  if (plan.orderedCommands.length === 0 && plan.missingFields.length === 0) errors.push("Custom ActionPlan requires at least one ordered command.");
  if (plan.orderedCommands.length > 12) errors.push("Custom ActionPlan may contain at most 12 ordered commands.");
  for (const command of commandLines(plan)) {
    if (command.length > 320) errors.push("Custom command exceeds maximum length.");
    if (SECRET_PATTERN.test(command)) errors.push("Custom command appears to contain a secret.");
  }
  return errors;
}

function linuxCommandAllowed(command: string) {
  if (SHELL_META_PATTERN.test(command) || /[;&|]/.test(command)) return false;
  return /^(sudo -n )?systemctl (restart|reload|start|stop|enable|disable|is-active|is-enabled|status|show) [a-zA-Z0-9_.@:-]+( --no-pager)?$/.test(command) ||
    /^(sudo -n )?ufw (status|allow|deny|delete)\b[A-Za-z0-9_ ./'"-]*$/.test(command);
}

function routerOsCommandAllowed(command: string) {
  if (!command.startsWith("/")) return false;
  if (/\/system\s+(reset-configuration|reboot)|\/user\b|\/certificate\b|export\s+show-sensitive|password|remove\s+\[find\]|disable\s+\[find\]/i.test(command)) return false;
  return /^\/(system identity|system ntp|ip service|ip firewall|interface|ip address|ip route)\b/i.test(command);
}

function fortigateCommandAllowed(command: string) {
  if (/execute\s+(reboot|shutdown|factoryreset)|diagnose\s+debug|delete\s+\*|purge|unset\s+password|set\s+password/i.test(command)) return false;
  return /^(config|edit|set|next|end|show|get)\b/i.test(command);
}

function ciscoCommandAllowed(command: string) {
  if (/^(reload|erase|delete|format|copy|write erase)\b|password|secret|enable secret|username\s+\S+\s+secret/i.test(command)) return false;
  return /^(show|configure terminal|interface\s+\S+|line\s+vty\s+\d+(?:\s+\d+)?|description\s+.+|shutdown|no shutdown|switchport\b.+|ip address\b.+|transport input ssh|end|exit)\b/i.test(command);
}

function vendorCommandAllowed(vendor: CustomConnectorVendor, command: string) {
  if (vendor === "linux") return linuxCommandAllowed(command);
  if (vendor === "mikrotik") return routerOsCommandAllowed(command);
  if (vendor === "fortigate") return fortigateCommandAllowed(command);
  return ciscoCommandAllowed(command);
}

export function validateCustomCommandPlan(input: {
  plan: CustomCommandPlan | null;
  device: Pick<Device, "id" | "type" | "vendor" | "protocol"> | null;
  actionType: ActionType | string;
}): CustomCommandValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFields = Array.from(new Set(input.plan?.missingFields ?? []));
  if (input.actionType !== ActionType.custom_vendor_action) errors.push("Custom connector execution requires custom_vendor_action.");
  if (!input.device) errors.push("Custom connector action requires a selected registered device.");
  if (!input.plan) errors.push("Custom connector action requires a normalized customCommandPlan.");
  if (!input.plan) return { valid: false, errors, warnings, missingFields, normalizedPlan: null, rollbackJson: {}, };

  const selectedVendor = customVendorFromDevice(input.device);
  const requestedVendor = requestedVendorFromText(input.plan.intent);
  const template = customTemplateForVendor(input.plan.vendor);
  if (!selectedVendor || selectedVendor !== input.plan.vendor) errors.push("Custom command vendor does not match the selected device vendor/platform.");
  if (requestedVendor && requestedVendor !== input.plan.vendor) errors.push("Custom command text references a different vendor than the selected device.");
  if (input.device?.protocol !== "ssh") errors.push("Custom connector actions require an SSH-backed registered connector.");
  if (input.plan.connectorType !== template.connectorType || input.plan.executionTemplateRef !== template.executionTemplateRef) errors.push("Custom command template does not match the selected vendor connector.");
  errors.push(...commonCommandErrors(input.plan));
  for (const command of commandLines(input.plan)) {
    if (!vendorCommandAllowed(input.plan.vendor, command)) errors.push(`Custom command is not allowed for ${input.plan.vendor}: ${command}`);
  }
  if (missingFields.length > 0) errors.push(`Missing custom ActionPlan fields: ${missingFields.join(", ")}`);
  if (input.plan.verificationCommands.length === 0) warnings.push("No explicit verification command was generated; connector verification will rely on exit status and audit evidence.");

  const normalizedPlan = {
    ...input.plan,
    backendValidation: {
      normalized: true as const,
      vendorPlatformCompatible: Boolean(selectedVendor && selectedVendor === input.plan.vendor),
      commandSafety: errors.length === 0 ? "passed" as const : "failed" as const,
    },
    rawCommandExecution: false as const,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingFields,
    normalizedPlan,
    rollbackJson: {
      customConnectorPlan: true,
      rollbackGuidance: normalizedPlan.rollbackGuidance,
      verificationCommands: normalizedPlan.verificationCommands,
      rawCommandExecution: false,
    },
  };
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
