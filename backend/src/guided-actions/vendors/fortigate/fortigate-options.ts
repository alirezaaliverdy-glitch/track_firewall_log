import type { GuidedActionField } from "../../types.js";

export const FORTIGATE_POLICY_ACTION_OPTIONS = [
  { labelFa: "اجازه دادن", value: "accept", source: "existing_template" as const },
  { labelFa: "رد کردن", value: "deny", source: "existing_template" as const },
];

export const FORTIGATE_ENABLE_DISABLE_OPTIONS = [
  { labelFa: "فعال", value: "enable", source: "existing_template" as const },
  { labelFa: "غیرفعال", value: "disable", source: "existing_template" as const },
];

export const FORTIGATE_SERVICE_PROTOCOL_OPTIONS = [
  { labelFa: "TCP", value: "TCP", source: "existing_template" as const },
  { labelFa: "UDP", value: "UDP", source: "existing_template" as const },
  { labelFa: "TCP و UDP", value: "TCP-UDP", source: "existing_template" as const },
];

export const FORTIGATE_ADDRESS_TYPE_OPTIONS = [
  { labelFa: "Subnet / IP mask", value: "subnet", source: "existing_template" as const },
  { labelFa: "IP Range", value: "iprange", source: "official_docs" as const },
  { labelFa: "FQDN", value: "fqdn", source: "official_docs" as const },
  { labelFa: "Wildcard FQDN", value: "wildcard-fqdn", source: "official_docs" as const },
  { labelFa: "Geography", value: "geography", source: "existing_template" as const },
];

export const FORTIGATE_ALLOWACCESS_OPTIONS = [
  "ping",
  "https",
  "ssh",
  "http",
  "fgfm",
  "snmp",
  "radius-acct",
  "probe-response",
  "fabric",
].map((value) => ({ labelFa: value, value, source: "existing_template" as const }));

export const FORTIGATE_LOG_TRAFFIC_OPTIONS = [
  { labelFa: "ثبت همه ترافیک", value: "all", source: "existing_template" as const },
  { labelFa: "بدون لاگ", value: "disable", source: "existing_template" as const },
];

export const FORTIGATE_VPN_SCENARIO_OPTIONS = [
  { labelFa: "Site-to-site", value: "site_to_site", source: "project_default" as const },
  { labelFa: "Remote access", value: "remote_access", source: "project_default" as const },
];

export const FORTIGATE_PSK_MODE_OPTIONS = [
  { labelFa: "تولید SecretRef", value: "generate", source: "project_default" as const },
  { labelFa: "SecretRef موجود", value: "secretRef", source: "project_default" as const },
];

export function allowedValues(field: GuidedActionField) {
  return field.options?.map((option) => option.value);
}
