import type {
  AuditEventContract,
  WorkflowPlan,
  WorkflowStep,
  WorkflowStepResult,
} from "./workflow-contracts.js";

export type WorkflowExecutionInput = {
  workflow: WorkflowPlan;
  step: WorkflowStep;
};

export type WorkflowStepExecutor = (input: WorkflowExecutionInput) => Promise<WorkflowStepResult> | WorkflowStepResult;

function audit(plan: WorkflowPlan, eventType: string, metadata: Record<string, unknown>, workflowStepId?: string): AuditEventContract {
  return {
    id: `${plan.id}:${eventType}:${plan.audit.length + 1}`,
    eventType,
    workflowId: plan.id,
    workflowStepId,
    deviceId: plan.deviceId,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

function clone(plan: WorkflowPlan): WorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({ ...step, dependsOn: [...step.dependsOn], missingParameters: [...step.missingParameters] })),
    audit: [...plan.audit],
    approval: plan.approval ? { ...plan.approval } : undefined,
    rawCommandExecution: false,
  };
}

export function validateWorkflowDependencies(steps: WorkflowStep[]) {
  const ids = new Set(steps.map((step) => step.id));
  const errors: string[] = [];
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) errors.push(`Step ${step.id} depends on missing step ${dependency}.`);
      if (dependency === step.id) errors.push(`Step ${step.id} cannot depend on itself.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  if (steps.some((step) => visit(step.id))) errors.push("Workflow contains a dependency cycle.");
  return { valid: errors.length === 0, errors };
}

export function prepareWorkflowForReview(plan: WorkflowPlan) {
  const next = clone(plan);
  const dependencyCheck = validateWorkflowDependencies(next.steps);
  const blocked = next.steps.some((step) => step.state === "blocked" || Boolean(step.blockedReason));
  const missing = next.steps.some((step) => step.missingParameters.length > 0);
  next.audit.push(audit(next, "workflow.resolved", { dependencyCheck, blocked, missing }));

  if (!dependencyCheck.valid || blocked) return { ...next, state: "blocked" as const };
  if (missing) return { ...next, state: "needs_input" as const };
  return {
    ...next,
    state: "ready_for_review" as const,
    steps: next.steps.map((step) => ({ ...step, state: "ready" as const })),
  };
}

export function approveWorkflow(plan: WorkflowPlan, actor: string) {
  const next = clone(plan);
  if (next.state !== "ready_for_review") {
    next.audit.push(audit(next, "workflow.approval_rejected", { reason: "not_ready_for_review", state: next.state }));
    return next;
  }
  next.audit.push(audit(next, "workflow.approved", { actor }));
  return {
    ...next,
    state: "approved" as const,
    approval: { required: true, status: "approved" as const, approvedBy: actor, decidedAt: new Date().toISOString() },
    steps: next.steps.map((step) => ({ ...step, state: "awaiting_approval" as const })),
  };
}

function orderedSteps(steps: WorkflowStep[]) {
  const remaining = new Map(steps.map((step) => [step.id, step]));
  const ordered: WorkflowStep[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].find((step) => step.dependsOn.every((dependency) => !remaining.has(dependency)));
    if (!ready) throw new Error("Workflow dependency cycle escaped validation.");
    ordered.push(ready);
    remaining.delete(ready.id);
  }
  return ordered;
}

export async function runApprovedWorkflow(plan: WorkflowPlan, executor: WorkflowStepExecutor) {
  let next = clone(plan);
  if (next.state !== "approved" || next.approval?.status !== "approved") {
    next.audit.push(audit(next, "workflow.execution_blocked", { reason: "approval_required", state: next.state }));
    return { ...next, state: "awaiting_approval" as const };
  }

  const dependencyCheck = validateWorkflowDependencies(next.steps);
  if (!dependencyCheck.valid) {
    next.audit.push(audit(next, "workflow.execution_blocked", { reason: "dependency_invalid", errors: dependencyCheck.errors }));
    return { ...next, state: "blocked" as const };
  }

  next = { ...next, state: "running", steps: next.steps.map((step) => ({ ...step, state: "queued" })) };
  const failed = new Set<string>();

  for (const step of orderedSteps(next.steps)) {
    const index = next.steps.findIndex((item) => item.id === step.id);
    const dependencyFailed = step.dependsOn.some((dependency) => failed.has(dependency));
    if (dependencyFailed) {
      next.steps[index] = { ...next.steps[index], state: "skipped", result: { status: "skipped", connectorInvoked: false, summary: "Skipped because a dependency failed." } };
      next.audit.push(audit(next, "workflow.step_skipped", { dependsOn: step.dependsOn }, step.id));
      continue;
    }

    next.steps[index] = { ...next.steps[index], state: "running" };
    next.audit.push(audit(next, "workflow.step_running", { intentKey: step.intentKey }, step.id));
    const result = await executor({ workflow: next, step: next.steps[index] });
    const normalizedResult = result.status === "succeeded" && !result.connectorInvoked
      ? { ...result, status: "failed" as const, summary: `${result.summary} Missing connector invocation evidence.` }
      : result;
    const state = normalizedResult.status === "succeeded" ? "verifying" : normalizedResult.status === "failed" ? "failed" : normalizedResult.status;
    next.steps[index] = { ...next.steps[index], state, result: normalizedResult };
    next.audit.push(audit(next, "workflow.step_result", normalizedResult as unknown as Record<string, unknown>, step.id));

    if (normalizedResult.status === "succeeded") {
      next.steps[index] = { ...next.steps[index], state: "succeeded" };
    } else {
      failed.add(step.id);
    }
  }

  const succeeded = next.steps.filter((step) => step.state === "succeeded").length;
  const skipped = next.steps.filter((step) => step.state === "skipped").length;
  const failedCount = next.steps.filter((step) => step.state === "failed").length;
  const state = failedCount === 0 && skipped === 0
    ? "succeeded"
    : succeeded > 0
      ? "partially_succeeded"
      : "failed";
  next.audit.push(audit(next, "workflow.completed", { succeeded, failed: failedCount, skipped }));
  return { ...next, state };
}
