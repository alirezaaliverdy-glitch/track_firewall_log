import {
  ActionPlanSource,
  ActionPlanStatus,
  ActionType,
  AiRiskLevel,
  ApprovalDecision,
  type ActionPlan,
  type Prisma
} from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ConnectorError } from "../connectors/linux-ssh.connector.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { buildDryRun } from "./dry-run.service.js";
import { validateActionPlan } from "./policy-guard.service.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function includeRelations() {
  return {
    device: { select: { id: true, name: true, type: true, host: true } },
    aiIntent: { select: { id: true, intentType: true, status: true, riskLevel: true } }
  } satisfies Prisma.ActionPlanInclude;
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
    actionType = asEnum(input.actionType, ActionType, "actionType");
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
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  const validation = await validateActionPlan(plan);
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: validation.valid ? ActionPlanStatus.awaiting_approval : ActionPlanStatus.validation_failed,
      validationJson: toJson({
        valid: validation.valid,
        requiresApproval: validation.requiresApproval,
        errors: validation.errors,
        warnings: validation.warnings,
        normalizedParameters: validation.normalizedParameters
      }),
      rollbackJson: toJson(validation.rollbackJson)
    },
    include: includeRelations()
  });

  await audit(updated, validation.valid ? "action.validated" : "action.validation_failed", validation.valid ? "Action plan passed policy validation." : "Action plan failed policy validation.", validation);
  return updated;
}

export async function dryRunActionPlan(id: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  const validation = await validateActionPlan(plan);
  if (!validation.valid) {
    const failed = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        validationJson: toJson(validation)
      },
      include: includeRelations()
    });
    await audit(failed, "action.dry_run_blocked", "Dry-run blocked by policy validation.", validation);
    return failed;
  }

  const dryRun = await buildDryRun(plan);
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
      validationJson: toJson({
        valid: true,
        requiresApproval: validation.requiresApproval,
        warnings: validation.warnings,
        normalizedParameters: validation.normalizedParameters,
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
    dryRunObject.status === "needs_clarification" ? "action.dry_run_needs_clarification" : dryRunObject.status === "unsupported" ? "action.dry_run_unsupported" : "action.dry_run_ready",
    "Dry-run generated without executing device changes.",
    dryRun
  );
  return updated;
}

export async function approveActionPlan(id: string, input: Record<string, unknown>) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  const approval = await prisma.actionApproval.create({
    data: {
      actionPlanId: id,
      approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : undefined,
      decision: ApprovalDecision.approved,
      reason: typeof input.reason === "string" ? input.reason : undefined
    }
  });

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.approved,
      approvalJson: toJson({ decision: approval.decision, approvedBy: approval.approvedBy, reason: approval.reason, createdAt: approval.createdAt })
    },
    include: includeRelations()
  });

  await audit(updated, "action.approved", "Action plan manually approved.", approval);
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

export async function executeActionPlan(id: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  if (plan.status !== ActionPlanStatus.approved) {
    await audit(plan, "execution_failed", "Execution refused because action is not approved.", { code: "ACTION_NOT_APPROVED", status: plan.status });
    throw new ActionExecutionError("ACTION_NOT_APPROVED", "ActionPlan must be approved before execution.");
  }

  if (!plan.dryRunJson) {
    await audit(plan, "execution_failed", "Execution refused because dry-run is missing.", { code: "DRY_RUN_REQUIRED" });
    throw new ActionExecutionError("DRY_RUN_REQUIRED", "Dry-run is required before execution.");
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
    const connectorError = error instanceof ConnectorError
      ? error
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
    throw new ActionExecutionError(connectorError.code, connectorError.message, connectorError instanceof ConnectorError ? connectorError.statusCode : 409);
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
