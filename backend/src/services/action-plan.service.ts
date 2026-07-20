import {
  ActionPlanSource,
  ActionPlanStatus,
  ActionType,
  AiRiskLevel,
  ApprovalDecision,
  DeviceProtocol,
  DeviceType,
  type ActionPlan,
  type Device,
  Prisma
} from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { ConnectorError } from "../connectors/linux-ssh.connector.js";
import { isMikroTikAction } from "../actions/mikrotik-action-catalog.js";
import { getDeviceConnectors, selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { buildDryRun } from "./dry-run.service.js";
import { validateActionPlan } from "./policy-guard.service.js";
import { getActionCatalogEntry } from "../actions/action-catalog.js";
import { normalizeActionType as normalizeCatalogActionType, normalizeIntent } from "../actions/intent-normalizer.js";
import { CANONICAL_INTENT_FIELDS } from "../actions/intent-normalizer.js";
import { normalizeVendor } from "./ai-normalization.js";
import { env, type ActionExecutionMode } from "../config/env.js";
import { preflightActionPlan } from "./action-preflight.service.js";
import { VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { resolveCatalogAction } from "../commands/catalog/catalog-action-resolver.js";
import { COMMAND_CATALOG, COMMAND_CATALOG_VERSION } from "../commands/catalog/index.js";
import { buildDailyCheckResult } from "../daily-check/daily-check-engine.js";
import { buildFortiGateDailyCheck, parseFortiGateReadOnlyResult } from "../fortigate/readonly-result-parser.js";
import { normalizeFortiGateGuidedVpnParameters } from "./fortigate-guided-vpn.schema.js";
import { getExecutionTemplate, type ExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import type { ConnectorExecutionResult, DeviceConnector } from "../connectors/types.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ActionVendor = "mikrotik" | "fortigate" | "linux_edge" | "pfsense" | "cisco" | "juniper" | "paloalto" | "windows" | "docker" | "kubernetes" | "generic" | "unknown" | undefined;

function vendorFromActionType(actionType: ActionType | string): ActionVendor {
  if (String(actionType).startsWith("mikrotik_")) return "mikrotik";
  if (String(actionType).startsWith("fortigate_")) return "fortigate";
  if (String(actionType).startsWith("linux_")) return "linux_edge";
  return undefined;
}

function vendorFromDevice(device: Pick<Device, "type" | "vendor"> | null | undefined): ActionVendor {
  const vendor = String(device?.vendor ?? "").toLowerCase();
  if (device?.type === DeviceType.mikrotik || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device?.type === DeviceType.fortigate || vendor.includes("forti")) return "fortigate";
  if (device?.type === DeviceType.linux_edge || vendor.includes("linux")) return "linux_edge";
  if (vendor.includes("cisco")) return "cisco";
  return undefined;
}

function vendorFromInput(input: Record<string, unknown>, parameters: Record<string, unknown>): ActionVendor {
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

function actionTypeFromInput(value: unknown, vendor: ActionVendor): ActionType {
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
  if (typeof parameters.source === "string" && ["command_catalog", "command_search_ai_fallback", "ai_mapped_template", "guided_action_wizard"].includes(parameters.source) && canonical.sourceIp === parameters.source) {
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

async function findOnlyCompatibleDevice(vendor: ActionVendor) {
  if (!vendor || !["mikrotik", "fortigate", "linux_edge"].includes(vendor)) return undefined;
  const where = vendor === "mikrotik"
    ? { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.mikrotik }, { vendor: { contains: "mikrotik", mode: "insensitive" as const } }, { vendor: { contains: "routeros", mode: "insensitive" as const } }] }
    : vendor === "fortigate"
      ? { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.fortigate }, { vendor: { contains: "forti", mode: "insensitive" as const } }] }
      : { protocol: DeviceProtocol.ssh, OR: [{ type: DeviceType.linux_edge }, { vendor: { contains: "linux", mode: "insensitive" as const } }] };
  const devices = await prisma.device.findMany({ where, select: { id: true }, take: 2 });
  return devices.length === 1 ? devices[0].id : undefined;
}

async function prepareActionPlan(plan: ActionPlan) {
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

function storedNormalizedParameters(plan: ActionPlan, normalized: Record<string, unknown>) {
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

function executionParametersOnly(parameters: Record<string, unknown>) {
  const metadata = asObject(parameters.metadata);
  const resolverParams = asObject(metadata.normalizedParams ?? parameters.normalizedParams);
  const storedParams = Object.fromEntries(Object.entries(parameters).filter(([key]) => !NON_EXECUTION_PARAMETER_FIELDS.has(key)));
  return { ...resolverParams, ...storedParams };
}

const EXECUTION_ONLY_FIELDS = new Set(["breakGlass", "executeConfirmation", "deviceNameConfirmation", "reason", "intent"]);

function stableJson(value: unknown) {
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

function canonicalParameterValues(parameters: Record<string, unknown>) {
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

function canonicalPayloadFromStoredPlan(plan: Pick<ActionPlan, "actionType" | "deviceId" | "parametersJson"> & Partial<Pick<ActionPlan, "riskLevel">>): CanonicalActionPlanPayload {
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

type ExecutionTrace = (stage: string, payload: Record<string, unknown>) => void;
type ExecutionDependencies = { selectConnector?: typeof selectDeviceConnector; trace?: ExecutionTrace; intent?: "execute" | "preview" };

const CONNECTOR_TYPE_TO_NAME: Record<ExecutionTemplate["connectorType"], DeviceConnector["name"]> = {
  "linux-ssh": "linux_edge",
  "mikrotik-ssh": "mikrotik",
  "fortigate-ssh": "fortigate",
  "cisco-ios-xe-ssh": "cisco"
};

type ExecutionPipelineResolution = {
  template: ExecutionTemplate;
  connector: DeviceConnector;
  registeredConnectorName: DeviceConnector["name"];
  validation: Awaited<ReturnType<typeof validateActionPlan>>;
  auditEvents: string[];
};

function connectorErrorLike(error: unknown) {
  return error && typeof error === "object" && "code" in error && "statusCode" in error && "message" in error
    ? error as { code: string; statusCode: number; message: string }
    : null;
}

function asEnum<T extends string>(value: unknown, enumObject: Record<string, T>, field: string): T {
  if (typeof value === "string" && Object.values(enumObject).includes(value as T)) return value as T;
  throw new Error(`${field} is invalid`);
}

async function audit(plan: Pick<ActionPlan, "id" | "deviceId">, eventType: string, message: string, metadata?: unknown) {
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

async function audited(plan: Pick<ActionPlan, "id" | "deviceId">, auditEvents: string[], eventType: string, message: string, metadata?: unknown) {
  auditEvents.push(eventType);
  return audit(plan, eventType, message, metadata);
}

function withExecutionMetadata(parametersJson: unknown, patch: Record<string, unknown>) {
  const parameters = asObject(parametersJson);
  return { ...parameters, metadata: { ...asObject(parameters.metadata), ...patch } };
}

function parseExecutionResult(actionType: ActionType, stdout: string, commands: Array<{ template: string }> = [], verificationOverride?: unknown) {
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

async function ensureControlledCatalogAction(plan: ActionPlan) {
  const previewMetadata = asObject(asObject(plan.parametersJson).metadata);
  const previewExecutionSupport = String(previewMetadata.executionSupport ?? asObject(plan.parametersJson).executionSupport ?? "");
  if (previewMetadata.source === "guided_action_wizard" && (previewMetadata.executable === false || previewExecutionSupport === "planned_or_partial")) {
    throw new ActionExecutionError("PREVIEW_ONLY_GUIDED_ACTION", "این اکشن هنوز اجرای واقعی کامل ندارد.", 409);
  }
  const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
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
  return connector.name === registeredConnectorNameFor(template);
}

function isRegisteredConnector(connector: DeviceConnector, template: ExecutionTemplate) {
  return getDeviceConnectors().some((registered) =>
    registered.name === connector.name &&
    connectorMatchesTemplate(registered, template) &&
    registered.supportedActions.includes(template.actionType as ActionType)
  );
}

async function resolveExecutionPipeline(input: {
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

function buildPostExecutionVerification(input: {
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

function planRevision(metadata: Record<string, unknown>) {
  const revision = Number(metadata.planRevision ?? 1);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

async function resolveActionPlanRuntime(plan: ActionPlan) {
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

function previewRevisionMetadata(plan: ActionPlan, dryRun: unknown) {
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

async function approveCurrentRevisionForExecution(plan: ActionPlan, input: Record<string, unknown>) {
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

async function regenerateLatestRevisionForExecution(plan: ActionPlan, input: Record<string, unknown>, changedFields: string[]) {
  const parameters = asObject(plan.parametersJson);
  const metadata = asObject(parameters.metadata);
  const revision = planRevision(metadata);
  const revisionHistory = Array.isArray(metadata.revisionHistory) ? metadata.revisionHistory : [];
  const {
    canonicalParameters: _canonicalParameters,
    canonicalParametersHash: _canonicalParametersHash,
    canonicalPayload: _canonicalPayload,
    canonicalPayloadHash: _canonicalPayloadHash,
    previewHash: _previewHash,
    previewFingerprint: _previewFingerprint,
    approvedRevision: _approvedRevision,
    approvedCanonicalPayloadHash: _approvedCanonicalPayloadHash,
    approvedPreviewHash: _approvedPreviewHash,
    approvedCanonicalPayload: _approvedCanonicalPayload,
    approvedAt: _approvedAt,
    executingRevision: _executingRevision,
    ...preservedMetadata
  } = metadata;
  const nextRevision = revision + 1;
  const revised = await prisma.actionPlan.update({
    where: { id: plan.id },
    data: {
      status: ActionPlanStatus.proposed,
      parametersJson: toJson({
        ...parameters,
        metadata: {
          ...preservedMetadata,
          planRevision: nextRevision,
          planState: "draft",
          previewGenerated: false,
          previewStale: false,
          staleReason: null,
          lastExecutionStatus: "revision_regenerated",
          revisionHistory: [...revisionHistory, {
            revision,
            state: metadata.planState ?? plan.status,
            canonicalPayloadHash: metadata.canonicalPayloadHash ?? null,
            previewHash: metadata.previewHash ?? null,
            approvedRevision: metadata.approvedRevision ?? null,
          }].slice(-20),
        },
      }),
      validationJson: Prisma.JsonNull,
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      rollbackJson: Prisma.JsonNull,
    },
    include: includeRelations(),
  });
  await audit(revised, "action_revision_regenerated", "Stale ActionPlan inputs were promoted to a new revision before execution.", { previousRevision: revision, currentRevision: nextRevision, changedFields });

  const validated = await validateAndStoreActionPlan(plan.id);
  if (!validated || validated.status === ActionPlanStatus.validation_failed || validated.status === ActionPlanStatus.proposed) {
    throw new ActionExecutionError("REVISION_REGENERATION_FAILED", "The newest ActionPlan revision did not pass validation.", 422, { currentRevision: nextRevision, changedFields });
  }
  const previewed = await dryRunActionPlan(plan.id);
  if (!previewed || previewed.status !== ActionPlanStatus.dry_run_ready || !previewed.dryRunJson) {
    throw new ActionExecutionError("REVISION_PREVIEW_FAILED", "The newest ActionPlan revision could not produce an executable preview.", 422, { currentRevision: nextRevision, changedFields });
  }
  const approved = await approveCurrentRevisionForExecution(previewed, input);
  await audit(approved, "action_revision_ready", "Newest ActionPlan revision was previewed and approved for the current Execute request.", { currentRevision: nextRevision, changedFields });
  return approved;
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
  const controlled = productCatalogControlled || Boolean(catalog) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === plan.actionType);
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

function includeRelations() {
  return {
    device: { select: { id: true, name: true, vendor: true, type: true, host: true, protocol: true } },
    aiIntent: { select: { id: true, intentType: true, status: true, riskLevel: true } }
  } satisfies Prisma.ActionPlanInclude;
}

function validationDetails(input: {
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

function userValidationMessage(errors: string[], missingFields: string[]) {
  const text = errors.join(" ");
  if (missingFields.includes("trustedSourceCidr") || /Allowed source is required/i.test(text)) return "Allowed source is required for SSH management changes.";
  if (/credential/i.test(text)) return "Device credential is missing. Add credential in Device Registry.";
  if (/device/i.test(text)) return "Device is missing or unavailable.";
  if (/not supported|not in .*catalog|unsupported/i.test(text)) return "This action is not supported in the command catalog yet.";
  if (/port|newPort/i.test(text)) return "Port is blocked by policy or has an invalid value.";
  return "This action cannot execute with its current values.";
}

export async function proposeActionPlan(input: Record<string, unknown>) {
  let actionType: ActionType | undefined;
  let deviceId = typeof input.deviceId === "string" ? input.deviceId : undefined;
  let parameters = asObject(input.parametersJson);
  let riskLevel = typeof input.riskLevel === "string" && Object.values(AiRiskLevel).includes(input.riskLevel as AiRiskLevel)
    ? input.riskLevel as AiRiskLevel
    : AiRiskLevel.medium;
  const aiIntentId = typeof input.aiIntentId === "string" ? input.aiIntentId : undefined;
  let source = input.source ? asEnum(input.source, ActionPlanSource, "source") : ActionPlanSource.user;

  if (aiIntentId) {
    const intent = await prisma.aiActionIntent.findUnique({ where: { id: aiIntentId } });
    if (!intent) throw new Error("AiActionIntent not found");
    actionType = asEnum(intent.intentType, ActionType, "aiIntent.intentType");
    deviceId = intent.deviceId ?? deviceId;
    parameters = asObject(intent.parametersJson);
    riskLevel = intent.riskLevel;
    source = ActionPlanSource.ai;
  } else {
    actionType = actionTypeFromInput(input.actionType, vendorFromInput(input, parameters));
  }

  const hintedDevice = deviceId ? await prisma.device.findUnique({ where: { id: deviceId } }) : null;
  const vendor = vendorFromDevice(hintedDevice) ?? vendorFromInput(input, parameters) ?? vendorFromActionType(actionType);
  actionType = normalizeActionTypeForVendor(actionType, vendor);
  deviceId = deviceId ?? await findOnlyCompatibleDevice(vendor);
  parameters = withPlanIdentity(actionType, normalizeParameters(actionType, parameters), deviceId, vendor);
  const catalogVendor = vendor === "mikrotik" || vendor === "fortigate" ? vendor : null;
  const catalog = getActionCatalogEntry(actionType, catalogVendor);
  if (catalog) riskLevel = catalog.riskLevel;
  const productVendor = vendor === "linux_edge" ? "linux" : vendor;
  const productMatches = COMMAND_CATALOG.filter((item) => item.supportState === "verified" && item.executionSupport === "connector" && item.actionType === actionType && item.vendor === productVendor);
  if (productMatches.length === 1 && asObject(parameters.metadata).source !== "command_catalog") {
    const item = productMatches[0];
    const normalizedParams = executionParametersOnly(parameters);
    const existingSource = String(asObject(parameters.metadata).source ?? parameters.source ?? "");
    const mappedSource = ["command_search_ai_fallback", "ai_mapped_template"].includes(existingSource) ? existingSource : "command_catalog";
    parameters = {
      ...parameters,
      executionSupport: "connector",
      metadata: {
        ...asObject(parameters.metadata), source: mappedSource, catalogCommandId: item.id, catalogVersion: COMMAND_CATALOG_VERSION,
        catalogTitleFa: item.titleFa, vendor: item.vendor, actionType: item.actionType, implementationState: "implemented",
        executionSupport: "connector", supportState: item.supportState, supportReasonKey: item.supportReasonKey, executable: true, executionTemplateRef: item.executionTemplateRef, connectorType: item.connectorType,
        normalizedParams, requiredParamsSatisfied: item.requiredParams.every((field) => normalizedParams[field.key] !== undefined && normalizedParams[field.key] !== ""),
        previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started"
      }
    };
    riskLevel = item.riskLevel as AiRiskLevel;
  }

  if ((vendor === "mikrotik" || vendor === "fortigate") && !deviceId) {
    const compatibleCount = await prisma.device.count({
      where: vendor === "mikrotik"
        ? { OR: [{ type: DeviceType.mikrotik }, { vendor: { contains: "mikrotik", mode: "insensitive" } }, { vendor: { contains: "routeros", mode: "insensitive" } }] }
        : { OR: [{ type: DeviceType.fortigate }, { vendor: { contains: "forti", mode: "insensitive" } }] }
    });
    throw new ActionExecutionError(
      compatibleCount > 0 ? "DEVICE_SELECTION_REQUIRED" : "DEVICE_NOT_FOUND",
      compatibleCount > 0 ? "Choose a target device before creating the ActionPlan." : "No device found. Add one in Device Registry.",
      409
    );
  }

  if (actionType === ActionType.close_port && deviceId) {
    const desiredParameters = canonicalParameterValues(parameters);
    const candidates = await prisma.actionPlan.findMany({
      where: { deviceId, actionType, status: ActionPlanStatus.succeeded },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: includeRelations()
    });
    const verified = candidates.find((candidate) => {
      const metadata = asObject(asObject(candidate.parametersJson).metadata);
      const result = asObject(candidate.resultJson);
      return metadata.connectorInvoked === true && result.executed === true && ["completed", "verified_no_change", "already_compliant"].includes(String(result.outcome)) && stableJson(canonicalParameterValues(asObject(candidate.parametersJson))) === stableJson(desiredParameters);
    });
    if (verified) {
      await audit(verified, "idempotent_request_reused", "Repeated desired-state request reused a connector-verified ActionPlan.", { idempotencyKey: asObject(asObject(verified.parametersJson).metadata).idempotencyKey, outcome: asObject(verified.resultJson).outcome, connectorInvoked: true });
      return verified;
    }
  }

  const plan = await prisma.actionPlan.create({
    data: {
      source,
      requestedBy: typeof input.requestedBy === "string" ? input.requestedBy : undefined,
      deviceId,
      aiIntentId,
      actionType,
      status: ActionPlanStatus.proposed,
      riskLevel,
      parametersJson: toJson(parameters)
    },
    include: includeRelations()
  });

  await audit(plan, "action.proposed", "Action plan proposed.", { source, aiIntentId, actionType });
  return plan;
}

export async function listActionPlans() {
  return {
    actions: await prisma.actionPlan.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: includeRelations()
    })
  };
}

export async function getActionPlan(id: string) {
  return prisma.actionPlan.findUnique({
    where: { id },
    include: {
      ...includeRelations(),
      approvals: { orderBy: { createdAt: "desc" } }
    }
  });
}

export async function validateAndStoreActionPlan(id: string) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);

  const validation = await validateActionPlan(plan);
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: validation.valid ? ActionPlanStatus.awaiting_approval : ActionPlanStatus.validation_failed,
      riskLevel: validation.riskLevel,
      parametersJson: toJson(validation.valid || Object.keys(validation.normalizedParameters).length > 0 ? storedNormalizedParameters(plan, validation.normalizedParameters) : asObject(plan.parametersJson)),
      validationJson: toJson(validationDetails({ plan, validation, stage: "policy_guard" })),
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      rollbackJson: toJson(validation.rollbackJson)
    },
    include: includeRelations()
  });

  await audit(updated, validation.valid ? "action.validated" : "action.validation_failed", validation.valid ? "Action plan passed policy validation." : "Action plan failed policy validation.", validation);
  return updated;
}

export async function correctAndRevalidateActionPlan(id: string, input: Record<string, unknown>) {
  const existing = await prisma.actionPlan.findUnique({ where: { id } });
  if (!existing) return null;
  if (new Set<ActionPlanStatus>([ActionPlanStatus.executing, ActionPlanStatus.succeeded, ActionPlanStatus.rolled_back]).has(existing.status)) {
    throw new ActionExecutionError("ACTION_NOT_EDITABLE", "Completed or executing ActionPlans cannot be edited.");
  }
  const corrections = asObject(input.parametersJson ?? input.fields ?? input);
  const currentParameters = asObject(existing.parametersJson);
  const correctedParameters = mergeCorrectedParameters(existing.actionType, currentParameters, corrections);
  const currentMetadata = asObject(currentParameters.metadata);
  const changedFields = Object.keys(corrections).filter((field) => stableJson(currentParameters[field]) !== stableJson(correctedParameters[field]));
  if (changedFields.length === 0) return dryRunActionPlan(id);
  const currentRevision = planRevision(currentMetadata);
  const revisionHistory = Array.isArray(currentMetadata.revisionHistory) ? currentMetadata.revisionHistory : [];
  const {
    canonicalParameters: _canonicalParameters,
    canonicalParametersHash: _canonicalParametersHash,
    canonicalPayload: _canonicalPayload,
    canonicalPayloadHash: _canonicalPayloadHash,
    previewHash: _previewHash,
    previewFingerprint: _previewFingerprint,
    ...preservedMetadata
  } = currentMetadata;
  const parametersJson = {
    ...correctedParameters,
    metadata: {
      ...preservedMetadata,
      planRevision: currentRevision + 1,
      planState: "draft",
      previewGenerated: false,
      previewStale: false,
      staleReason: null,
      revisionHistory: [...revisionHistory, {
        revision: currentRevision,
        state: currentMetadata.planState ?? "draft",
        canonicalPayloadHash: currentMetadata.canonicalPayloadHash ?? null,
        previewHash: currentMetadata.previewHash ?? null
      }].slice(-20)
    }
  };
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      parametersJson: toJson(parametersJson),
      status: ActionPlanStatus.proposed,
      validationJson: Prisma.JsonNull,
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      rollbackJson: Prisma.JsonNull
    }
  });
  await audit(updated, "action.parameters_corrected", "Canonical ActionPlan fields were corrected and a new draft revision was created.", { fields: changedFields, previousRevision: currentRevision, currentRevision: currentRevision + 1 });
  const validated = await validateAndStoreActionPlan(id);
  if (validated?.status === ActionPlanStatus.awaiting_approval) return dryRunActionPlan(id);
  return validated;
}

export async function dryRunActionPlan(id: string) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);
  const initialMetadata = asObject(asObject(plan.parametersJson).metadata);
  if (["command_catalog", "command_search_ai_fallback", "ai_mapped_template", "guided_action_wizard"].includes(String(initialMetadata.source)) && initialMetadata.supportState !== "verified") {
    const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
    const resolved = resolveCatalogAction(plan, device);
    if (resolved.matched && resolved.valid) {
      plan = await prisma.actionPlan.update({
        where: { id },
        data: { parametersJson: toJson(withExecutionMetadata(plan.parametersJson, { supportState: "verified", supportReasonKey: resolved.item.supportReasonKey, executionTemplateRef: resolved.item.executionTemplateRef, connectorType: resolved.item.connectorType, executable: true })) }
      });
    } else {
    const blocked = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        validationJson: toJson({
          valid: false,
          code: "CATALOG_COMMAND_NOT_VERIFIED",
          messageKey: initialMetadata.supportReasonKey ?? "support.reason.missingRequirements",
          supportState: initialMetadata.supportState ?? "preview_only",
          userMessage: "This ActionPlan is available for review only and cannot generate an executable command preview."
        }),
        dryRunJson: Prisma.JsonNull
      },
      include: includeRelations()
    });
    await audit(blocked, "action.command_plan_blocked", "Command preview refused because support state is not verified.", { code: "CATALOG_COMMAND_NOT_VERIFIED", supportState: initialMetadata.supportState });
    return blocked;
    }
  }

  plan = await resolveActionPlanRuntime(plan);

  let preflight: Awaited<ReturnType<typeof preflightActionPlan>> | null = null;
  if (plan.deviceId) {
    const device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
    if (device) {
      preflight = await preflightActionPlan(plan, device);
      if (preflight.attempted) {
        plan = await prisma.actionPlan.update({
          where: { id },
          data: { parametersJson: toJson(preflight.parameters) }
        });
        await audit(plan, "action.preflight_completed", "Read-only action preflight completed.", {
          missingFields: preflight.missingFields ?? [],
          suggestions: preflight.suggestions ?? {},
          discoveryError: preflight.discoveryError
        });
        if (preflight.autoResolved) {
          await audit(plan, "parameters_auto_resolved", "Management source was resolved automatically for quick execution.", {
            trustedSource: asObject(preflight.parameters).trustedSource,
            resolution: asObject(preflight.parameters).trustedSourceResolution
          });
          await audit(plan, "policy_warning", "Management source was auto-resolved or unrestricted because quick execution mode is enabled.", {
            unrestricted: preflight.unrestricted,
            warnings: preflight.warnings ?? []
          });
        }
      }
    }
  }

  const validation = await validateActionPlan(plan);
  if (validation.normalizedParameters.trustedSourceAutoResolved === true && !preflight?.autoResolved) {
    await audit(plan, "parameters_auto_resolved", "Management source was resolved automatically for quick execution.", {
      trustedSource: validation.normalizedParameters.trustedSource,
      resolution: validation.normalizedParameters.trustedSourceResolution
    });
    await audit(plan, "policy_warning", "Management source was auto-resolved or unrestricted because quick execution mode is enabled.", {
      unrestricted: validation.normalizedParameters.trustedSource === "0.0.0.0/0"
    });
  }
  if (!validation.valid) {
    const details = validationDetails({ plan, validation, stage: "validation" });
    const combinedMissingFields = Array.from(new Set([...(validation.missingFields ?? []), ...(preflight?.missingFields ?? [])]));
    const failed = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        parametersJson: toJson(storedNormalizedParameters(plan, validation.normalizedParameters)),
        validationJson: toJson({
          ...details,
          missingFields: combinedMissingFields,
          suggestions: preflight?.suggestions ?? {},
          userMessage: userValidationMessage(validation.errors, combinedMissingFields)
        }),
        dryRunJson: Prisma.JsonNull,
        approvalJson: Prisma.JsonNull
      },
      include: includeRelations()
    });
    await audit(failed, "action.command_plan_blocked", "Command plan blocked by policy validation.", validation);
    return failed;
  }

  let dryRun: Awaited<ReturnType<typeof buildDryRun>>;
  try {
    const normalizedPlan = await prisma.actionPlan.update({
      where: { id },
      data: {
        riskLevel: validation.riskLevel,
        parametersJson: toJson(storedNormalizedParameters(plan, validation.normalizedParameters))
      }
    });
    dryRun = await buildDryRun(normalizedPlan);
    plan = normalizedPlan;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Command compiler failed.";
    const failed = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        validationJson: toJson(validationDetails({ plan, validation, stage: "compiler", compilerError: reason, exactReason: reason })),
        approvalJson: Prisma.JsonNull,
        dryRunJson: toJson({
          status: "unsupported",
          commands: [],
          warnings: [reason],
          unsupportedReason: reason,
          missingFields: [],
          parameters: asObject(plan.parametersJson)
        })
      },
      include: includeRelations()
    });
    await audit(failed, "action.command_plan_failed", "Command plan compiler failed.", { reason, parameters: asObject(plan.parametersJson) });
    return failed;
  }
  const dryRunObject = asObject(dryRun);
  const planStatus = dryRunObject.status === "needs_clarification"
    ? ActionPlanStatus.proposed
    : dryRunObject.status === "unsupported"
      ? ActionPlanStatus.validation_failed
      : ActionPlanStatus.dry_run_ready;
  const normalizedStoredParameters = storedNormalizedParameters(plan, validation.normalizedParameters);
  const finalParameters = withExecutionMetadata(normalizedStoredParameters, {
    normalizedParams: canonicalParameterValues(normalizedStoredParameters)
  });
  const revisionMetadata = previewRevisionMetadata({ ...plan, parametersJson: toJson(finalParameters) as unknown as Prisma.JsonValue }, dryRun);
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: planStatus,
      riskLevel: validation.riskLevel,
      validationJson: toJson({
        ...validationDetails({ plan, validation, stage: "command_plan" }),
        plannerStatus: dryRunObject.status,
        needsClarification: dryRunObject.status === "needs_clarification",
        missingFields: dryRunObject.missingFields ?? [],
        questions: dryRunObject.questions ?? [],
        unsupportedReason: dryRunObject.unsupportedReason
      }),
      dryRunJson: toJson(dryRun),
      parametersJson: toJson(withExecutionMetadata(finalParameters, {
        previewGenerated: true,
        executed: false,
        connectorInvoked: false,
        lastExecutionStatus: "preview_ready",
        previewStale: false,
        staleReason: null,
        ...revisionMetadata
      })),
      rollbackJson: toJson(validation.rollbackJson)
    },
    include: includeRelations()
  });

  await audit(
    updated,
    dryRunObject.status === "needs_clarification" ? "action.command_plan_needs_clarification" : dryRunObject.status === "unsupported" ? "action.command_plan_unsupported" : "action.command_plan_ready",
    "Internal command plan generated without executing device changes.",
    dryRun
  );
  await audit(updated, "command_plan_generated", "Internal command plan generated for controlled execution.", dryRun);
  return updated;
}

export async function approveActionPlan(id: string, input: Record<string, unknown>) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  const preconditionError = approvalPreconditionError(plan);
  if (preconditionError) {
    await audit(plan, "action.approval_blocked", "Approval refused because a successful dry-run is required.", { code: preconditionError.code, status: plan.status });
    throw preconditionError;
  }
  const typedApproval = typeof input.approvalConfirmation === "string" ? input.approvalConfirmation.trim() : "";
  const inputError = approvalInputError(plan.riskLevel, input);
  if (inputError) throw new ActionExecutionError(plan.riskLevel === AiRiskLevel.critical ? "BREAK_GLASS_REQUIRED" : "APPROVAL_CONFIRMATION_REQUIRED", inputError, 428);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  const approval = await prisma.actionApproval.create({
    data: {
      actionPlanId: id,
      approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : undefined,
      decision: ApprovalDecision.approved,
      reason: reason || undefined
    }
  });

  const approvalMetadata = asObject(asObject(plan.parametersJson).metadata);
  const approvedRevision = planRevision(approvalMetadata);
  const approvedCanonicalPayloadHash = String(approvalMetadata.canonicalPayloadHash ?? actionExecutionFingerprint(plan));
  const approvedPreviewHash = String(approvalMetadata.previewHash ?? "");

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.approved,
      approvalJson: toJson({ decision: approval.decision, approvedBy: approval.approvedBy, reason: approval.reason, confirmation: typedApproval || null, breakGlass: input.breakGlass === true, createdAt: approval.createdAt, planRevision: approvedRevision, canonicalPayloadHash: approvedCanonicalPayloadHash, previewHash: approvedPreviewHash }),
      parametersJson: toJson(withExecutionMetadata(plan.parametersJson, { planState: "approved", approvedRevision, approvedCanonicalPayloadHash, approvedPreviewHash, approvedCanonicalPayload: approvalMetadata.canonicalPayload, approvedAt: approval.createdAt }))
    },
    include: includeRelations()
  });

  await audit(updated, "action.approved", "Action plan manually approved.", approval);
  await audit(updated, "action_approved", "Action plan manually approved.", approval);
  return updated;
}

export async function rejectActionPlan(id: string, input: Record<string, unknown>) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  const approval = await prisma.actionApproval.create({
    data: {
      actionPlanId: id,
      approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : undefined,
      decision: ApprovalDecision.rejected,
      reason: typeof input.reason === "string" ? input.reason : undefined
    }
  });

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.rejected,
      approvalJson: toJson({ decision: approval.decision, approvedBy: approval.approvedBy, reason: approval.reason, createdAt: approval.createdAt })
    },
    include: includeRelations()
  });

  await audit(updated, "action.rejected", "Action plan manually rejected.", approval);
  return updated;
}

export async function executeActionPlan(id: string, executionInput: Record<string, unknown> = {}, dependencies: ExecutionDependencies = {}) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  let catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>;
  try { catalogResolution = await ensureControlledCatalogAction(plan); } catch (error) {
    await audit(plan, "controlled_execution_blocked", "Execution refused by catalog resolution.", { actionType: plan.actionType, code: error instanceof ActionExecutionError ? error.code : "CATALOG_RESOLUTION_FAILED" });
    throw error;
  }

  if (env.actionExecutionMode === "direct_controlled" && !plan.dryRunJson) {
    const planned = await dryRunActionPlan(id);
    if (!planned) return null;
    plan = planned;
    if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) return plan;
  }

  const approvalError = executionApprovalError(plan);
  if (approvalError) {
    await audit(plan, "execution_failed", "Execution refused because action is not approved.", { code: approvalError.code, status: plan.status });
    throw approvalError;
  }

  if (!plan.dryRunJson) {
    await audit(plan, "execution_failed", "Execution refused because the command plan is missing.", { code: "COMMAND_PLAN_REQUIRED" });
    throw new ActionExecutionError("COMMAND_PLAN_REQUIRED", "An internal command plan is required before execution.");
  }
  let metadata = asObject(asObject(plan.parametersJson).metadata);
  if (!metadata.approvedCanonicalPayloadHash) {
    plan = await approveCurrentRevisionForExecution(plan, executionInput);
    metadata = asObject(asObject(plan.parametersJson).metadata);
  }
  const currentFingerprint = actionExecutionFingerprint(plan);
  const approvedFingerprint = String(metadata.approvedCanonicalPayloadHash ?? "");
  if (approvedFingerprint !== currentFingerprint) {
    const approvedPayload = asObject(metadata.approvedCanonicalPayload);
    const currentPayload = canonicalPayloadFromStoredPlan(plan);
    const approvedParameters = asObject(approvedPayload.parameters);
    const changedFields = Array.from(new Set([...Object.keys(approvedParameters), ...Object.keys(currentPayload.parameters)]))
      .filter((field) => stableJson(approvedParameters[field]) !== stableJson(currentPayload.parameters[field]));
    plan = await regenerateLatestRevisionForExecution(plan, executionInput, changedFields);
    metadata = asObject(asObject(plan.parametersJson).metadata);
  }
  if (plan.riskLevel === AiRiskLevel.critical && env.actionExecutionMode !== "direct_controlled" && !env.actionAllowLabUnrestrictedManagement) {
    const reason = typeof executionInput.reason === "string" ? executionInput.reason.trim() : "";
    if (executionInput.breakGlass !== true || !reason) {
      throw new ActionExecutionError("BREAK_GLASS_REQUIRED", "Critical execution requires break-glass mode and a reason.", 428);
    }
  }

  const validationJson = asObject(plan.validationJson);
  const validationErrors = Array.isArray(validationJson.errors) ? validationJson.errors : [];
  if (validationErrors.length > 0 || validationJson.valid === false) {
    await audit(plan, "execution_failed", "Execution refused because stored validation has blocking errors.", { code: "VALIDATION_BLOCKED", validationJson });
    throw new ActionExecutionError("VALIDATION_BLOCKED", "ActionPlan validation has blocking errors.");
  }

  if (!plan.deviceId) {
    await audit(plan, "execution_failed", "Execution refused because no device is selected.", { code: "DEVICE_REQUIRED" });
    throw new ActionExecutionError("DEVICE_REQUIRED", "ActionPlan requires a target device.");
  }

  let device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
  if (!device) {
    await audit(plan, "execution_failed", "Execution refused because target device was not found.", { code: "DEVICE_REQUIRED" });
    throw new ActionExecutionError("DEVICE_REQUIRED", "Target device was not found.", 404);
  }

  const connector = (dependencies.selectConnector ?? selectDeviceConnector)(device);
  if (!connector) {
    await audit(plan, "execution_failed", "Execution refused because no connector matched the target device.", { code: "CONNECTOR_NOT_FOUND", deviceType: device.type, protocol: device.protocol });
    throw new ActionExecutionError("CONNECTOR_NOT_FOUND", "No connector found for this device.");
  }

  if (!connector.supportedActions.includes(plan.actionType)) {
    await audit(plan, "execution_failed", "Execution refused because connector does not support this action.", { code: "CONNECTOR_ACTION_UNSUPPORTED", actionType: plan.actionType });
    throw new ActionExecutionError("CONNECTOR_ACTION_UNSUPPORTED", "Connector does not support this action.");
  }

  if (plan.actionType === ActionType.fortigate_guided_vpn_setup && connector.name === "fortigate") {
    const capabilities = asObject(device.capabilities);
    const discovery = asObject(asObject(capabilities.fortigateStatus).fortigate);
    const cachedInterfaces = Array.isArray(discovery.interfaces) ? discovery.interfaces.map(String).filter(Boolean) : [];
    if (cachedInterfaces.length === 0) {
      await audit(plan, "fortigate_discovery_started", "FortiGate interface discovery cache was empty; running safe read-only discovery before execution.", { commands: ["show system interface", "get system interface"] });
      let status: unknown;
      try {
        status = await connector.collectStatus(device);
      } catch (error) {
        await audit(plan, "execution_failed", "FortiGate read-only discovery failed before execution.", { code: "FORTIGATE_CONNECTOR_NOT_CONFIGURED", error: error instanceof Error ? error.message : "discovery failed" });
        throw new ActionExecutionError("FORTIGATE_CONNECTOR_NOT_CONFIGURED", "Cannot execute: FortiGate SSH connector is not configured for this device.", 409);
      }
      const statusObject = asObject(status);
      const statusDiscovery = asObject(statusObject.fortigate);
      const liveInterfaces = Array.isArray(statusDiscovery.interfaces) ? statusDiscovery.interfaces.map(String).filter(Boolean) : [];
      if (statusObject.connected === false || liveInterfaces.length === 0) {
        await audit(plan, "execution_failed", "FortiGate read-only discovery did not return interface names.", { code: "FORTIGATE_DISCOVERY_FAILED", errorCode: statusObject.errorCode ?? null });
        throw new ActionExecutionError("FORTIGATE_DISCOVERY_FAILED", "Cannot execute: FortiGate interface discovery did not return interface names.", 409);
      }
      device = await prisma.device.update({
        where: { id: device.id },
        data: { capabilities: toJson({ ...capabilities, fortigateStatus: statusObject }) }
      });
      await audit(plan, "fortigate_discovery_completed", "FortiGate interface discovery refreshed before execution.", { interfaceCount: liveInterfaces.length });
    }
  }

  const validation = await validateActionPlan(plan);
  const pipeline = await resolveExecutionPipeline({ plan, device, connector, catalogResolution, validation });
  await audit(plan, "policy_guard_passed", "PolicyGuard allowed controlled execution.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name });
  dependencies.trace?.("action_policy_guard_passed", {});
  if (env.actionAllowLabUnrestrictedManagement) {
    await audit(plan, "policy_allowed_lab_unrestricted", "Lab unrestricted mode allowed the validated template after user confirmation.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name });
    dependencies.trace?.("action_policy_allowed_lab_unrestricted", {});
  }
  await audit(plan, "connector_resolved", "Device connector resolved for execution.", { connector: connector.name, connectorType: pipeline.template.connectorType, templateRef: pipeline.template.id });
  dependencies.trace?.("action_connector_resolved", { connectorType: connector.name, executionTemplateRef: pipeline.template.id });

  const executing = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.executing,
      parametersJson: toJson(withExecutionMetadata(plan.parametersJson, {
        planState: "executing",
        executingRevision: planRevision(metadata),
        executed: false,
        connectorInvoked: false,
        backupEnabled: false,
        executionTemplateRef: pipeline.template.id,
        connectorType: pipeline.template.connectorType,
        executionPipeline: {
          template: pipeline.template.id,
          connector: connector.name,
          validation: "passed",
          execution: "running",
          verification: "pending",
          audit: "started"
        },
        previewStale: false,
        staleReason: null,
        executionStartedAt: new Date().toISOString(),
        lastExecutionStatus: "executing"
      }))
    },
    include: includeRelations()
  });

  await audit(executing, "execution_started", "Controlled catalog execution started.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name, backupEnabled: false });

  await audit(executing, "connection_attempt", "Connector execution connection attempt started.", {
    connector: connector.name,
    host: device.host,
    port: device.managementPort,
    backupEnabled: false
  });

  try {
    await audit(executing, "preflight_check", "Execution gating passed; connector preflight starting.", {
      actionType: plan.actionType,
      approved: true,
      dryRunPresent: true,
      backupEnabled: false
    });
    const invoked = await prisma.actionPlan.update({ where: { id }, data: { parametersJson: toJson(withExecutionMetadata(executing.parametersJson, { connectorInvoked: true })) } });
    await audit(invoked, "connector_invoked", "Resolved connector was invoked for real execution.", { connector: connector.name, backupEnabled: false });
    dependencies.trace?.("action_connector_invoked", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false });
    dependencies.trace?.("action_remote_command_started", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false });
    const result = await connector.execute(plan, device, (eventType, message, metadata) => audit(executing, eventType, message, metadata));
    await audit(executing, "connector_result_received", "Connector returned a real execution result.", { executed: result.executed, commandCount: result.commands.length });
    if (result.executed && plan.actionType === ActionType.mikrotik_change_service_port) {
      const parameters = asObject(plan.parametersJson);
      const newPort = Number(parameters.newPort ?? parameters.port);
      if (parameters.service === "ssh" && Number.isInteger(newPort) && newPort >= 1024 && newPort <= 65535) {
        await prisma.device.update({ where: { id: device.id }, data: { managementPort: newPort } });
        await audit(executing, "device_management_port_updated", "Stored MikroTik SSH management port updated after successful execution.", {
          deviceId: device.id,
          oldPort: device.managementPort,
          newPort,
          approvalStatus: "approved",
          executionResult: "succeeded",
          rollbackPreview: result.rollbackJson ?? plan.rollbackJson
        });
      }
    }
    const completedAt = new Date().toISOString();
    const startedAt = String(asObject(asObject(executing.parametersJson).metadata).executionStartedAt ?? completedAt);
    const exitCodes = result.commands.map((command) => command.exitCode).filter((code): code is number => typeof code === "number");
    const serviceStatus = asObject(result.rollbackJson).serviceStatus;
    const serviceStatusReadSucceeded = plan.actionType === ActionType.linux_check_service_status &&
      result.executed &&
      result.commands.length > 0 &&
      ["active", "inactive", "failed", "not_found", "unknown"].includes(String(asObject(serviceStatus).state));
    const executionSucceeded = serviceStatusReadSucceeded || (result.executed && result.commands.length > 0 && exitCodes.every((code) => code === 0));
    const dailyCheck = plan.actionType === ActionType.linux_daily_check || plan.actionType === ActionType.mikrotik_daily_check || plan.actionType === ActionType.fortigate_daily_check
      ? plan.actionType === ActionType.fortigate_daily_check
        ? buildFortiGateDailyCheck(device.id, result.commands)
        : buildDailyCheckResult({ deviceId: device.id, vendor: plan.actionType === ActionType.linux_daily_check ? "linux" : "mikrotik", outputs: result.commands })
      : null;
    const fortigateReadOnly = String(plan.actionType).startsWith("fortigate_show_") || ["fortigate_route_dns_check", "fortigate_license_status", "fortigate_admin_users"].includes(String(plan.actionType))
      ? parseFortiGateReadOnlyResult(String(plan.actionType), result.commands)
      : null;
    const resultPayload: Record<string, unknown> & { stdout: string; stderr: string; exitCode: number | null } = {
      ...result,
      executed: executionSucceeded,
      outcome: asObject(result.rollbackJson).outcome ?? (executionSucceeded ? "completed" : "failed"),
      connectorInvoked: true,
      backupEnabled: false,
      executionStartedAt: startedAt,
      executionCompletedAt: completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      exitCode: exitCodes.length ? Math.max(...exitCodes) : null,
      stdout: result.commands.map((command) => command.stdout).filter(Boolean).join("\n"),
      stderr: result.commands.map((command) => command.stderr).filter(Boolean).join("\n"),
      executor: connector.name,
      parsedResult: serviceStatusReadSucceeded ? serviceStatus : dailyCheck ?? fortigateReadOnly ?? parseExecutionResult(plan.actionType, result.commands.map((command) => command.stdout).filter(Boolean).join("\n"), result.commands, asObject(result.rollbackJson).verification),
      verification: null,
      executionEvidence: null,
      resultUrl: `/actions/${id}/result`
    };
    const verification = buildPostExecutionVerification({ plan, pipeline, result, executionSucceeded, connectorInvoked: true });
    resultPayload.verification = verification;
    resultPayload.executionEvidence = {
      template: { status: "resolved", ref: pipeline.template.id, connectorType: pipeline.template.connectorType, handler: pipeline.template.handler },
      connector: { status: "invoked", name: connector.name, registered: true },
      validation: { status: "passed", riskLevel: validation.riskLevel },
      execution: { status: executionSucceeded ? "success" : "failed", commandCount: result.commands.length, connectorInvoked: true },
      verification: { status: verification.ok ? "passed" : "failed", checks: verification.checks },
      audit: { status: "recorded", events: pipeline.auditEvents }
    };
    dependencies.trace?.("action_remote_command_completed", { connectorInvoked: true, connectorType: connector.name, exitCode: resultPayload.exitCode, stdoutLength: resultPayload.stdout.length, stderrLength: resultPayload.stderr.length });
    dependencies.trace?.(verification.ok ? "action_verification_passed" : "action_verification_failed", { connectorInvoked: true, connectorType: connector.name, executionTemplateRef: pipeline.template.id, checks: verification.checks });
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: verification.ok ? ActionPlanStatus.succeeded : ActionPlanStatus.failed,
        parametersJson: toJson(withExecutionMetadata(executing.parametersJson, {
          planState: verification.ok ? "completed" : "failed",
          executed: verification.ok,
          connectorInvoked: true,
          backupEnabled: false,
          executionTemplateRef: pipeline.template.id,
          connectorType: pipeline.template.connectorType,
          verificationStatus: verification.ok ? "passed" : "failed",
          executionPipeline: {
            template: "resolved",
            connector: "invoked",
            validation: "passed",
            execution: executionSucceeded ? "success" : "failed",
            verification: verification.ok ? "passed" : "failed",
            audit: "recorded"
          },
          executionCompletedAt: completedAt,
          exitCode: resultPayload.exitCode,
          executor: connector.name,
          lastExecutionStatus: verification.ok ? "succeeded" : "failed"
        })),
        resultJson: toJson(resultPayload),
        rollbackJson: toJson(result.rollbackJson ?? plan.rollbackJson)
      },
      include: includeRelations()
    });

    await audit(updated, "connection_success", "Connector execution connection succeeded.", { connector: connector.name });
    dependencies.trace?.("action_execution_result_saved", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false, exitCode: resultPayload.exitCode, stdoutLength: resultPayload.stdout.length, stderrLength: resultPayload.stderr.length });
    await audit(updated, verification.ok ? "post_execution_verification_passed" : "post_execution_verification_failed", verification.ok ? "Post-execution evidence verified." : "Post-execution evidence failed verification.", verification);
    await audit(updated, verification.ok ? "execution_succeeded" : "execution_failed", verification.ok ? "Connector execution succeeded and evidence verified." : "Connector execution evidence failed verification.", resultPayload);
    return updated;
  } catch (error) {
    const structural = connectorErrorLike(error);
    const connectorError = error instanceof ConnectorError
      ? error
      : structural
        ? structural
        : new ActionExecutionError("EXECUTION_FAILED", error instanceof Error ? error.message : "Execution failed.");
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.failed,
        parametersJson: toJson(withExecutionMetadata(plan.parametersJson, {
          planState: "failed",
          executed: false,
          connectorInvoked: true,
          backupEnabled: false,
          executionTemplateRef: pipeline.template.id,
          connectorType: pipeline.template.connectorType,
          verificationStatus: "failed",
          executionPipeline: {
            template: "resolved",
            connector: "invoked",
            validation: "passed",
            execution: "failed",
            verification: "failed",
            audit: "recorded"
          },
          executionCompletedAt: new Date().toISOString(),
          lastExecutionStatus: "failed"
        })),
        resultJson: toJson({
          executed: false,
          connectorInvoked: true,
          backupEnabled: false,
          executionEvidence: {
            template: { status: "resolved", ref: pipeline.template.id, connectorType: pipeline.template.connectorType, handler: pipeline.template.handler },
            connector: { status: "invoked", name: connector.name, registered: true },
            validation: { status: "passed", riskLevel: validation.riskLevel },
            execution: { status: "failed", connectorInvoked: true },
            verification: { status: "failed", error: connectorError.code },
            audit: { status: "recorded", events: pipeline.auditEvents }
          },
          error: connectorError.code,
          message: connectorError.message
        })
      },
      include: includeRelations()
    });
    await audit(updated, "connection_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    await audit(updated, "command_failed", "Connector command failed or was refused.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    await audit(updated, "post_execution_verification_failed", "Post-execution verification failed because the connector call did not return successful evidence.", { code: connectorError.code, message: connectorError.message, connectorInvoked: true, templateRef: pipeline.template.id, connector: connector.name });
    dependencies.trace?.("action_verification_failed", { connectorInvoked: true, connectorType: connector.name, executionTemplateRef: pipeline.template.id, error: connectorError.code });
    await audit(updated, "execution_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    throw new ActionExecutionError(connectorError.code, connectorError.message, connectorError.statusCode ?? 409);
  }
}

export async function quickExecuteActionPlan(id: string, input: Record<string, unknown> = {}, dependencies: ExecutionDependencies = {}) {
  const initial = await prisma.actionPlan.findUnique({ where: { id } });
  if (!initial) return null;
  if (input.intent !== "execute" && input.intent !== "preview") throw new ActionExecutionError("EXECUTION_INTENT_REQUIRED", "برای اجرا، intent=execute الزامی است.", 400);
  const intent = input.intent;
  const traceBase = (extra: Record<string, unknown> = {}) => ({
    actionPlanId: initial.id, actionType: initial.actionType, deviceId: initial.deviceId,
    catalogCommandId: asObject(asObject(initial.parametersJson).metadata).catalogCommandId ?? null,
    executionTemplateRef: asObject(asObject(initial.parametersJson).metadata).executionTemplateRef ?? null,
    vendor: asObject(asObject(initial.parametersJson).metadata).vendor ?? asObject(initial.parametersJson).vendor ?? null,
    connectorType: asObject(asObject(initial.parametersJson).metadata).connectorType ?? null,
    intent, connectorInvoked: false, remoteCommand: null, exitCode: null, stdoutLength: 0, stderrLength: 0,
    ...extra
  });
  const trace = (stage: string, extra: Record<string, unknown> = {}) => dependencies.trace?.(stage, traceBase(extra));
  trace("action_execute_requested");
  await audit(initial, "execution_requested", "Explicit quick execution request received.", traceBase());
  let catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>;
  try { catalogResolution = await ensureControlledCatalogAction(initial); } catch (error) {
    await audit(initial, "quick_execute_blocked", "Quick Execute refused by catalog resolution.", { code: error instanceof ActionExecutionError ? error.code : "CATALOG_RESOLUTION_FAILED" });
    throw error;
  }
  trace("action_catalog_resolved", { catalogCommandId: catalogResolution.catalogCommandId, executionTemplateRef: catalogResolution.executionTemplateRef, connectorType: catalogResolution.connectorType, vendor: catalogResolution.vendor });
  trace("action_template_resolved", { executionTemplateRef: catalogResolution.executionTemplateRef, connectorType: catalogResolution.connectorType });
  const initialMetadata = asObject(asObject(initial.parametersJson).metadata);
  const currentRevision = planRevision(initialMetadata);
  const requestedRevision = Number(input.actionPlanRevision);
  if (Number.isInteger(requestedRevision) && requestedRevision > 0 && requestedRevision !== currentRevision) {
    await audit(initial, "execution_revision_resolved", "Execute request revision was superseded by the newest stored ActionPlan revision.", { requestedRevision, currentRevision });
    trace("action_revision_resolved", { requestedRevision, currentRevision });
  }
  const currentInitialFingerprint = actionExecutionFingerprint(initial);
  const storedInitialFingerprint = typeof initialMetadata.previewFingerprint === "string" ? initialMetadata.previewFingerprint : null;
  if (initial.dryRunJson && storedInitialFingerprint && storedInitialFingerprint !== currentInitialFingerprint) {
    await prisma.actionPlan.update({ where: { id }, data: { parametersJson: toJson(withExecutionMetadata(initial.parametersJson, { previewStale: true, staleReason: "user_controlled_inputs_changed" })) } });
    trace("action_preview_checked", { previewStale: true, staleReason: "user_controlled_inputs_changed" });
    await audit(initial, "preview_rebuild_requested", "Stale preview will be rebuilt once before explicit execution.", { staleReason: "stable_execution_inputs_changed" });
  }
  let plan = initial.dryRunJson && storedInitialFingerprint === currentInitialFingerprint ? initial : await dryRunActionPlan(id);
  if (!plan) return null;
  const planMetadata = asObject(asObject(plan.parametersJson).metadata);
  const previewStale = typeof planMetadata.previewFingerprint === "string" && planMetadata.previewFingerprint !== actionExecutionFingerprint(plan);
  const plannedCommands = [...(Array.isArray(asObject(plan.dryRunJson).plannedCommands) ? asObject(plan.dryRunJson).plannedCommands as unknown[] : []), ...(Array.isArray(asObject(plan.dryRunJson).commands) ? asObject(plan.dryRunJson).commands as unknown[] : [])];
  const safeRemoteCommand = plannedCommands.slice(0, 2).map(String).join(" ; ").replace(/(password|passphrase|private[-_ ]?key)\s*[=:]\s*\S+/gi, "$1=[REDACTED]").slice(0, 500) || String(catalogResolution.executionTemplateRef ?? plan.actionType);
  trace("action_preview_checked", { previewStale, staleReason: previewStale ? "user_controlled_inputs_changed" : null, remoteCommand: safeRemoteCommand });
  await audit(plan, "preview_checked", "Prepared command preview fingerprint checked.", { previewStale, staleReason: previewStale ? "user_controlled_inputs_changed" : null });

  if (intent === "preview") return plan;

  if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) {
    await audit(plan, "quick_execute_blocked", "Quick Execute stopped before approval/execution.", {
      status: plan.status,
      validationJson: plan.validationJson,
      dryRunJson: plan.dryRunJson
    });
    trace("action_execution_failed", { connectorInvoked: false, error: "PREVIEW_BLOCKED", status: plan.status });
    throw new ActionExecutionError("PREVIEW_BLOCKED", "پیش‌نمایش آماده اجرا نیست؛ خطاهای اعتبارسنجی یا پارامترهای ناقص را بررسی کنید.");
  }

  if (env.actionExecutionMode === "direct_controlled" || env.actionExecutionMode === "quick_controlled") {
    if (env.appProfile === "staging" && env.actionExecutionMode === "direct_controlled") {
      await audit(plan, "profile_audit_warning", "Staging profile allowed direct controlled execution without a separate approval step.", {
        appProfile: env.appProfile,
        executionMode: env.actionExecutionMode,
        actionType: plan.actionType,
        riskLevel: plan.riskLevel
      });
    }
    await audit(plan, "execution_confirmed", "User confirmed one-click controlled execution.", {
      actionType: plan.actionType,
      executionMode: env.actionExecutionMode
    });
    await audit(plan, "direct_controlled_execution_requested", "One-click controlled execution requested; command planning was automatic.", {
      actionType: plan.actionType,
      catalogControlled: catalogResolution.controlled,
      catalogCommandId: catalogResolution.catalogCommandId,
      catalogSource: catalogResolution.source
    });
    let connectorInvokedDuringExecution = false;
    try {
      const resultPlan = await executeActionPlan(id, input, { ...dependencies, intent, trace: (stage, payload) => { if (stage === "action_connector_invoked") connectorInvokedDuringExecution = true; trace(stage, { remoteCommand: safeRemoteCommand, ...payload }); } });
      if (!resultPlan) return null;
      const result = asObject(resultPlan.resultJson); const connectorInvoked = asObject(asObject(resultPlan.parametersJson).metadata).connectorInvoked === true;
      if (!connectorInvoked || resultPlan.status === ActionPlanStatus.dry_run_ready) throw new ActionExecutionError("PREVIEW_ONLY", "این دستور فقط پیش‌نمایش ساخته و هنوز روی دستگاه اجرا نشده است.");
      trace(resultPlan.status === ActionPlanStatus.succeeded ? "action_execution_succeeded" : "action_execution_failed", { connectorInvoked, remoteCommand: safeRemoteCommand, exitCode: result.exitCode ?? null, stdoutLength: String(result.stdout ?? "").length, stderrLength: String(result.stderr ?? "").length });
      return resultPlan;
    } catch (error) {
      trace("action_execution_failed", { connectorInvoked: connectorInvokedDuringExecution, remoteCommand: safeRemoteCommand, error: error instanceof Error ? error.message : "execution failed" });
      throw error;
    }
  }

  const requirements = approvalRequirements(plan.riskLevel);
  if (requirements.typedApprove) {
    const confirmed = typeof input.approvalConfirmation === "string" && input.approvalConfirmation.trim() === "APPROVE";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const criticalGateMissing = plan.riskLevel === AiRiskLevel.critical && (reason.length === 0 || input.breakGlass !== true);
    if (!confirmed || criticalGateMissing) {
      await audit(plan, "quick_execute_confirmation_required", "Quick Execute requires explicit confirmation for high/critical risk.", {
        riskLevel: plan.riskLevel,
        criticalGateMissing
      });
      throw new QuickExecuteConfirmationRequiredError(
        plan.riskLevel === AiRiskLevel.critical
          ? "Critical risk requires APPROVE, break-glass mode, and a reason."
          : "Safe mode requires APPROVE for this high-risk action.",
        plan
      );
    }
  }

  plan = await approveActionPlan(id, {
    approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : "quick-execute",
    reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "Execute from Action Center",
    approvalConfirmation: input.approvalConfirmation,
    breakGlass: input.breakGlass
  });
  if (!plan) return null;

  return executeActionPlan(id, {
    ...input,
    breakGlass: plan.riskLevel === AiRiskLevel.critical
  }, { ...dependencies, intent, trace: (stage, payload) => trace(stage, { remoteCommand: safeRemoteCommand, ...payload }) });
}

export async function getActionAudit(id: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id }, select: { id: true } });
  if (!plan) return null;
  return {
    actionPlanId: id,
    audit: await prisma.actionAuditLog.findMany({
      where: { actionPlanId: id },
      orderBy: { createdAt: "asc" }
    })
  };
}
