import { ActionPlanSource, ActionPlanStatus, ActionType, AiRiskLevel, DeviceType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { getActionCatalogEntry } from "../action-catalog.js";
import { COMMAND_CATALOG, COMMAND_CATALOG_VERSION } from "../../commands/catalog/index.js";
import {
  ActionExecutionError,
  actionTypeFromInput,
  asEnum,
  asObject,
  audit,
  canonicalParameterValues,
  executionParametersOnly,
  findOnlyCompatibleDevice,
  includeRelations,
  normalizeActionTypeForVendor,
  normalizeParameters,
  stableJson,
  toJson,
  vendorFromActionType,
  vendorFromDevice,
  vendorFromInput,
  withPlanIdentity
} from "./action-plan.shared.js";
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

  if (actionType === ActionType.close_port && deviceId && input.forceNew !== true) {
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
