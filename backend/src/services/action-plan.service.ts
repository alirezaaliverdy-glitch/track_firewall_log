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
import { prisma } from "../db/prisma.js";
import { ConnectorError } from "../connectors/linux-ssh.connector.js";
import { isMikroTikAction } from "../actions/mikrotik-action-catalog.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { buildDryRun } from "./dry-run.service.js";
import { validateActionPlan } from "./policy-guard.service.js";
import { getActionCatalogEntry } from "../actions/action-catalog.js";
import { normalizeActionType as normalizeCatalogActionType, normalizeIntent } from "../actions/intent-normalizer.js";
import { CANONICAL_INTENT_FIELDS } from "../actions/intent-normalizer.js";
import { normalizeVendor } from "./ai-normalization.js";
import { env, type ActionExecutionMode } from "../config/env.js";
import { preflightActionPlan } from "./action-preflight.service.js";
import { VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ActionVendor = "mikrotik" | "fortigate" | "linux_edge" | undefined;

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
  return undefined;
}

function vendorFromInput(input: Record<string, unknown>, parameters: Record<string, unknown>): ActionVendor {
  const normalized = normalizeVendor(input.vendor ?? parameters.vendor ?? parameters.targetDeviceHint);
  if (normalized) return normalized;
  return undefined;
}

export function normalizeActionTypeForVendor(actionType: ActionType, vendor: ActionVendor): ActionType {
  if (vendor === "mikrotik") {
    if (actionType === ActionType.block_source_ip_temporary) return ActionType.mikrotik_block_ip_temporary;
    if (actionType === ActionType.change_ssh_port) return ActionType.mikrotik_change_service_port;
    if (String(actionType) === "add_address_list_entry") return ActionType.mikrotik_add_address_list_entry;
  }
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
  const normalized = { ...parameters, ...canonical };
  if (actionType === ActionType.mikrotik_block_ip_temporary || actionType === ActionType.mikrotik_add_address_list_entry) {
    const address = firstText(normalized, ["address", "srcIP", "srcIp", "sourceIp", "sourceIP", "ip"]);
    if (address) normalized.address = address;
    if (typeof normalized.listName !== "string" || !normalized.listName.trim()) normalized.listName = "ai_blocklist";
    const timeout = firstText(normalized, ["timeout"]) ?? timeoutFromDuration(normalized.durationMinutes) ?? timeoutFromDuration(normalized.duration);
    if (timeout) normalized.timeout = timeout;
    if (actionType === ActionType.mikrotik_block_ip_temporary && (typeof normalized.timeout !== "string" || !normalized.timeout.trim())) normalized.timeout = "10m";
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
  if (new Set<ActionType>([ActionType.mikrotik_add_address_list_entry, ActionType.mikrotik_remove_address_list_entry, ActionType.mikrotik_block_ip_temporary, ActionType.mikrotik_update_address_list_entry]).has(actionType)) {
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
  if (!vendor) return undefined;
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

const EXECUTION_ONLY_FIELDS = new Set(["breakGlass", "executeConfirmation", "deviceNameConfirmation", "reason"]);

function controlledParameterJson(value: unknown) {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key]) => !EXECUTION_ONLY_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]));
  };
  return JSON.stringify(stable(asObject(value)));
}

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

export class ActionExecutionError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "ActionExecutionError";
    this.code = code;
    this.statusCode = statusCode;
  }
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

export function executionApprovalError(plan: Pick<ActionPlan, "actionType" | "status">, mode: ActionExecutionMode = env.actionExecutionMode) {
  const catalog = getActionCatalogEntry(plan.actionType);
  const controlled = Boolean(catalog) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === plan.actionType);
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
  const catalog = getActionCatalogEntry(actionType, vendor === "linux_edge" ? null : vendor);
  if (catalog) riskLevel = catalog.riskLevel;

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
  const parametersJson = mergeCorrectedParameters(existing.actionType, asObject(existing.parametersJson), corrections);
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
  await audit(updated, "action.parameters_corrected", "Canonical ActionPlan fields were corrected; the previous command plan was invalidated.", { fields: Object.keys(corrections) });
  const validated = await validateAndStoreActionPlan(id);
  if (validated?.status === ActionPlanStatus.awaiting_approval) return dryRunActionPlan(id);
  return validated;
}

export async function dryRunActionPlan(id: string) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);

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
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: planStatus,
      riskLevel: validation.riskLevel,
      parametersJson: toJson(storedNormalizedParameters(plan, validation.normalizedParameters)),
      validationJson: toJson({
        ...validationDetails({ plan, validation, stage: "command_plan" }),
        plannerStatus: dryRunObject.status,
        needsClarification: dryRunObject.status === "needs_clarification",
        missingFields: dryRunObject.missingFields ?? [],
        questions: dryRunObject.questions ?? [],
        unsupportedReason: dryRunObject.unsupportedReason
      }),
      dryRunJson: toJson(dryRun),
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

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.approved,
      approvalJson: toJson({ decision: approval.decision, approvedBy: approval.approvedBy, reason: approval.reason, confirmation: typedApproval || null, breakGlass: input.breakGlass === true, createdAt: approval.createdAt })
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

export async function executeActionPlan(id: string, executionInput: Record<string, unknown> = {}) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);

  const catalogActionType = plan.actionType;
  const catalogControlled = Boolean(getActionCatalogEntry(catalogActionType)) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === catalogActionType);
  if (!catalogControlled) {
    await audit(plan, "controlled_execution_blocked", "Execution refused because the action is not in the controlled catalog.", { actionType: plan.actionType });
    throw new ActionExecutionError("ACTION_NOT_IN_CATALOG", "This action is not supported in the command catalog yet.", 409);
  }

  if (env.actionExecutionMode === "direct_controlled" && !plan.dryRunJson) {
    const planned = await dryRunActionPlan(id);
    if (!planned) return null;
    plan = planned;
    if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) return plan;
  }

  const executionParameters = Object.fromEntries(
    Object.entries(executionInput).filter(([key]) => ["breakGlass", "executeConfirmation", "deviceNameConfirmation", "reason"].includes(key))
  );
  if (Object.keys(executionParameters).length > 0) {
    plan = await prisma.actionPlan.update({
      where: { id },
      data: {
        parametersJson: toJson({
          ...asObject(plan.parametersJson),
          ...executionParameters
        })
      }
    });
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
  const dryRunParameters = asObject(asObject(plan.dryRunJson).parameters);
  if (Object.keys(dryRunParameters).length > 0 && controlledParameterJson(dryRunParameters) !== controlledParameterJson(plan.parametersJson)) {
    await audit(plan, "execution_failed", "Execution refused because the command plan is stale.", { code: "COMMAND_PLAN_STALE" });
    throw new ActionExecutionError("COMMAND_PLAN_STALE", "The command plan is stale because the ActionPlan parameters changed.");
  }
  if (plan.riskLevel === AiRiskLevel.critical && env.actionExecutionMode !== "direct_controlled") {
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

  const device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
  if (!device) {
    await audit(plan, "execution_failed", "Execution refused because target device was not found.", { code: "DEVICE_REQUIRED" });
    throw new ActionExecutionError("DEVICE_REQUIRED", "Target device was not found.", 404);
  }

  const connector = selectDeviceConnector(device);
  if (!connector) {
    await audit(plan, "execution_failed", "Execution refused because no connector matched the target device.", { code: "CONNECTOR_NOT_FOUND", deviceType: device.type, protocol: device.protocol });
    throw new ActionExecutionError("CONNECTOR_NOT_FOUND", "No connector found for this device.");
  }

  if (!connector.supportedActions.includes(plan.actionType)) {
    await audit(plan, "execution_failed", "Execution refused because connector does not support this action.", { code: "CONNECTOR_ACTION_UNSUPPORTED", actionType: plan.actionType });
    throw new ActionExecutionError("CONNECTOR_ACTION_UNSUPPORTED", "Connector does not support this action.");
  }

  const validation = await validateActionPlan(plan);
  if (!validation.valid) {
    await audit(plan, "execution_failed", "Execution refused by immediate PolicyGuard re-check.", { code: "VALIDATION_BLOCKED", validation });
    throw new ActionExecutionError("VALIDATION_BLOCKED", "PolicyGuard blocked execution.");
  }

  const executing = await prisma.actionPlan.update({
    where: { id },
    data: { status: ActionPlanStatus.executing },
    include: includeRelations()
  });

  await audit(executing, "execution_started", "Controlled catalog execution started.", { actionType: plan.actionType });

  await audit(executing, "connection_attempt", "Connector execution connection attempt started.", {
    connector: connector.name,
    host: device.host,
    port: device.managementPort
  });

  try {
    await audit(executing, "preflight_check", "Execution gating passed; connector preflight starting.", {
      actionType: plan.actionType,
      approved: true,
      dryRunPresent: true
    });
    const result = await connector.execute(plan, device, (eventType, message, metadata) => audit(executing, eventType, message, metadata));
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
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: result.executed ? ActionPlanStatus.succeeded : ActionPlanStatus.failed,
        resultJson: toJson(result),
        rollbackJson: toJson(result.rollbackJson ?? plan.rollbackJson)
      },
      include: includeRelations()
    });

    await audit(updated, "connection_success", "Connector execution connection succeeded.", { connector: connector.name });
    await audit(updated, result.executed ? "execution_succeeded" : "execution_failed", result.executed ? "Connector execution succeeded." : "Connector execution did not complete automatically.", result);
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
        resultJson: toJson({
          executed: false,
          error: connectorError.code,
          message: connectorError.message
        })
      },
      include: includeRelations()
    });
    await audit(updated, "connection_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message });
    await audit(updated, "command_failed", "Connector command failed or was refused.", { code: connectorError.code, message: connectorError.message });
    await audit(updated, "execution_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message });
    throw new ActionExecutionError(connectorError.code, connectorError.message, connectorError.statusCode ?? 409);
  }
}

export async function quickExecuteActionPlan(id: string, input: Record<string, unknown> = {}) {
  let plan = await dryRunActionPlan(id);
  if (!plan) return null;

  if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) {
    await audit(plan, "quick_execute_blocked", "Quick Execute stopped before approval/execution.", {
      status: plan.status,
      validationJson: plan.validationJson,
      dryRunJson: plan.dryRunJson
    });
    return plan;
  }

  const catalogActionType = plan.actionType;
  const catalogControlled = Boolean(getActionCatalogEntry(catalogActionType)) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === catalogActionType);
  if (!catalogControlled) {
    await audit(plan, "controlled_execution_blocked", "Execution refused because the action is not in the controlled catalog.", { actionType: plan.actionType });
    throw new ActionExecutionError("ACTION_NOT_IN_CATALOG", "This action is not supported in the command catalog yet.", 409);
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
      catalogControlled: true
    });
    try {
      return await executeActionPlan(id, input);
    } catch (error) {
      const latest = await getActionPlan(id);
      if (latest) return latest;
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

  try {
    return await executeActionPlan(id, {
      ...input,
      breakGlass: plan.riskLevel === AiRiskLevel.critical
    });
  } catch (error) {
    const latest = await getActionPlan(id);
    await audit(plan, "quick_execute_failed", "Quick Execute finished with execution failure.", {
      error: error instanceof Error ? error.message : "Execution failed"
    });
    if (latest) return latest;
    throw error;
  }
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
