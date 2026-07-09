import { FORTIGATE_GUIDED_BLUEPRINTS, resolveFortiGateGuidedIntent } from "./vendors/fortigate/fortigate-blueprints.js";
import type { GuidedActionBlueprint, GuidedActionBuildContext, GuidedActionField } from "./types.js";

function planned(reasonFa: string) {
  return (_context: GuidedActionBuildContext) => ({ ok: false as const, status: "planned" as const, reasonFa });
}

function field(key: string, labelFa: string, type: GuidedActionField["type"], required = true, extra: Partial<GuidedActionField> = {}): GuidedActionField {
  return { key, labelFa, type, required, ...extra };
}

function plannedBlueprint(input: {
  id: string;
  vendor: "mikrotik" | "linux";
  titleFa: string;
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  connector: string;
  fields: GuidedActionField[];
}): GuidedActionBlueprint {
  return {
    id: input.id,
    vendor: input.vendor,
    titleFa: input.titleFa,
    descriptionFa: "این سناریو هنوز اجرای کامل ندارد، اما می‌توان اطلاعات و پیش‌نمایش ساختار اکشن را آماده کرد.",
    category: input.category,
    risk: input.risk,
    actionKind: "guided_action",
    implementationState: "planned",
    researchStatus: "unknown",
    supportedConnectors: [input.connector],
    requiredCapabilities: [],
    prerequisites: [],
    steps: [{ id: "planned_details", titleFa: "اطلاعات سناریو", fields: input.fields }],
    buildActionPlan: planned("این سناریو هنوز اجرای کامل ندارد، اما می‌توان اطلاعات و پیش‌نمایش ساختار اکشن را آماده کرد."),
    verification: { commands: [] },
    rollback: { template: "planned" },
  };
}

const GENERIC_GUIDED_BLUEPRINTS: readonly GuidedActionBlueprint[] = Object.freeze([
  plannedBlueprint({ id: "mikrotik_guided_vpn_setup", vendor: "mikrotik", titleFa: "ساخت مرحله‌ای VPN میکروتیک", category: "vpn", risk: "high", connector: "mikrotik-ssh", fields: [field("vpnType", "نوع VPN", "select", true, { options: [{ labelFa: "WireGuard", value: "wireguard", source: "project_default" }, { labelFa: "L2TP/IPsec", value: "l2tp_ipsec", source: "project_default" }], validation: { allowedValues: ["wireguard", "l2tp_ipsec"] } }), field("name", "نام", "text", false)] }),
  plannedBlueprint({ id: "mikrotik_guided_firewall_rule_create", vendor: "mikrotik", titleFa: "ساخت مرحله‌ای Rule میکروتیک", category: "firewall", risk: "high", connector: "mikrotik-ssh", fields: [field("chain", "Chain", "select", true, { options: [{ labelFa: "input", value: "input", source: "project_default" }, { labelFa: "forward", value: "forward", source: "project_default" }], validation: { allowedValues: ["input", "forward"] } }), field("action", "Action", "select", true, { options: [{ labelFa: "accept", value: "accept", source: "project_default" }, { labelFa: "drop", value: "drop", source: "project_default" }], validation: { allowedValues: ["accept", "drop"] } })] }),
  plannedBlueprint({ id: "mikrotik_guided_wireguard_setup", vendor: "mikrotik", titleFa: "ساخت مرحله‌ای WireGuard میکروتیک", category: "vpn", risk: "high", connector: "mikrotik-ssh", fields: [field("interfaceName", "نام Interface", "text", true), field("listenPort", "Listen Port", "number", true, { validation: { min: 1, max: 65535 } })] }),
  plannedBlueprint({ id: "mikrotik_guided_l2tp_ipsec_setup", vendor: "mikrotik", titleFa: "ساخت مرحله‌ای L2TP/IPsec میکروتیک", category: "vpn", risk: "high", connector: "mikrotik-ssh", fields: [field("profileName", "نام Profile", "text", true), field("localAddress", "Local Address", "ip", false)] }),
  plannedBlueprint({ id: "linux_guided_service_publish", vendor: "linux", titleFa: "انتشار مرحله‌ای سرویس لینوکس", category: "service", risk: "high", connector: "linux-ssh", fields: [field("serviceName", "نام سرویس", "text", true), field("port", "پورت", "number", true, { validation: { min: 1, max: 65535 } })] }),
  plannedBlueprint({ id: "linux_guided_firewall_rule_create", vendor: "linux", titleFa: "ساخت مرحله‌ای Rule فایروال لینوکس", category: "firewall", risk: "high", connector: "linux-ssh", fields: [field("port", "پورت", "number", true, { validation: { min: 1, max: 65535 } }), field("protocol", "پروتکل", "select", true, { options: [{ labelFa: "TCP", value: "tcp", source: "project_default" }, { labelFa: "UDP", value: "udp", source: "project_default" }], validation: { allowedValues: ["tcp", "udp"] } })] }),
]);

export const GUIDED_ACTION_BLUEPRINTS: readonly GuidedActionBlueprint[] = Object.freeze([
  ...FORTIGATE_GUIDED_BLUEPRINTS,
  ...GENERIC_GUIDED_BLUEPRINTS,
]);

export function getGuidedActionBlueprint(id: string) {
  return GUIDED_ACTION_BLUEPRINTS.find((blueprint) => blueprint.id === id) ?? null;
}

export function listGuidedActionBlueprints(filter?: { vendor?: string }) {
  return GUIDED_ACTION_BLUEPRINTS.filter((blueprint) => !filter?.vendor || blueprint.vendor === filter.vendor);
}

export function resolveGuidedAction(input: { text: string; vendor: string }) {
  if (input.vendor === "fortigate") return resolveFortiGateGuidedIntent(input.text);
  const text = input.text.toLowerCase().replace(/\u200c/g, " ");
  if (input.vendor === "mikrotik") {
    if (/wireguard|وایرگارد/i.test(text)) return { blueprintId: "mikrotik_guided_wireguard_setup", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
    if (/l2tp|ipsec/i.test(text)) return { blueprintId: "mikrotik_guided_l2tp_ipsec_setup", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
    if (/vpn|تونل/i.test(text)) return { blueprintId: "mikrotik_guided_vpn_setup", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
    if (/policy|rule|رول|قانون|دسترسی/i.test(text)) return { blueprintId: "mikrotik_guided_firewall_rule_create", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  if (input.vendor === "linux") {
    if (/publish|service|سرویس|port forward|nat/i.test(text)) return { blueprintId: "linux_guided_service_publish", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
    if (/firewall|rule|رول|قانون|دسترسی|port|پورت/i.test(text)) return { blueprintId: "linux_guided_firewall_rule_create", initialValues: {}, reasonFa: "این درخواست چندمرحله‌ای است و باید اطلاعات تکمیلی از شما گرفته شود." };
  }
  return null;
}
