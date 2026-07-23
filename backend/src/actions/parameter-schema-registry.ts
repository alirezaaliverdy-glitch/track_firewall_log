import { ActionType } from "@prisma/client";
import { customPlanFromParameters } from "../ai/custom-action-plan.js";

export type ActionParameterField = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "cidr" | "ip" | "secretRef";
  required: boolean;
  secure?: boolean;
  defaultValue?: unknown;
  dependsOn?: string[];
};

export type ValidationRule = {
  field: string;
  rule: string;
  message: string;
};

export type DerivedValueRule = {
  field: string;
  from: string[];
  rule: string;
};

export type ActionParameterSchema = {
  schemaVersion: string;
  actionType: string;
  vendor: string;
  platform?: string | null;
  fields: ActionParameterField[];
  validationRules: ValidationRule[];
  derivedValues: DerivedValueRule[];
  secretFields: string[];
};

const schemaVersion = "phase_h_action_parameter_schema_v1";

const field = (key: string, type: ActionParameterField["type"], required = true, extra: Partial<ActionParameterField> = {}): ActionParameterField => ({
  key,
  label: extra.label ?? key,
  type,
  required,
  ...extra,
});

const validators = (fields: ActionParameterField[]): ValidationRule[] => fields
  .filter((item) => item.required)
  .map((item) => ({ field: item.key, rule: "required", message: `${item.key} is required.` }));

function schema(input: {
  actionType: string;
  vendor: string;
  platform?: string | null;
  fields: ActionParameterField[];
  derivedValues?: DerivedValueRule[];
}): ActionParameterSchema {
  return {
    schemaVersion,
    actionType: input.actionType,
    vendor: input.vendor,
    platform: input.platform,
    fields: input.fields,
    validationRules: validators(input.fields),
    derivedValues: input.derivedValues ?? [],
    secretFields: input.fields.filter((item) => item.secure || item.type === "secretRef").map((item) => item.key),
  };
}

const SCHEMAS: ActionParameterSchema[] = [
  schema({ vendor: "cisco", actionType: "create_vlan", fields: [field("vlanId", "number"), field("name", "string", false)] }),
  schema({ vendor: "cisco", actionType: "assign_access_vlan", fields: [field("interfaceName", "string"), field("vlanId", "number")] }),
  schema({ vendor: "cisco", actionType: "static_route", fields: [field("destinationCidr", "cidr"), field("nextHop", "ip")] }),
  schema({ vendor: "cisco", actionType: "acl_apply", fields: [field("aclName", "string"), field("interfaceName", "string"), field("direction", "string")] }),
  schema({ vendor: "cisco", actionType: "routing_neighbor", fields: [field("processType", "string"), field("processId", "string"), field("neighborIp", "ip")] }),
  schema({ vendor: "cisco", actionType: "service_settings", fields: [field("server", "ip"), field("description", "string", false)] }),

  schema({ vendor: "mikrotik", actionType: "vlan_bridge_port", fields: [field("vlanId", "number"), field("interfaceName", "string"), field("bridge", "string", false)] }),
  schema({ vendor: "mikrotik", actionType: "static_route", fields: [field("destinationCidr", "cidr"), field("gateway", "ip")] }),
  schema({ vendor: "mikrotik", actionType: "firewall_rule", fields: [field("chain", "string"), field("action", "string"), field("sourceCidr", "cidr", false), field("destinationCidr", "cidr", false), field("port", "string", false)] }),
  schema({ vendor: "mikrotik", actionType: "wireguard", fields: [field("interfaceName", "string"), field("listenPort", "number"), field("peerPublicKeyRef", "secretRef", true, { secure: true })] }),
  schema({ vendor: "mikrotik", actionType: "service_port", fields: [field("serviceName", "string"), field("newPort", "number"), field("trustedSourceCidr", "cidr", false)] }),

  schema({ vendor: "fortigate", actionType: "address_policy", fields: [field("addressObjectName", "string"), field("sourceCidr", "cidr"), field("srcInterface", "string"), field("dstInterface", "string"), field("services", "string")] }),
  schema({ vendor: "fortigate", actionType: "vip_dnat", fields: [field("sourceIp", "ip"), field("destinationIp", "ip"), field("port", "number"), field("newPort", "number")] }),
  schema({ vendor: "fortigate", actionType: "ipsec_vpn", fields: [field("remoteGateway", "ip"), field("localSubnet", "cidr"), field("remoteSubnet", "cidr"), field("pskRef", "secretRef", true, { secure: true })] }),
  schema({ vendor: "fortigate", actionType: "sdwan_rule", fields: [field("name", "string"), field("srcInterface", "string"), field("dstInterface", "string")] }),

  schema({ vendor: "linux", actionType: "systemd_service", fields: [field("serviceName", "string"), field("operation", "string")] }),
  schema({ vendor: "linux", actionType: "reverse_proxy", fields: [field("serverName", "string"), field("upstreamUrl", "string"), field("certificateRef", "secretRef", false, { secure: true })] }),
  schema({ vendor: "linux", actionType: "docker_compose", fields: [field("composeRef", "string"), field("projectName", "string")] }),
  schema({ vendor: "linux", actionType: "firewall_rule", fields: [field("port", "number"), field("protocol", "string", false, { defaultValue: "tcp" }), field("sourceCidr", "cidr", false)] }),
  schema({ vendor: "linux", actionType: "user_sudo", fields: [field("username", "string"), field("operation", "string")] }),
];

function normalizeVendor(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("cisco")) return "cisco";
  if (text.includes("mikrotik") || text.includes("routeros")) return "mikrotik";
  if (text.includes("forti")) return "fortigate";
  if (text.includes("linux")) return "linux";
  return text || "generic";
}

function normalizeActionType(actionType: string, parameters: Record<string, unknown>) {
  const custom = customPlanFromParameters(parameters);
  const operation = String(custom?.typedParameters.operation ?? parameters.operation ?? actionType).replace(/-/g, "_");
  if (operation === "create_vlan") return "create_vlan";
  if (operation === "enable_dhcp_snooping") return "service_settings";
  if (operation.includes("service")) return "systemd_service";
  if (operation.includes("route")) return "static_route";
  if (operation.includes("policy")) return "address_policy";
  return operation;
}

export function listActionParameterSchemas() {
  return SCHEMAS;
}

export function getActionParameterSchema(input: {
  actionType: string;
  vendor?: string | null;
  platform?: string | null;
  parametersJson?: Record<string, unknown>;
}): ActionParameterSchema {
  const vendor = normalizeVendor(input.vendor ?? input.parametersJson?.vendor);
  const actionType = normalizeActionType(input.actionType, input.parametersJson ?? {});
  return SCHEMAS.find((item) => item.vendor === vendor && item.actionType === actionType)
    ?? schema({ vendor, platform: input.platform, actionType, fields: [] });
}
