import { ActionType } from "@prisma/client";
import { normalizeVendor, type NormalizedVendor } from "../services/ai-normalization.js";

export const CANONICAL_INTENT_FIELDS = [
  "deviceId", "vendor", "actionType", "sourceIp", "sourceCidr", "destinationIp", "destinationCidr",
  "trustedSource", "trustedSourceCidr", "srcInterface", "dstInterface", "srcZone", "dstZone",
  "serviceName", "services", "username", "port", "newPort", "protocol", "schedule", "nat", "logTraffic", "comment"
] as const;

export type CanonicalIntentField = typeof CANONICAL_INTENT_FIELDS[number];
export type CanonicalIntent = Partial<Record<CanonicalIntentField, unknown>> & Record<string, unknown> & {
  vendor?: NormalizedVendor;
  actionType?: ActionType;
};

const FIELD_ALIASES: Record<string, CanonicalIntentField> = {
  targetDeviceId: "deviceId", device: "deviceId", targetDevice: "deviceId",
  srcIp: "sourceIp", srcIP: "sourceIp", sourceIP: "sourceIp", ip: "sourceIp", address: "sourceIp",
  srcCidr: "sourceCidr", sourceCIDR: "sourceCidr",
  dstIp: "destinationIp", dstIP: "destinationIp", destination: "destinationIp", mappedIp: "destinationIp",
  dstCidr: "destinationCidr", destinationCIDR: "destinationCidr",
  trustedSourceIp: "trustedSource", trustedSourceIP: "trustedSource", trustedSourceCidr: "trustedSourceCidr",
  srcintf: "srcInterface", sourceInterface: "srcInterface",
  dstintf: "dstInterface", destinationInterface: "dstInterface",
  sourceZone: "srcZone", destinationZone: "dstZone",
  service: "serviceName", scheduleName: "schedule", log: "logTraffic", toPort: "newPort",
  externalIp: "sourceIp", internalIp: "destinationIp",
  externalPort: "port", mappedPort: "newPort", internalPort: "newPort",
  fromInterface: "srcInterface", toInterface: "dstInterface", fromZone: "srcZone", toZone: "dstZone"
};

const NORMALIZED_KEY_ALIASES: Record<string, CanonicalIntentField> = {
  trustedsource: "trustedSourceCidr",
  trustedsourcecidr: "trustedSourceCidr",
  source: "sourceIp",
  from: "sourceIp",
  destination: "destinationIp",
  dst: "destinationIp",
  newport: "newPort",
  service: "serviceName",
  sourceinterface: "srcInterface",
  destinationinterface: "dstInterface",
  srcinterface: "srcInterface",
  dstinterface: "dstInterface",
  sourcezone: "srcZone",
  destinationzone: "dstZone",
  srczone: "srcZone",
  dstzone: "dstZone"
};

const ACTION_ALIASES: Record<string, ActionType> = {
  "change service port": ActionType.mikrotik_change_service_port,
  change_service_port: ActionType.mikrotik_change_service_port,
  change_ssh_port: ActionType.mikrotik_change_service_port,
  mikrotik_change_ssh_port: ActionType.mikrotik_change_service_port,
  "block source ip temporary": ActionType.mikrotik_block_ip_temporary,
  block_source_ip_temporary: ActionType.mikrotik_block_ip_temporary,
  "add firewall filter rule": ActionType.mikrotik_create_filter_rule,
  add_firewall_rule: ActionType.mikrotik_create_filter_rule,
  "add nat rule": ActionType.mikrotik_create_srcnat_masquerade_rule,
  "add port forward rule": ActionType.mikrotik_create_dstnat_rule,
  "allow trusted management source": ActionType.mikrotik_restrict_service_by_address,
  "add static route": ActionType.mikrotik_add_static_route,
  "read services": ActionType.mikrotik_list_ip_services,
  "read firewall rules": ActionType.mikrotik_list_filter_rules,
  "read interfaces": ActionType.mikrotik_list_interfaces,
  "read routes": ActionType.mikrotik_list_routes,
  "create address object": ActionType.fortigate_create_address_object,
  "update address object": ActionType.fortigate_update_address_object,
  "create address group": ActionType.fortigate_create_address_group,
  "create service object": ActionType.fortigate_create_service_object,
  "create schedule": ActionType.fortigate_create_recurring_schedule,
  "create firewall policy": ActionType.fortigate_create_policy,
  "enable firewall policy": ActionType.fortigate_enable_policy,
  "disable firewall policy": ActionType.fortigate_disable_policy,
  "move firewall policy": ActionType.fortigate_move_policy,
  "create vip": ActionType.fortigate_create_vip,
  "create port forward": ActionType.fortigate_create_vip,
  "backup config": ActionType.fortigate_backup_config,
  "read config": ActionType.fortigate_export_sanitized_config
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

export function normalizeActionType(value: unknown, vendor?: NormalizedVendor | null): ActionType | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (vendor === "fortigate") {
    const fortigateShared: Record<string, ActionType> = {
      add_static_route: ActionType.fortigate_create_static_route,
      create_static_route: ActionType.fortigate_create_static_route,
      read_interfaces: ActionType.fortigate_list_interfaces,
      read_policies: ActionType.fortigate_list_policies,
      read_address_objects: ActionType.fortigate_list_address_objects,
      read_routes: ActionType.fortigate_list_routes
    };
    if (fortigateShared[token]) return fortigateShared[token];
  }
  if (Object.values(ActionType).includes(token as ActionType)) {
    const action = token as ActionType;
    if (vendor === "mikrotik" && action === ActionType.block_source_ip_temporary) return ActionType.mikrotik_block_ip_temporary;
    if (vendor === "mikrotik" && action === ActionType.change_ssh_port) return ActionType.mikrotik_change_service_port;
    return action;
  }
  return ACTION_ALIASES[value.trim().toLowerCase()] ?? ACTION_ALIASES[token] ?? null;
}

export function normalizeIntent(input: Record<string, unknown>): CanonicalIntent {
  const source = input.parametersJson && typeof input.parametersJson === "object" && !Array.isArray(input.parametersJson)
    ? { ...(input.parametersJson as Record<string, unknown>), ...input }
    : { ...input };
  delete source.parametersJson;
  const normalized: CanonicalIntent = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const canonicalKey = FIELD_ALIASES[key] ?? NORMALIZED_KEY_ALIASES[normalizedKey] ?? key;
    const value = cleanText(rawValue);
    if (value !== undefined && value !== "") (normalized as Record<string, unknown>)[canonicalKey] = value;
  }
  const vendor = normalizeVendor(normalized.vendor ?? source.targetDeviceHint);
  if (vendor) normalized.vendor = vendor;
  else delete normalized.vendor;
  const actionType = normalizeActionType(normalized.actionType, vendor);
  if (actionType) normalized.actionType = actionType;
  else delete normalized.actionType;

  for (const key of ["port", "newPort"] as const) {
    if (normalized[key] !== undefined && /^\d+$/.test(String(normalized[key]))) normalized[key] = Number(normalized[key]);
  }
  if (typeof normalized.protocol === "string") normalized.protocol = normalized.protocol.toLowerCase();
  if (typeof normalized.serviceName === "string") normalized.serviceName = normalized.serviceName.toLowerCase();
  if (typeof normalized.services === "string") normalized.services = normalized.services.split(",").map((item) => item.trim()).filter(Boolean);
  if (typeof normalized.sourceIp === "string" && normalized.sourceIp.includes("/")) {
    normalized.sourceCidr = normalized.sourceIp;
    delete normalized.sourceIp;
  }
  if (typeof normalized.destinationIp === "string" && normalized.destinationIp.includes("/")) {
    normalized.destinationCidr = normalized.destinationIp;
    delete normalized.destinationIp;
  }
  if (typeof normalized.trustedSource === "string" && normalized.trustedSource.includes("/")) {
    normalized.trustedSourceCidr = normalized.trustedSource;
    delete normalized.trustedSource;
  }
  if (typeof normalized.trustedSource === "string" && !normalized.trustedSourceCidr) normalized.trustedSourceCidr = normalized.trustedSource;
  if (typeof normalized.trustedSourceCidr === "string") delete normalized.trustedSource;
  const actionTypeText = String(normalized.actionType ?? source.actionType ?? "");
  if (typeof normalized.sourceIp === "string" && !normalized.sourceIp.includes("/") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized.sourceIp) && actionTypeText.startsWith("fortigate_")) {
    normalized.srcInterface = normalized.srcInterface ?? normalized.sourceIp;
    delete normalized.sourceIp;
  }
  if (typeof normalized.destinationIp === "string" && !normalized.destinationIp.includes("/") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized.destinationIp) && actionTypeText.startsWith("fortigate_")) {
    normalized.dstInterface = normalized.dstInterface ?? normalized.destinationIp;
    delete normalized.destinationIp;
  }
  if (!normalized.srcInterface && typeof normalized.srcZone === "string") normalized.srcInterface = normalized.srcZone;
  if (!normalized.dstInterface && typeof normalized.dstZone === "string") normalized.dstInterface = normalized.dstZone;
  return normalized;
}

export const canonicalFieldMap = Object.freeze({ ...FIELD_ALIASES });
