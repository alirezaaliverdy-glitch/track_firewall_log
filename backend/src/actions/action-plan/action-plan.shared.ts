import {
  ActionPlanStatus,
  ActionType,
  AiRiskLevel,
  DeviceProtocol,
  DeviceType,
  type ActionPlan,
  type Device,
  Prisma
} from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { isMikroTikAction } from "../mikrotik-action-catalog.js";
import { getDeviceConnectors, selectDeviceConnector } from "../../connectors/connector-registry.service.js";
import { validateActionPlan } from "../../services/policy-guard.service.js";
import { getActionCatalogEntry } from "../action-catalog.js";
import { normalizeActionType as normalizeCatalogActionType, normalizeIntent } from "../intent-normalizer.js";
import { CANONICAL_INTENT_FIELDS } from "../intent-normalizer.js";
import { normalizeVendor } from "../../services/ai-normalization.js";
import { env, type ActionExecutionMode } from "../../config/env.js";
import { VENDOR_COMMAND_CATALOG } from "../catalog/index.js";
import { resolveCatalogAction } from "../../commands/catalog/catalog-action-resolver.js";
import { COMMAND_CATALOG } from "../../commands/catalog/index.js";
import { normalizeFortiGateGuidedVpnParameters } from "../../services/fortigate-guided-vpn.schema.js";
import { getExecutionTemplate, type ExecutionTemplate } from "../../commands/execution/execution-template-registry.js";
import type { ConnectorExecutionResult, DeviceConnector } from "../../connectors/types.js";
import { customPlanFromParameters, customTemplateForVendor, customVendorFromDevice } from "../../ai/custom-action-plan.js";
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type ActionVendor = "mikrotik" | "fortigate" | "linux_edge" | "pfsense" | "cisco" | "juniper" | "paloalto" | "windows" | "docker" | "kubernetes" | "generic" | "unknown" | undefined;

export function vendorFromActionType(actionType: ActionType | string): ActionVendor {
  if (String(actionType).startsWith("mikrotik_")) return "mikrotik";
  if (String(actionType).startsWith("fortigate_")) return "fortigate";
  if (String(actionType).startsWith("linux_")) return "linux_edge";
  return undefined;
}

export function vendorFromDevice(device: Pick<Device, "type" | "vendor"> | null | undefined): ActionVendor {
  const vendor = String(device?.vendor ?? "").toLowerCase();
  if (device?.type === DeviceType.mikrotik || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device?.type === DeviceType.fortigate || vendor.includes("forti")) return "fortigate";
  if (device?.type === DeviceType.linux_edge || vendor.includes("linux")) return "linux_edge";
  if (vendor.includes("cisco")) return "cisco";
  return undefined;
}

export function vendorFromInput(input: Record<string, unknown>, parameters: Record<string, unknown>): ActionVendor {
  const normalized = normalizeVendor(input.vendor ?? parameters.vendor ?? parameters.targetDeviceHint);
  if (normalized === "linux") return "linux_edge";
  if (normalized) return normalized;
  return undefined;
}

export function normalizeActionTypeForVendor(actionType: ActionType, vendor: ActionVendor): ActionType {
  if (vendor === "mikrotik") {
    if (actionType === ActionType.block_source_ip_temporary) return ActionType.mikrotik_block_ip_temporary;
    if (actionType === ActionType.change_ssh_port) return ActionType.mikrotik_change_service_port;
    if (String(actionType) === "add_address_list_entry") return ActionType.mikrotik_add_address_list_entry;
  }
  if (vendor === "linux_edge" && actionType === ActionType.open_port) return ActionType.linux_open_port;
  return actionType;
}

export function actionTypeFromInput(value: unknown, vendor: ActionVendor): ActionType {
  const catalogAction = normalizeCatalogActionType(value, vendor === "linux_edge" ? null : vendor);
  if (catalogAction) return normalizeActionTypeForVendor(catalogAction, vendor);
  if (vendor === "mikrotik" && value === "add_address_list_entry") return ActionType.mikrotik_add_address_list_entry;
  if (vendor === "mikrotik" && value === "block_source_ip_temporary") return ActionType.mikrotik_block_ip_temporary;
  if (vendor === "mikrotik" && ["change_ssh_port", "mikrotik_change_ssh_port", "mikrotik_change_service_port"].includes(String(value))) return ActionType.mikrotik_change_service_port;
  return normalizeActionTypeForVendor(asEnum(value, ActionType, "actionType"), vendor);
}

function firstText(parameters: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = parameters[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function timeoutFromDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value % 60 === 0 ? `${value / 60}h` : `${value}m`;
  }
  if (typeof value === "string" && value.trim()) {
    const text = value.trim().toLowerCase();
    if (/^(\d+[smhdw]){1,4}$/.test(text)) return text;
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return numeric % 60 === 0 ? `${numeric / 60}h` : `${numeric}m`;
    if (text.includes("\u0646\u06cc\u0645 \u0633\u0627\u0639\u062a") || text.includes("\u0646\u064a\u0645 \u0633\u0627\u0639\u062a")) return "30m";
    const amount = text.includes("\u06cc\u06a9") || text.includes("\u064a\u06a9")
      ? 1
      : Number(text.match(/\d+/)?.[0]);
    if (Number.isFinite(amount) && amount > 0) {
      if (text.includes("hour") || text.includes("\u0633\u0627\u0639\u062a")) return `${amount}h`;
      if (text.includes("day") || text.includes("\u0631\u0648\u0632")) return `${amount}d`;
      if (text.includes("week") || text.includes("\u0647\u0641\u062a\u0647")) return `${amount}w`;
      return `${amount}m`;
    }
  }
  return undefined;
}

export function normalizeParameters(actionType: ActionType, parameters: Record<string, unknown>) {
  const canonical = normalizeIntent({ ...parameters, actionType });
  delete canonical.actionType;
  if (typeof parameters.source === "string" && ["command_catalog", "command_search_ai_fallback", "ai_mapped_template", "guided_action_wizard", "ai_custom_connector_plan"].includes(parameters.source) && canonical.sourceIp === parameters.source) {
    delete canonical.sourceIp;
    delete canonical.srcInterface;
  }
  const normalized = { ...parameters, ...canonical };
  if (normalized.port !== undefined && normalized.port !== "") normalized.port = Number(normalized.port);
  if (normalized.newPort !== undefined && normalized.newPort !== "") normalized.newPort = Number(normalized.newPort);
  if (typeof normalized.protocol === "string") normalized.protocol = normalized.protocol.trim().toLowerCase();
  if (actionType === ActionType.fortigate_guided_vpn_setup) {
    return normalizeFortiGateGuidedVpnParameters(normalized);
  }
  if (actionType === ActionType.mikrotik_block_ip_temporary || actionType === ActionType.mikrotik_block_ip || actionType === ActionType.mikrotik_add_address_list_entry) {
    const address = firstText(normalized, ["address", "srcIP", "srcIp", "sourceIp", "sourceIP", "ipAddress", "ip"]);
    if (address) normalized.address = address;
    if (typeof normalized.listName !== "string" || !normalized.listName.trim()) normalized.listName = "ai_blocklist";
    const timeout = firstText(normalized, ["timeout"]) ?? timeoutFromDuration(normalized.durationMinutes) ?? timeoutFromDuration(normalized.duration);
    if (timeout) normalized.timeout = timeout;
    if ((actionType === ActionType.mikrotik_block_ip_temporary || actionType === ActionType.mikrotik_block_ip) && (typeof normalized.timeout !== "string" || !normalized.timeout.trim())) normalized.timeout = "10m";
    if (typeof normalized.comment !== "string" || !normalized.comment.trim()) normalized.comment = "created-by-firewall-log-analyzer";
  }
  if (actionType === ActionType.mikrotik_update_address_list_entry) {
    const address = firstText(normalized, ["address", "srcIP", "srcIp", "sourceIp", "sourceIP", "ip"]);
    if (address) normalized.address = address;
    if (typeof normalized.listName !== "string" || !normalized.listName.trim()) normalized.listName = "ai_blocklist";
    const timeout = firstText(normalized, ["timeout"]) ?? timeoutFromDuration(normalized.durationMinutes) ?? timeoutFromDuration(normalized.duration);
    if (timeout) normalized.timeout = timeout;
    if (typeof normalized.comment !== "string" || !normalized.comment.trim()) normalized.comment = "created-by-firewall-log-analyzer";
  }
  if (actionType === ActionType.mikrotik_change_service_port) {
    const service = normalized.serviceName ?? normalized.service;
    normalized.service = typeof service === "string" && service.trim()
      ? service.trim().toLowerCase()
      : "ssh";
    normalized.serviceName = normalized.service;
    const newPort = normalized.newPort ?? normalized.toPort ?? normalized.port;
    if (newPort !== undefined) {
      normalized.newPort = Number(newPort);
      normalized.port = Number(newPort);
    }
    const trustedSource = normalized.trustedSourceCidr ?? normalized.trustedSourceIp ?? normalized.trustedSource;
    if (typeof trustedSource === "string" && trustedSource.trim()) normalized.trustedSource = trustedSource.trim();
  }
  if (new Set<ActionType>([ActionType.mikrotik_add_address_list_entry, ActionType.mikrotik_remove_address_list_entry, ActionType.mikrotik_block_ip_temporary, ActionType.mikrotik_block_ip, ActionType.mikrotik_update_address_list_entry]).has(actionType)) {
    const address = normalized.sourceIp ?? normalized.sourceCidr ?? normalized.address;
    if (typeof address === "string" && address.trim()) normalized.address = address.trim();
  }
  if (actionType === ActionType.fortigate_create_address_object || actionType === ActionType.fortigate_update_address_object) {
    const name = firstText(normalized, ["addressObjectName", "name"]);
    if (name) {
      normalized.addressObjectName = name;
      normalized.name = name;
    }
    const address = firstText(normalized, ["sourceCidr", "sourceIp", "cidr", "ip", "address"]);
    if (address) {
      normalized.cidr = address;
      if (address.includes("/")) normalized.sourceCidr = address;
      else normalized.sourceIp = address;
    }
  }
  const fortiPolicyActions = new Set<ActionType>([ActionType.fortigate_create_policy, ActionType.fortigate_create_zone_policy, ActionType.fortigate_create_egress_policy, ActionType.fortigate_create_deny_policy, ActionType.fortigate_create_dstnat_policy, ActionType.fortigate_update_policy]);
  if (fortiPolicyActions.has(actionType)) {
    const srcInterface = firstText(normalized, ["srcInterface", "srcZone", "srcintf"]);
    const dstInterface = firstText(normalized, ["dstInterface", "dstZone", "dstintf"]);
    if (srcInterface) {
      normalized.srcInterface = srcInterface;
      normalized.srcintf = srcInterface;
    }
    if (dstInterface) {
      normalized.dstInterface = dstInterface;
      normalized.dstintf = dstInterface;
    }
    if (normalized.logTraffic !== undefined) normalized.logtraffic = normalized.logTraffic === true ? "all" : "disable";
  }
  if (actionType === ActionType.fortigate_create_vip) {
    if (normalized.sourceIp && !normalized.externalIp) normalized.externalIp = normalized.sourceIp;
    if (normalized.destinationIp && !normalized.mappedIp) normalized.mappedIp = normalized.destinationIp;
    if (normalized.port !== undefined && normalized.externalPort === undefined) normalized.externalPort = normalized.port;
    if (normalized.newPort !== undefined && normalized.mappedPort === undefined) normalized.mappedPort = normalized.newPort;
  }
  return normalized;
}

const EDITABLE_ACTION_FIELDS = new Set<string>(CANONICAL_INTENT_FIELDS.filter((field) => !["deviceId", "vendor", "actionType"].includes(field)));

export function mergeCorrectedParameters(actionType: ActionType, current: Record<string, unknown>, corrections: Record<string, unknown>) {
  const unsafe = Object.keys(corrections).filter((key) => !EDITABLE_ACTION_FIELDS.has(key));
  if (unsafe.length > 0) throw new ActionExecutionError("INVALID_CORRECTION_FIELD", `Only canonical action fields can be corrected: ${unsafe.join(", ")}.`, 400);
  return normalizeParameters(actionType, { ...current, ...corrections });
}

export async function findOnlyCompatibleDevice(vendor: ActionVendor) {
  if (!vendor || !["mikrotik", "fortigate", "linux_edge"].includes(vendor)) return undefined;
  const where = vendor === "mikrotik"
    ? { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.mikrotik }, { vendor: { contains: "mikrotik", mode: "insensitive" as const } }, { vendor: { contains: "routeros", mode: "insensitive" as const } }] }
    : vendor === "fortigate"
      ? { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.fortigate }, { vendor: { contains: "forti", mode: "insensitive" as const } }] }
      : { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.linux_edge }, { vendor: { contains: "linux", mode: "insensitive" as const } }] };
  const devices = await prisma.device.findMany({ where, select: { id: true }, take: 2 });
  return devices.length === 1 ? devices[0].id : undefined;
}

export async function prepareActionPlan(plan: ActionPlan) {
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
  const vendor = vendorFromDevice(device) ?? vendorFromActionType(plan.actionType) ?? vendorFromInput({}, asObject(plan.parametersJson));
  const actionType = normalizeActionTypeForVendor(plan.actionType, vendor);
  const deviceId = plan.deviceId ?? await findOnlyCompatibleDevice(vendor);
  const parametersJson = withPlanIdentity(actionType, normalizeParameters(actionType, asObject(plan.parametersJson)), deviceId, vendor);
  const changed = actionType !== plan.actionType ||
    deviceId !== plan.deviceId ||
    JSON.stringify(parametersJson) !== JSON.stringify(asObject(plan.parametersJson));

  if (!changed) return plan;
  return prisma.actionPlan.update({
    where: { id: plan.id },
    data: {
      actionType,
      deviceId,
      parametersJson: toJson(parametersJson)
    }
  });
}

export function withPlanIdentity(actionType: ActionType, parameters: Record<string, unknown>, deviceId?: string | null, vendor?: ActionVendor) {
  return {
    ...parameters,
    actionType,
    ...(deviceId ? { deviceId } : {}),
    ...(vendor ? { vendor } : {})
  };
}

export function storedNormalizedParameters(plan: ActionPlan, normalized: Record<string, unknown>) {
  return withPlanIdentity(
    plan.actionType,
    { ...asObject(plan.parametersJson), ...normalized },
    plan.deviceId,
    vendorFromActionType(plan.actionType)
  );
}

const NON_EXECUTION_PARAMETER_FIELDS = new Set([
  "metadata", "actionType", "deviceId", "vendor", "executionSupport", "missingFields", "clarificationQuestions",
  "source", "implementationState", "supportState", "supportReasonKey", "executable", "connectorType", "executionTemplateRef", "normalizedParams", "requiredParamsSatisfied",
  "requiresExplicitReview", "expectedImpact", "suggestedPrechecks", "suggestedVerification", "suggestedRollback"
]);

export function executionParametersOnly(parameters: Record<string, unknown>) {
  const metadata = asObject(parameters.metadata);
  const resolverParams = asObject(metadata.normalizedParams ?? parameters.normalizedParams);
  const storedParams = Object.fromEntries(Object.entries(parameters).filter(([key]) => !NON_EXECUTION_PARAMETER_FIELDS.has(key)));
  return { ...resolverParams, ...storedParams };
}

const EXECUTION_ONLY_FIELDS = new Set(["breakGlass", "executeConfirmation", "deviceNameConfirmation", "reason", "intent"]);

export function stableJson(value: unknown) {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      const values = item.map(stable);
      return values.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))
        ? values.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
        : values;
    }
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key]) => !EXECUTION_ONLY_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]));
  };
  return JSON.stringify(stable(value));
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function canonicalParameterValues(parameters: Record<string, unknown>) {
  const canonical = { ...executionParametersOnly(parameters) };
  if (canonical.port !== undefined) canonical.port = Number(canonical.port);
  if (canonical.newPort !== undefined) canonical.newPort = Number(canonical.newPort);
  if (typeof canonical.protocol === "string") canonical.protocol = canonical.protocol.trim().toLowerCase();
  return canonical;
}

export interface CanonicalActionPlanPayload {
  actionType: string;
  targetDeviceId: string;
  vendor: string;
  platform?: string;
  capabilityKey: string;
  catalogCommandId: string;
  executionTemplateRef: string;
  connectorType: string;
  parameters: Record<string, unknown>;
  riskClass: string;
}

export function canonicalPayloadFromStoredPlan(plan: Pick<ActionPlan, "actionType" | "deviceId" | "parametersJson"> & Partial<Pick<ActionPlan, "riskLevel">>): CanonicalActionPlanPayload {
  const parameters = asObject(plan.parametersJson);
  const metadata = asObject(parameters.metadata);
  return {
    actionType: plan.actionType,
    targetDeviceId: plan.deviceId ?? "",
    vendor: String(metadata.resolvedVendor ?? metadata.vendor ?? parameters.vendor ?? "unknown"),
    ...(metadata.resolvedPlatform ? { platform: String(metadata.resolvedPlatform) } : {}),
    capabilityKey: String(metadata.capabilityKey ?? metadata.catalogCommandId ?? plan.actionType),
    catalogCommandId: String(metadata.catalogCommandId ?? `legacy:${plan.actionType}`),
    executionTemplateRef: String(metadata.executionTemplateRef ?? plan.actionType),
    connectorType: String(metadata.connectorType ?? "unresolved"),
    parameters: canonicalParameterValues(parameters),
    riskClass: String(plan.riskLevel ?? metadata.riskClass ?? "unknown")
  };
}

export function actionExecutionFingerprint(plan: Pick<ActionPlan, "actionType" | "deviceId" | "parametersJson"> & Partial<Pick<ActionPlan, "riskLevel">>) {
  return sha256(canonicalPayloadFromStoredPlan(plan));
}

export type ExecutionTrace = (stage: string, payload: Record<string, unknown>) => void;
export type ExecutionDependencies = { selectConnector?: typeof selectDeviceConnector; trace?: ExecutionTrace; intent?: "execute" | "preview" };

const CONNECTOR_TYPE_TO_NAME: Record<ExecutionTemplate["connectorType"], DeviceConnector["name"]> = {
  "linux-ssh": "linux_edge",
  "mikrotik-ssh": "mikrotik",
  "fortigate-ssh": "fortigate",
  "cisco-ios-xe-ssh": "cisco"
};

const CONNECTOR_TYPE_NAME_ALIASES: Record<ExecutionTemplate["connectorType"], string[]> = {
  "linux-ssh": ["linux_edge", "linux", "linux-ssh"],
  "mikrotik-ssh": ["mikrotik", "routeros", "mikrotik-ssh"],
  "fortigate-ssh": ["fortigate", "fortinet", "fortigate-ssh"],
  "cisco-ios-xe-ssh": ["cisco", "cisco-ios-xe-ssh", "cisco-iosxe-ssh"]
};

export type ExecutionPipelineResolution = {
  template: ExecutionTemplate;
  connector: DeviceConnector;
  registeredConnectorName: DeviceConnector["name"];
  validation: Awaited<ReturnType<typeof validateActionPlan>>;
  auditEvents: string[];
};

export function connectorErrorLike(error: unknown) {
  return error && typeof error === "object" && "code" in error && "statusCode" in error && "message" in error
    ? error as { code: string; statusCode: number; message: string }
    : null;
}

export function asEnum<T extends string>(value: unknown, enumObject: Record<string, T>, field: string): T {
  if (typeof value === "string" && Object.values(enumObject).includes(value as T)) return value as T;
  throw new Error(`${field} is invalid`);
}

export async function audit(plan: Pick<ActionPlan, "id" | "deviceId">, eventType: string, message: string, metadata?: unknown) {
  return prisma.actionAuditLog.create({
    data: {
      actionPlanId: plan.id,
      deviceId: plan.deviceId,
      eventType,
      message,
      metadataJson: toJson(metadata)
    }
  });
}

export async function audited(plan: Pick<ActionPlan, "id" | "deviceId">, auditEvents: string[], eventType: string, message: string, metadata?: unknown) {
  auditEvents.push(eventType);
  return audit(plan, eventType, message, metadata);
}

export function withExecutionMetadata(parametersJson: unknown, patch: Record<string, unknown>) {
  const parameters = asObject(parametersJson);
  return { ...parameters, metadata: { ...asObject(parameters.metadata), ...patch } };
}

export function parseExecutionResult(actionType: ActionType, stdout: string, commands: Array<{ template: string }> = [], verificationOverride?: unknown) {
  if (actionType.toString().startsWith("fortigate_")) {
    if (actionType === ActionType.fortigate_guided_vpn_setup) {
      const verification = asObject(verificationOverride);
      const checks = Array.isArray(verification.checks) ? verification.checks as Array<{ label?: string; ok?: boolean }> : [];
      const ok = verification.ok === true;
      return {
        status: ok ? "safe" : "critical",
        summaryFa: ok ? "Verification FortiGate VPN با موفقیت انجام شد." : "Verification FortiGate VPN شکست خورد.",
        verification,
        evidence: checks.map((check) => `${check.label ?? "verification"}: ${check.ok ? "ok" : "failed"}`),
        recommendationsFa: ok ? [] : ["موارد failed را در خروجی verification و تنظیمات FortiGate بررسی کنید."],
        commands: commands.map((command) => command.template),
        rawOutput: stdout,
        confidence: ok ? 0.95 : 0.5
      };
    }
    const lower = stdout.toLowerCase();
    const evidence = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
    let status: "safe" | "needs_review" | "critical" | "not_checked" | "not_supported" = evidence.length ? "safe" : "not_checked";
    let summaryFa = "خروجی FortiGate جمع‌آوری و برای بازبینی ساختاریافته شد.";
    const recommendationsFa: string[] = [];
    if (actionType === ActionType.fortigate_license_status) {
      const invalid = /license status\s*:\s*invalid|license.*invalid/.test(lower);
      status = invalid ? "needs_review" : /license status\s*:\s*(valid|licensed)/.test(lower) ? "safe" : "not_checked";
      summaryFa = invalid ? "لایسنس FortiGate معتبر نیست. برای محیط آزمایشگاهی قابل انتظار است، اما در محیط عملیاتی باید بررسی شود." : status === "safe" ? "وضعیت لایسنس و FortiGuard معتبر گزارش شد." : "وضعیت لایسنس از خروجی قابل تشخیص نبود.";
      if (invalid) recommendationsFa.push("در صورت استفاده عملیاتی، لایسنس VM را از FortiCloud فعال کنید.");
    } else if (actionType === ActionType.fortigate_route_dns_check) {
      const route = /0\.0\.0\.0\/0|\bs\*\b/.test(lower);
      const dns = /(?:primary|secondary)\s*:\s*(?:\d{1,3}\.){3}\d{1,3}/.test(lower);
      status = route && dns ? "safe" : route || dns ? "needs_review" : evidence.length ? "not_checked" : "not_checked";
      summaryFa = route && dns ? "مسیر پیش‌فرض و DNS روی FortiGate تنظیم شده‌اند." : "مسیر پیش‌فرض یا DNS به‌طور کامل قابل تأیید نیست.";
    } else if (actionType === ActionType.fortigate_show_interfaces) {
      const http = /set\s+allowaccess\s+[^\r\n]*\bhttp\b/.test(lower);
      const management = /set\s+allowaccess\s+[^\r\n]*\b(?:ssh|https)\b/.test(lower);
      status = http ? "critical" : management ? "needs_review" : /edit\s+"?[^\r\n"]+/.test(lower) ? "safe" : "not_checked";
      summaryFa = http ? "دسترسی مدیریتی HTTP روی یکی از اینترفیس‌ها فعال است." : management ? "دسترسی SSH/HTTPS روی اینترفیس مشاهده شد و محدوده مجاز آن باید بررسی شود." : status === "safe" ? "اینترفیس‌ها بدون دسترسی مدیریتی پرخطر شناسایی شدند." : "وضعیت اینترفیس‌ها قابل تشخیص نبود.";
    } else if (actionType === ActionType.fortigate_admin_users) {
      const admin = /set\s+accprofile\s+"?super_admin"?/.test(lower);
      const trusthost = /set\s+trusthost\d+/.test(lower);
      status = admin && !trusthost ? "needs_review" : admin ? "safe" : "not_checked";
      summaryFa = admin && !trusthost ? "حداقل یک مدیر سطح بالا بدون trusthost قابل تأیید مشاهده شد." : admin ? "کاربران مدیر و محدودیت trusthost جمع‌آوری شدند." : "کاربران مدیر از خروجی قابل تشخیص نبودند.";
    }
    return { status, summaryFa, evidence, recommendationsFa, commands: commands.map((command) => command.template), rawOutput: stdout, confidence: status === "not_checked" ? 0.35 : 0.9 };
  }
  if (actionType !== ActionType.linux_read_listening_ports && actionType !== ActionType.linux_list_open_ports) return null;
  return {
    listeningPorts: stdout.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).slice(0, 500).map((line) => {
      const fields = line.split(/\s+/); const protocol = fields[0] ?? "unknown";
      const endpointIndex = fields[1] === "LISTEN" ? 4 : 3; const endpoint = fields[endpointIndex] ?? ""; const match = endpoint.match(/^(.+):([^:]+)$/);
      return { protocol, localAddress: match?.[1] ?? endpoint, port: match?.[2] ?? null, process: fields.slice(endpointIndex + 2).join(" ") || null };
    })
  };
}

export class ActionExecutionError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 409, details?: Record<string, unknown>) {
    super(message);
    this.name = "ActionExecutionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function ensureControlledCatalogAction(plan: ActionPlan) {
  const previewMetadata = asObject(asObject(plan.parametersJson).metadata);
  const previewExecutionSupport = String(previewMetadata.executionSupport ?? asObject(plan.parametersJson).executionSupport ?? "");
  if (previewMetadata.source === "guided_action_wizard" && (previewMetadata.executable === false || previewExecutionSupport === "planned_or_partial")) {
    throw new ActionExecutionError("PREVIEW_ONLY_GUIDED_ACTION", "این اکشن هنوز اجرای واقعی کامل ندارد.", 409);
  }
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
  const customPlan = customPlanFromParameters(plan.parametersJson);
  if (plan.actionType === ActionType.custom_vendor_action && customPlan && previewMetadata.source === "ai_custom_connector_plan") {
    const selectedVendor = customVendorFromDevice(device);
    const expected = customTemplateForVendor(customPlan.vendor);
    if (!device) throw new ActionExecutionError("DEVICE_REQUIRED", "Custom connector ActionPlan requires a selected device.", 409);
    if (!selectedVendor || selectedVendor !== customPlan.vendor) throw new ActionExecutionError("CUSTOM_VENDOR_MISMATCH", "Custom command vendor does not match the selected device.", 409);
    if (customPlan.connectorType !== expected.connectorType || customPlan.executionTemplateRef !== expected.executionTemplateRef) throw new ActionExecutionError("CUSTOM_TEMPLATE_MISMATCH", "Custom command template does not match the selected vendor connector.", 409);
    if (previewExecutionSupport !== "connector") throw new ActionExecutionError("CUSTOM_CONNECTOR_REQUIRED", "Custom ActionPlan execution requires connector support.", 409);
    return { controlled: true, catalogCommandId: null, source: "ai_custom_connector_plan", executionTemplateRef: customPlan.executionTemplateRef, connectorType: customPlan.connectorType, vendor: customPlan.vendor };
  }
  const productCatalog = resolveCatalogAction(plan, device);
  if (productCatalog.matched) {
    if (!productCatalog.valid) throw new ActionExecutionError(productCatalog.code, productCatalog.messageFa, 409);
    return { controlled: true, catalogCommandId: productCatalog.item.id, source: "command_catalog", executionTemplateRef: productCatalog.item.executionTemplateRef, connectorType: productCatalog.item.connectorType, vendor: productCatalog.item.vendor };
  }
  const productEntries = COMMAND_CATALOG.filter((item) => item.actionType === plan.actionType);
  const legacyCatalogPlan = String(previewMetadata.catalogCommandId ?? "").startsWith("legacy:");
  if (!legacyCatalogPlan && productEntries.length > 0 && !productEntries.some((item) => item.supportState === "verified")) {
    throw new ActionExecutionError("CATALOG_COMMAND_NOT_VERIFIED", "This action is not verified for execution.", 409);
  }
  const legacyControlled = Boolean(getActionCatalogEntry(plan.actionType)) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === plan.actionType);
  if (!legacyControlled) throw new ActionExecutionError("ACTION_NOT_IN_CATALOG", "این عملیات در کاتالوگ کنترل‌شده پشتیبانی نمی‌شود.", 409);
  return { controlled: true, catalogCommandId: null, source: "legacy_catalog", executionTemplateRef: null, connectorType: null, vendor: vendorFromActionType(plan.actionType) ?? "unknown" };
}

function resolveExecutionTemplate(plan: ActionPlan, catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>) {
  const metadata = asObject(asObject(plan.parametersJson).metadata);
  const templateRef = String(catalogResolution.executionTemplateRef ?? metadata.executionTemplateRef ?? plan.actionType);
  const template = getExecutionTemplate(templateRef);
  if (!template) {
    throw new ActionExecutionError("EXECUTION_TEMPLATE_NOT_REGISTERED", "Execution requires a registered backend template.", 409, { templateRef, actionType: plan.actionType });
  }
  if (template.actionType !== String(plan.actionType)) {
    throw new ActionExecutionError("EXECUTION_TEMPLATE_ACTION_MISMATCH", "Registered execution template does not match the ActionPlan action type.", 409, { templateRef, templateActionType: template.actionType, actionType: plan.actionType });
  }
  return template;
}

function registeredConnectorNameFor(template: ExecutionTemplate) {
  return CONNECTOR_TYPE_TO_NAME[template.connectorType];
}

function connectorMatchesTemplate(connector: DeviceConnector, template: ExecutionTemplate) {
  return CONNECTOR_TYPE_NAME_ALIASES[template.connectorType].includes(String(connector.name));
}

function isRegisteredConnector(connector: DeviceConnector, template: ExecutionTemplate) {
  if (!connectorMatchesTemplate(connector, template)) return false;
  return getDeviceConnectors().some((registered) =>
    connectorMatchesTemplate(registered, template) &&
    registered.supportedActions.includes(template.actionType as ActionType)
  );
}

export async function resolveExecutionPipeline(input: {
  plan: ActionPlan;
  device: Device;
  connector: DeviceConnector;
  catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>;
  validation: Awaited<ReturnType<typeof validateActionPlan>>;
}) {
  const auditEvents: string[] = [];
  const template = resolveExecutionTemplate(input.plan, input.catalogResolution);
  const registeredConnectorName = registeredConnectorNameFor(template);
  if (!connectorMatchesTemplate(input.connector, template)) {
    await audited(input.plan, auditEvents, "execution_pipeline_blocked", "Execution refused because the resolved connector does not match the registered template connector.", { template, connector: input.connector.name, registeredConnectorName });
    throw new ActionExecutionError("CONNECTOR_TEMPLATE_MISMATCH", "Resolved connector does not match the registered execution template.", 409, { templateConnectorType: template.connectorType, connector: input.connector.name });
  }
  if (!isRegisteredConnector(input.connector, template)) {
    await audited(input.plan, auditEvents, "execution_pipeline_blocked", "Execution refused because no registered backend connector supports the template/action pair.", { template, connector: input.connector.name });
    throw new ActionExecutionError("CONNECTOR_NOT_REGISTERED", "Execution requires a registered backend connector.", 409, { connector: input.connector.name, templateRef: template.id });
  }
  if (!input.connector.supportedActions.includes(input.plan.actionType)) {
    await audited(input.plan, auditEvents, "execution_pipeline_blocked", "Execution refused because the connector does not support the ActionPlan action.", { template, connector: input.connector.name, actionType: input.plan.actionType });
    throw new ActionExecutionError("CONNECTOR_ACTION_UNSUPPORTED", "Connector does not support this action.");
  }
  if (!input.validation.valid) {
    await audited(input.plan, auditEvents, "execution_pipeline_blocked", "Execution refused by immediate PolicyGuard re-check.", { template, connector: input.connector.name, validation: input.validation });
    throw new ActionExecutionError("VALIDATION_BLOCKED", "PolicyGuard blocked execution.");
  }
  await audited(input.plan, auditEvents, "template_resolved", "Registered execution template resolved.", { template });
  await audited(input.plan, auditEvents, "connector_contract_resolved", "Registered backend connector resolved for the template.", { templateRef: template.id, connector: input.connector.name, connectorType: template.connectorType, registeredConnectorName });
  await audited(input.plan, auditEvents, "validation_resolved", "PolicyGuard validation resolved for the execution pipeline.", { valid: input.validation.valid, riskLevel: input.validation.riskLevel, normalizedParameters: input.validation.normalizedParameters });
  return { template, connector: input.connector, registeredConnectorName, validation: input.validation, auditEvents } satisfies ExecutionPipelineResolution;
}

function commandEvidence(result: ConnectorExecutionResult) {
  return result.commands.map((command) => ({
    template: command.template,
    exitCode: command.exitCode,
    stdoutLength: String(command.stdout ?? "").length,
    stderrLength: String(command.stderr ?? "").length
  }));
}

export function buildPostExecutionVerification(input: {
  plan: ActionPlan;
  pipeline: ExecutionPipelineResolution;
  result: ConnectorExecutionResult;
  executionSucceeded: boolean;
  connectorInvoked: boolean;
}) {
  const rollback = asObject(input.result.rollbackJson);
  const connectorVerification = asObject(rollback.verification);
  const connectorVerificationOk = Object.keys(connectorVerification).length > 0 ? connectorVerification.ok !== false : true;
  const exitCodes = input.result.commands.map((command) => command.exitCode).filter((code): code is number => typeof code === "number");
  const checks = [
    { key: "template", label: "Template", ok: input.pipeline.template.id.length > 0, value: input.pipeline.template.id },
    { key: "connector", label: "Connector", ok: connectorMatchesTemplate(input.pipeline.connector, input.pipeline.template), value: input.pipeline.connector.name },
    { key: "validation", label: "Validation", ok: input.pipeline.validation.valid === true, value: input.pipeline.validation.riskLevel },
    { key: "execution", label: "Execution", ok: input.result.executed === true && input.connectorInvoked, value: input.result.commands.length },
    { key: "verification", label: "Verification", ok: input.executionSucceeded && connectorVerificationOk, value: connectorVerification.summary ?? rollback.outcome ?? null },
    { key: "audit", label: "Audit", ok: input.pipeline.auditEvents.length > 0, value: input.pipeline.auditEvents }
  ];
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    status: ok ? "verified" : "failed",
    template: input.pipeline.template,
    connector: {
      name: input.pipeline.connector.name,
      connectorType: input.pipeline.template.connectorType,
      registeredConnectorName: input.pipeline.registeredConnectorName
    },
    validation: {
      valid: input.pipeline.validation.valid,
      riskLevel: input.pipeline.validation.riskLevel
    },
    execution: {
      executed: input.result.executed,
      connectorInvoked: input.connectorInvoked,
      commandCount: input.result.commands.length,
      exitCodes,
      commands: commandEvidence(input.result)
    },
    connectorVerification,
    checks,
    rawCommandExecution: false
  };
}

export function planRevision(metadata: Record<string, unknown>) {
  const revision = Number(metadata.planRevision ?? 1);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

export async function resolveActionPlanRuntime(plan: ActionPlan) {
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
  const resolution = await ensureControlledCatalogAction(plan);
  const connector = device ? selectDeviceConnector(device) : null;
  const parameters = withPlanIdentity(
    plan.actionType,
    normalizeParameters(plan.actionType, asObject(plan.parametersJson)),
    plan.deviceId,
    (resolution.vendor === "linux" ? "linux_edge" : resolution.vendor) as ActionVendor
  ) as Record<string, unknown>;
  const metadata = asObject(parameters.metadata);
  const normalizedParams = canonicalParameterValues(parameters);
  const resolvedMetadata = {
    ...metadata,
    planRevision: planRevision(metadata),
    planState: metadata.planState ?? "draft",
    resolvedVendor: resolution.vendor,
    resolvedPlatform: String(asObject(device?.capabilities).platform ?? device?.type ?? "unknown"),
    capabilityKey: resolution.catalogCommandId ?? String(plan.actionType),
    catalogCommandId: resolution.catalogCommandId ?? `legacy:${plan.actionType}`,
    executionTemplateRef: resolution.executionTemplateRef ?? String(plan.actionType),
    connectorType: resolution.connectorType ?? connector?.name ?? "unresolved",
    normalizedParams,
    riskClass: plan.riskLevel
  };
  const nextParameters = { ...parameters, metadata: resolvedMetadata };
  if (stableJson(nextParameters) === stableJson(plan.parametersJson)) return plan;
  return prisma.actionPlan.update({ where: { id: plan.id }, data: { parametersJson: toJson(nextParameters) } });
}

export function previewRevisionMetadata(plan: ActionPlan, dryRun: unknown) {
  const parameters = asObject(plan.parametersJson);
  const metadata = asObject(parameters.metadata);
  const canonicalPayload = canonicalPayloadFromStoredPlan(plan);
  const canonicalPayloadHash = sha256(canonicalPayload);
  const previewHash = sha256({ canonicalPayload, dryRun });
  return {
    planRevision: planRevision(metadata),
    planState: "preview_ready",
    canonicalParameters: canonicalPayload.parameters,
    canonicalParametersHash: sha256(canonicalPayload.parameters),
    canonicalPayload,
    canonicalPayloadHash,
    previewHash,
    previewFingerprint: canonicalPayloadHash,
    idempotencyKey: sha256({
      deviceId: canonicalPayload.targetDeviceId,
      capabilityKey: canonicalPayload.capabilityKey,
      parameters: canonicalPayload.parameters,
      desiredState: plan.actionType === ActionType.close_port ? "port_closed" : plan.actionType
    })
  };
}

export async function approveCurrentRevisionForExecution(plan: ActionPlan, input: Record<string, unknown>) {
  const parameters = asObject(plan.parametersJson);
  const metadata = asObject(parameters.metadata);
  const revision = planRevision(metadata);
  const approvedAt = new Date().toISOString();
  const canonicalPayloadHash = String(metadata.canonicalPayloadHash ?? actionExecutionFingerprint(plan));
  const previewHash = String(metadata.previewHash ?? "");
  const approval = {
    decision: "approved",
    approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : undefined,
    reason: typeof input.reason === "string" ? input.reason : undefined,
    planRevision: revision,
    canonicalPayloadHash,
    previewHash,
    approvedAt
  };
  return prisma.actionPlan.update({
    where: { id: plan.id },
    data: {
      approvalJson: toJson(approval),
      parametersJson: toJson(withExecutionMetadata(parameters, {
        planState: "approved",
        approvedRevision: revision,
        approvedCanonicalPayloadHash: canonicalPayloadHash,
        approvedPreviewHash: previewHash,
        approvedCanonicalPayload: metadata.canonicalPayload,
        approvedAt
      }))
    }
  });
}


export class QuickExecuteConfirmationRequiredError extends ActionExecutionError {
  plan: unknown;

  constructor(message: string, plan: unknown) {
    super("QUICK_EXECUTE_CONFIRMATION_REQUIRED", message, 428);
    this.name = "QuickExecuteConfirmationRequiredError";
    this.plan = plan;
  }
}

export function approvalPreconditionError(plan: Pick<ActionPlan, "actionType" | "status" | "dryRunJson">) {
  if (plan.status !== ActionPlanStatus.dry_run_ready || !plan.dryRunJson) {
    return new ActionExecutionError("DRY_RUN_REQUIRED", "ActionPlan must have a successful dry-run before approval.");
  }
  return null;
}

export function executionApprovalError(plan: Pick<ActionPlan, "actionType" | "status"> & { parametersJson?: unknown }, mode: ActionExecutionMode = env.actionExecutionMode) {
  const catalog = getActionCatalogEntry(plan.actionType);
  const metadata = asObject(asObject(plan.parametersJson).metadata);
  const executionSupport = String(metadata.executionSupport ?? asObject(plan.parametersJson).executionSupport ?? "");
  if (metadata.source === "guided_action_wizard" && (metadata.executable === false || executionSupport === "planned_or_partial")) {
    return new ActionExecutionError("PREVIEW_ONLY_GUIDED_ACTION", "این اکشن هنوز اجرای واقعی کامل ندارد.");
  }
  const productCatalogControlled = ["command_catalog", "command_search_ai_fallback", "ai_mapped_template"].includes(String(metadata.source)) && metadata.supportState === "verified" && metadata.executionSupport === "connector" && typeof metadata.executionTemplateRef === "string";
  const customConnectorControlled = plan.actionType === ActionType.custom_vendor_action && metadata.source === "ai_custom_connector_plan" && metadata.supportState === "verified" && metadata.executionSupport === "connector" && typeof metadata.executionTemplateRef === "string";
  const controlled = customConnectorControlled || productCatalogControlled || Boolean(catalog) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === plan.actionType);
  if ((mode === "direct_controlled" || mode === "quick_controlled") && controlled) return null;
  const readOnly = catalog?.requiresApproval === false || (isMikroTikAction(plan.actionType) && plan.actionType === ActionType.mikrotik_read_firewall_summary);
  if (plan.status !== ActionPlanStatus.approved && !(readOnly && plan.status === ActionPlanStatus.dry_run_ready)) {
    return new ActionExecutionError("ACTION_NOT_APPROVED", "ActionPlan must be approved before execution.");
  }
  return null;
}

export function requiresManualApprovalWorkflow(actionType: ActionType) {
  return actionType === ActionType.mikrotik_change_service_port;
}

export function approvalRequirements(riskLevel: AiRiskLevel, mode: ActionExecutionMode = env.actionExecutionMode) {
  const direct = mode === "direct_controlled" || mode === "quick_controlled";
  return {
    typedApprove: !direct && (riskLevel === AiRiskLevel.critical || (mode === "safe" && riskLevel === AiRiskLevel.high)),
    breakGlass: !direct && riskLevel === AiRiskLevel.critical,
    reason: !direct && riskLevel === AiRiskLevel.critical,
    approveAndExecute: direct || riskLevel !== AiRiskLevel.critical,
    executionMode: mode
  };
}

export function approvalInputError(riskLevel: AiRiskLevel, input: Record<string, unknown>, mode: ActionExecutionMode = env.actionExecutionMode) {
  const requirements = approvalRequirements(riskLevel, mode);
  if (requirements.typedApprove && String(input.approvalConfirmation ?? "").trim() !== "APPROVE") {
    return riskLevel === AiRiskLevel.critical
      ? "Type APPROVE before approving this critical action."
      : "Safe mode requires APPROVE for this high-risk action.";
  }
  if (requirements.breakGlass && input.breakGlass !== true) return "Critical actions require break-glass mode.";
  if (requirements.reason && !String(input.reason ?? "").trim()) return "Critical actions require a reason.";
  return null;
}

export function includeRelations() {
  return {
    device: { select: { id: true, name: true, vendor: true, type: true, host: true, protocol: true } },
    aiIntent: { select: { id: true, intentType: true, status: true, riskLevel: true } }
  } satisfies Prisma.ActionPlanInclude;
}

export function validationDetails(input: {
  plan: ActionPlan;
  validation?: Awaited<ReturnType<typeof validateActionPlan>>;
  stage: string;
  compilerError?: string;
  policyGuardError?: string;
  exactReason?: string;
}) {
  const parameters = asObject(input.plan.parametersJson);
  const validation = input.validation;
  const device = validation?.device;
  const errors = validation?.errors ?? [];
  return {
    valid: validation?.valid ?? false,
    stage: input.stage,
    actionType: input.plan.actionType,
    vendor: vendorFromDevice(device) ?? vendorFromActionType(input.plan.actionType) ?? "unknown",
    deviceId: input.plan.deviceId,
    device: device ? {
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      type: device.type,
      protocol: device.protocol,
      hasCredential: Boolean(device.credentialId || device.credentialRef)
    } : null,
    parameters,
    missingFields: validation?.missingFields ?? [],
    errors,
    fieldErrors: validation?.fieldErrors ?? [],
    warnings: validation?.warnings ?? [],
    normalizedParameters: validation?.normalizedParameters ?? {},
    compilerError: input.compilerError ?? validation?.compilerError ?? null,
    policyGuardError: input.policyGuardError ?? validation?.policyGuardError ?? (errors.length > 0 ? errors.join(" ") : null),
    exactReason: input.exactReason ?? validation?.exactReason ?? input.compilerError ?? input.policyGuardError ?? errors[0] ?? null,
    executionMode: env.actionExecutionMode,
    policyGuard: validation ? {
      requiresApproval: validation.requiresApproval,
      riskLevel: validation.riskLevel,
      rollbackJson: validation.rollbackJson
    } : null
  };
}

export function userValidationMessage(errors: string[], missingFields: string[]) {
  const text = errors.join(" ");
  if (missingFields.includes("trustedSourceCidr") || /Allowed source is required/i.test(text)) return "Allowed source is required for SSH management changes.";
  if (/credential/i.test(text)) return "Device credential is missing. Add credential in Device Registry.";
  if (/device/i.test(text)) return "Device is missing or unavailable.";
  if (/not supported|not in .*catalog|unsupported/i.test(text)) return "This action is not supported in the command catalog yet.";
  if (/port|newPort/i.test(text)) return "Port is blocked by policy or has an invalid value.";
  return "This action cannot execute with its current values.";
}
