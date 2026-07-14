import { ActionPlanStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { proposeActionPlan, rejectActionPlan } from "./action-plan.service.js";

const TERMINAL = new Set<ActionPlanStatus>([ActionPlanStatus.succeeded, ActionPlanStatus.failed, ActionPlanStatus.rejected, ActionPlanStatus.rolled_back]);
const PREVIEWABLE = new Set<ActionPlanStatus>([ActionPlanStatus.proposed, ActionPlanStatus.validation_failed, ActionPlanStatus.awaiting_approval]);
const RETRYABLE = new Set<ActionPlanStatus>([ActionPlanStatus.failed, ActionPlanStatus.validation_failed, ActionPlanStatus.rejected]);
const SENSITIVE_KEY = /password|passphrase|private.?key|token|api.?key|secret/i;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitize(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
  return typeof value === "string" ? value.replace(/(?:password|passphrase|private.?key|token|api.?key|secret)\s*[:=]\s*\S+/gi, "[redacted]").slice(0, 20_000) : value;
}

export type ActionCenterLifecycle = "draft" | "needs_input" | "ready_for_confirmation" | "confirmed" | "executing" | "succeeded" | "failed" | "cancelled";

function lifecycle(status: ActionPlanStatus, resultJson: unknown): ActionCenterLifecycle {
  if (status === ActionPlanStatus.proposed) return "draft";
  if (status === ActionPlanStatus.validation_failed) return "needs_input";
  if (status === ActionPlanStatus.awaiting_approval || status === ActionPlanStatus.dry_run_ready) return "ready_for_confirmation";
  if (status === ActionPlanStatus.approved) return "confirmed";
  if (status === ActionPlanStatus.executing) return "executing";
  if (status === ActionPlanStatus.succeeded) return object(resultJson).connectorInvoked === true ? "succeeded" : "failed";
  if (status === ActionPlanStatus.rejected || status === ActionPlanStatus.rolled_back) return "cancelled";
  return "failed";
}

const include = {
  device: { select: { id: true, name: true, vendor: true, type: true, host: true, protocol: true, credentialId: true } },
  approvals: { orderBy: { createdAt: "desc" as const }, take: 10 }
} satisfies Prisma.ActionPlanInclude;

type CenterPlan = Prisma.ActionPlanGetPayload<{ include: typeof include }>;

function project(plan: CenterPlan) {
  const parameters = object(plan.parametersJson);
  const metadata = object(parameters.metadata);
  const validation = object(plan.validationJson);
  const result = object(plan.resultJson);
  const supportState = String(metadata.supportState ?? parameters.supportState ?? "unverified");
  const executionSupport = String(metadata.executionSupport ?? parameters.executionSupport ?? "unknown");
  const executable = supportState === "verified" && executionSupport === "connector" && metadata.executable === true;
  const state = lifecycle(plan.status, plan.resultJson);
  const terminal = TERMINAL.has(plan.status);
  const connectorInvoked = result.connectorInvoked === true;
  const integrityError = plan.status === ActionPlanStatus.succeeded && !connectorInvoked
    ? "Stored success has no connectorInvoked=true evidence and is projected as failed."
    : null;
  return {
    id: plan.id,
    source: plan.source,
    requestedBy: plan.requestedBy,
    deviceId: plan.deviceId,
    actionType: plan.actionType,
    status: plan.status,
    lifecycleState: state,
    riskLevel: plan.riskLevel,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    device: plan.device ? { ...plan.device, credentialConfigured: Boolean(plan.device.credentialId), credentialId: undefined } : null,
    support: { state: supportState, execution: executionSupport, executable, reason: metadata.supportReasonKey ?? validation.userMessage ?? null },
    controls: {
      canReview: true,
      canEditParameters: !terminal && plan.status !== ActionPlanStatus.executing,
      canSelectDevice: !terminal && plan.status !== ActionPlanStatus.executing,
      canSelectCredential: Boolean(plan.deviceId) && !terminal && plan.status !== ActionPlanStatus.executing,
      canPreview: executable && PREVIEWABLE.has(plan.status),
      canConfirm: executable && plan.status === ActionPlanStatus.dry_run_ready,
      canExecute: executable && plan.status === ActionPlanStatus.approved,
      canRetry: RETRYABLE.has(plan.status),
      canCancel: !terminal && plan.status !== ActionPlanStatus.executing,
      canViewEvidence: true,
      canViewConnectorResult: connectorInvoked || plan.status === ActionPlanStatus.failed,
      relatedDevicePath: plan.deviceId ? `/assets/devices/${plan.deviceId}` : null
    },
    parametersJson: sanitize(plan.parametersJson),
    validationJson: sanitize(plan.validationJson),
    commandPreview: sanitize(plan.dryRunJson),
    approval: sanitize(plan.approvalJson),
    connectorResult: sanitize(plan.resultJson),
    rollback: sanitize(plan.rollbackJson),
    evidence: {
      connectorInvoked,
      integrityError,
      approvals: sanitize(plan.approvals)
    }
  };
}

function integer(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

export async function listActionCenter(input: Record<string, unknown> = {}) {
  const rows = await prisma.actionPlan.findMany({ orderBy: { createdAt: "desc" }, take: 500, include });
  const all = rows.map(project);
  const summary = all.reduce((counts, item) => ({ ...counts, [item.lifecycleState]: counts[item.lifecycleState] + 1 }), {
    draft: 0, needs_input: 0, ready_for_confirmation: 0, confirmed: 0, executing: 0, succeeded: 0, failed: 0, cancelled: 0
  } as Record<ActionCenterLifecycle, number>);
  const view = String(input.view ?? "all");
  const query = String(input.q ?? "").trim().toLowerCase();
  const status = String(input.status ?? "").trim();
  const deviceId = String(input.deviceId ?? "").trim();
  const filtered = all.filter((item) => {
    if (view === "pending" && ["succeeded", "failed", "cancelled"].includes(item.lifecycleState)) return false;
    if (view === "history" && !["succeeded", "failed", "cancelled"].includes(item.lifecycleState)) return false;
    if (status && item.lifecycleState !== status && item.status !== status) return false;
    if (deviceId && item.deviceId !== deviceId) return false;
    if (query && !`${item.id} ${item.actionType} ${item.device?.name ?? ""} ${item.device?.vendor ?? ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const offset = integer(input.offset, 0, 10_000);
  const limit = integer(input.limit, 25, 100) || 25;
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit, summary, generatedAt: new Date().toISOString() };
}

export async function getActionCenterItem(id: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id }, include });
  if (!plan) return null;
  const audit = await prisma.actionAuditLog.findMany({ where: { actionPlanId: id }, orderBy: { createdAt: "asc" } });
  return { ...project(plan), audit: sanitize(audit) };
}

export async function cancelActionCenterItem(id: string, actor?: string, reason?: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  if (TERMINAL.has(plan.status) || plan.status === ActionPlanStatus.executing) throw new Error("Only a non-terminal, non-executing ActionPlan can be cancelled.");
  await rejectActionPlan(id, { approvedBy: actor, reason: reason?.trim() || "Cancelled from Action Center" });
  return getActionCenterItem(id);
}

export async function retryActionCenterItem(id: string, actor?: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  if (!RETRYABLE.has(plan.status)) {
    throw new Error("Only failed, needs-input, or cancelled ActionPlans can be retried.");
  }
  const parameters = object(plan.parametersJson);
  const retry = await proposeActionPlan({
    source: plan.source,
    requestedBy: actor ?? plan.requestedBy ?? undefined,
    deviceId: plan.deviceId ?? undefined,
    actionType: plan.actionType,
    riskLevel: plan.riskLevel,
    parametersJson: { ...parameters, metadata: { ...object(parameters.metadata), retryOf: plan.id } }
  });
  await prisma.actionAuditLog.create({ data: { actionPlanId: plan.id, deviceId: plan.deviceId, eventType: "action.retry_created", message: "A new retry ActionPlan was created without changing the historical plan.", metadataJson: { retryActionPlanId: retry.id } } });
  return getActionCenterItem(retry.id);
}

export async function updateActionCenterTarget(id: string, deviceId: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  if (TERMINAL.has(plan.status) || plan.status === ActionPlanStatus.executing) throw new Error("Completed or executing ActionPlans cannot change target device.");
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true } });
  if (!device) throw new Error("Selected device does not exist.");
  const parameters = object(plan.parametersJson);
  const metadata = object(parameters.metadata);
  const revision = Number.isInteger(Number(metadata.planRevision)) ? Number(metadata.planRevision) + 1 : 1;
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      deviceId,
      status: ActionPlanStatus.proposed,
      parametersJson: { ...parameters, deviceId, metadata: { ...metadata, deviceId, planRevision: revision, planState: "draft", previewGenerated: false, targetChanged: true } },
      validationJson: Prisma.JsonNull,
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull
    }
  });
  await prisma.actionAuditLog.create({ data: { actionPlanId: id, deviceId, eventType: "action.target_changed", message: "ActionPlan target device changed; preview and confirmation were invalidated.", metadataJson: { previousDeviceId: plan.deviceId, deviceId, planRevision: revision } } });
  return getActionCenterItem(updated.id);
}
