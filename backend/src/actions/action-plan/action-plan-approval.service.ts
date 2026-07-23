import { ActionPlanStatus, AiRiskLevel, ApprovalDecision } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  ActionExecutionError,
  actionExecutionFingerprint,
  approvalInputError,
  approvalPreconditionError,
  asObject,
  audit,
  buildApprovalBinding,
  includeRelations,
  planRevision,
  toJson,
  withExecutionMetadata
} from "./action-plan.shared.js";
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
  const approvedAt = approval.createdAt.toISOString();
  const approvalBinding = buildApprovalBinding({
    plan,
    planRevision: approvedRevision,
    approvedAt,
    previewHash: approvedPreviewHash,
    generatedStepsHash: typeof approvalMetadata.generatedStepsHash === "string" ? approvalMetadata.generatedStepsHash : undefined
  });

  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.approved,
      approvalJson: toJson({ decision: approval.decision, approvedBy: approval.approvedBy, reason: approval.reason, confirmation: typedApproval || null, breakGlass: input.breakGlass === true, createdAt: approval.createdAt, planRevision: approvedRevision, canonicalPayloadHash: approvedCanonicalPayloadHash, previewHash: approvedPreviewHash, approvalBinding }),
      parametersJson: toJson(withExecutionMetadata(plan.parametersJson, { planState: "approved", approvedRevision, approvedCanonicalPayloadHash, approvedPreviewHash, approvedBinding: approvalBinding, approvedCanonicalPayload: approvalMetadata.canonicalPayload, approvedAt: approval.createdAt }))
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
