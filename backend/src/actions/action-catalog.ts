import { ActionType, AiRiskLevel } from "@prisma/client";
import { actionValidators, validationError, type StructuredValidationError } from "./action-validators.js";

export type ActionVendor = "mikrotik" | "fortigate";
export type CatalogParameter = { name: string; validator?: keyof typeof actionValidators };
export type ActionCatalogEntry = {
  vendor: ActionVendor;
  actionType: ActionType;
  requiredParameters: CatalogParameter[];
  optionalParameters: CatalogParameter[];
  preflightParameters: CatalogParameter[];
  requiredFields: string[];
  optionalFields: string[];
  preflightFields: string[];
  riskLevel: AiRiskLevel;
  supportsDryRun: boolean;
  supportsExecution: boolean;
  requiresApproval: boolean;
  requiresBreakGlass: boolean;
  plannerHandler: string;
  connectorHandler: string;
  rollbackPreviewHandler: string;
  dryRunHandler: string;
  executionHandler: string;
};

const common = {
  supportsDryRun: true,
  supportsExecution: true,
  requiresApproval: true,
  requiresBreakGlass: false,
  plannerHandler: "deterministicVendorPlanner",
  connectorHandler: "vendorSshConnector",
  rollbackPreviewHandler: "vendorRollbackPreview"
  ,dryRunHandler: "deterministicVendorDryRun"
  ,executionHandler: "controlledVendorExecution"
} as const;

const p = (name: string, validator?: keyof typeof actionValidators): CatalogParameter => ({ name, validator });
const entry = (vendor: ActionVendor, actionType: ActionType, riskLevel: AiRiskLevel, required: CatalogParameter[] = [], optional: CatalogParameter[] = [], overrides: Partial<ActionCatalogEntry> = {}): ActionCatalogEntry => {
  const preflight = overrides.preflightParameters ?? [];
  return {
    ...common,
    vendor,
    actionType,
    riskLevel,
    requiredParameters: required,
    optionalParameters: optional,
    preflightParameters: preflight,
    requiredFields: ["deviceId", "vendor", "actionType", ...required.map((field) => field.name)],
    optionalFields: optional.map((field) => field.name),
    preflightFields: preflight.map((field) => field.name),
    ...overrides
  };
};

const explicitEntries: ActionCatalogEntry[] = [
  entry("mikrotik", ActionType.mikrotik_change_service_port, AiRiskLevel.high, [p("serviceName", "serviceName"), p("newPort", "port")], [p("trustedSourceCidr", "ipOrCidr"), p("comment")], { preflightParameters: [p("oldPort", "port"), p("trustedSourceCidr", "ipOrCidr")] }),
  entry("mikrotik", ActionType.mikrotik_enable_service, AiRiskLevel.medium, [p("serviceName", "serviceName")]),
  entry("mikrotik", ActionType.mikrotik_disable_service, AiRiskLevel.high, [p("serviceName", "serviceName")]),
  entry("mikrotik", ActionType.mikrotik_create_filter_rule, AiRiskLevel.medium, [], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr"), p("destinationIp", "ipv4"), p("destinationCidr", "ipv4Cidr"), p("port", "portRange"), p("protocol", "protocol"), p("srcInterface", "interfaceName"), p("dstInterface", "interfaceName")]),
  entry("mikrotik", ActionType.mikrotik_add_address_list_entry, AiRiskLevel.medium, [], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr")]),
  entry("mikrotik", ActionType.mikrotik_remove_address_list_entry, AiRiskLevel.medium, [], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr")]),
  entry("mikrotik", ActionType.mikrotik_create_srcnat_masquerade_rule, AiRiskLevel.medium),
  entry("mikrotik", ActionType.mikrotik_create_dstnat_rule, AiRiskLevel.high, [p("destinationIp", "ipv4"), p("port", "port"), p("newPort", "port")]),
  entry("mikrotik", ActionType.mikrotik_block_ip_temporary, AiRiskLevel.medium, [], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr")]),
  entry("mikrotik", ActionType.mikrotik_restrict_service_by_address, AiRiskLevel.high, [p("serviceName", "serviceName")], [p("trustedSourceCidr", "ipOrCidr")]),
  entry("mikrotik", ActionType.mikrotik_add_static_route, AiRiskLevel.high, [p("destinationCidr", "ipv4Cidr")]),
  ...[ActionType.mikrotik_list_ip_services, ActionType.mikrotik_list_filter_rules, ActionType.mikrotik_list_interfaces, ActionType.mikrotik_list_routes].map((actionType) => entry("mikrotik", actionType, AiRiskLevel.low, [], [], { requiresApproval: false })),

  entry("fortigate", ActionType.fortigate_create_address_object, AiRiskLevel.low, [p("addressObjectName", "addressObjectName")], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr")]),
  entry("fortigate", ActionType.fortigate_update_address_object, AiRiskLevel.medium, [p("addressObjectName", "addressObjectName")], [p("sourceIp", "ipv4"), p("sourceCidr", "ipv4Cidr")]),
  entry("fortigate", ActionType.fortigate_create_address_group, AiRiskLevel.low, [p("addressObjectName", "addressObjectName")]),
  entry("fortigate", ActionType.fortigate_create_service_object, AiRiskLevel.low, [p("serviceName", "serviceName"), p("port", "portRange")], [p("protocol", "protocol")]),
  entry("fortigate", ActionType.fortigate_create_recurring_schedule, AiRiskLevel.low, [p("schedule", "scheduleName")]),
  entry("fortigate", ActionType.fortigate_create_policy, AiRiskLevel.high, [p("srcInterface", "interfaceName"), p("dstInterface", "interfaceName")], [p("services"), p("schedule", "scheduleName"), p("nat"), p("logTraffic")]),
  entry("fortigate", ActionType.fortigate_enable_policy, AiRiskLevel.high),
  entry("fortigate", ActionType.fortigate_disable_policy, AiRiskLevel.medium),
  entry("fortigate", ActionType.fortigate_move_policy, AiRiskLevel.high),
  entry("fortigate", ActionType.fortigate_create_vip, AiRiskLevel.high, [p("sourceIp", "ipv4"), p("destinationIp", "ipv4"), p("port", "port"), p("newPort", "port")]),
  entry("fortigate", ActionType.fortigate_create_dstnat_policy, AiRiskLevel.high),
  entry("fortigate", ActionType.fortigate_create_static_route, AiRiskLevel.high, [p("destinationCidr", "ipv4Cidr"), p("gateway", "ipv4")], [p("dstInterface", "interfaceName")]),
  ...[ActionType.fortigate_list_interfaces, ActionType.fortigate_list_policies, ActionType.fortigate_list_address_objects, ActionType.fortigate_list_routes].map((actionType) => entry("fortigate", actionType, AiRiskLevel.low, [], [], { requiresApproval: false })),
  entry("fortigate", ActionType.fortigate_backup_config, AiRiskLevel.low, [], [], { requiresApproval: false }),
  entry("fortigate", ActionType.fortigate_export_sanitized_config, AiRiskLevel.low, [], [], { requiresApproval: false }),
  entry("fortigate", ActionType.fortigate_list_zones, AiRiskLevel.low, [], [], { requiresApproval: false })
];

const explicitTypes = new Set(explicitEntries.map((item) => item.actionType));
const inferredEntries = Object.values(ActionType).flatMap((actionType) => {
  const vendor = actionType.startsWith("mikrotik_") ? "mikrotik" : actionType.startsWith("fortigate_") ? "fortigate" : null;
  if (!vendor || explicitTypes.has(actionType)) return [];
  const readOnly = /_(list|read|show|export|backup|detect)_/.test(`_${actionType}_`);
  const critical = /reboot|disable_interface|change_admin_port/.test(actionType);
  return [entry(vendor, actionType, critical ? AiRiskLevel.critical : readOnly ? AiRiskLevel.low : AiRiskLevel.medium, [], [], {
    requiresApproval: !readOnly,
    requiresBreakGlass: critical
  })];
});

export const ACTION_CATALOG = Object.freeze([...explicitEntries, ...inferredEntries]);

export function getActionCatalogEntry(actionType: ActionType | string, vendor?: ActionVendor | null) {
  return ACTION_CATALOG.find((item) => item.actionType === actionType && (!vendor || item.vendor === vendor)) ?? null;
}

export function validateCatalogParameters(entry: ActionCatalogEntry, parameters: Record<string, unknown>) {
  const errors: string[] = [];
  const fieldErrors: StructuredValidationError[] = [];
  for (const parameter of entry.requiredParameters) {
    const value = parameters[parameter.name];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      errors.push(`${parameter.name} is required.`);
      fieldErrors.push(validationError(parameter.name, `${parameter.name} is required.`, value));
      continue;
    }
    if (parameter.validator && !actionValidators[parameter.validator](value as never)) {
      errors.push(`${parameter.name} is invalid.`);
      fieldErrors.push(validationError(parameter.name, `${parameter.name} has an invalid value.`, value));
    }
  }
  for (const parameter of entry.optionalParameters) {
    const value = parameters[parameter.name];
    if (value !== undefined && value !== null && value !== "" && parameter.validator && !actionValidators[parameter.validator](value as never)) {
      errors.push(`${parameter.name} is invalid.`);
      fieldErrors.push(validationError(parameter.name, `${parameter.name} has an invalid value.`, value));
    }
  }
  if (entry.actionType === ActionType.mikrotik_restrict_service_by_address && !parameters.trustedSource && !parameters.trustedSourceCidr) {
    errors.push("trustedSource or trustedSourceCidr is required for management changes.");
    fieldErrors.push(validationError("trustedSourceCidr", "Trusted source is required for management changes.", parameters.trustedSourceCidr ?? parameters.trustedSource, "IPv4 address or IPv4 CIDR, for example 192.168.1.0/24"));
  }
  if (new Set<ActionType>([ActionType.mikrotik_add_address_list_entry, ActionType.mikrotik_remove_address_list_entry, ActionType.mikrotik_block_ip_temporary]).has(entry.actionType) && !parameters.sourceIp && !parameters.sourceCidr) {
    errors.push("sourceIp or sourceCidr is required.");
    fieldErrors.push(validationError("sourceIp", "A source IP or CIDR is required.", null, "IPv4 address or IPv4 CIDR"));
  }
  if (new Set<ActionType>([ActionType.fortigate_create_address_object, ActionType.fortigate_update_address_object]).has(entry.actionType) && !parameters.sourceIp && !parameters.sourceCidr) {
    errors.push("sourceIp or sourceCidr is required for an address object.");
    fieldErrors.push(validationError("sourceCidr", "An IPv4 address or CIDR is required for the address object.", null, "IPv4 address or IPv4 CIDR"));
  }
  if (parameters.services !== undefined) {
    const services = Array.isArray(parameters.services) ? parameters.services : String(parameters.services).split(",");
    if (services.length === 0 || services.some((service) => !actionValidators.serviceName(String(service).trim()))) {
      errors.push("services contains an invalid service name.");
      fieldErrors.push(validationError("services", "One or more service names are invalid.", parameters.services));
    }
  }
  return { valid: errors.length === 0, errors, fieldErrors };
}

export function actionCatalogForVendor(vendor: ActionVendor) {
  return ACTION_CATALOG.filter((item) => item.vendor === vendor);
}
