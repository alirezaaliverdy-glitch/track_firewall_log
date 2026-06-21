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

  const result = {
    executed: false,
    error: "connector_not_implemented",
    message: "Real device execution is intentionally disabled. Future connectors must run after approval, audit, and rollback checks."
  };

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.failed,
      resultJson: toJson(result)
    },
    include: includeRelations()
  });

  await audit(updated, "action.execution_refused", "Execution refused because device connector is not implemented.", result);
  return updated;
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
