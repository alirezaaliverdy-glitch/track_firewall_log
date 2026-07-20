import assert from "node:assert/strict";
import test from "node:test";

import {
  approveWorkflow,
  prepareWorkflowForReview,
  runApprovedWorkflow,
  validateWorkflowDependencies,
} from "../src/workflow/workflow-engine.js";
import type { WorkflowPlan } from "../src/workflow/workflow-contracts.js";

function workflow(overrides: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return {
    id: "wf-test",
    title: "Test workflow",
    deviceId: "device-1",
    vendor: "linux",
    platform: "linux",
    state: "draft",
    risk: "low",
    rawCommandExecution: false,
    audit: [],
    steps: [
      { id: "step-1", clientStepId: "client-1", intentKey: "linux.memory", state: "draft", parameters: {}, dependsOn: [], missingParameters: [] },
      { id: "step-2", clientStepId: "client-2", intentKey: "linux.service-status", state: "draft", parameters: { serviceName: "nginx" }, dependsOn: ["step-1"], missingParameters: [] },
    ],
    ...overrides,
  };
}

test("workflow dependency validation rejects missing dependencies and cycles", () => {
  assert.equal(validateWorkflowDependencies(workflow().steps).valid, true);
  assert.equal(validateWorkflowDependencies([{ ...workflow().steps[0], dependsOn: ["missing"] }]).valid, false);
  assert.equal(validateWorkflowDependencies([
    { ...workflow().steps[0], dependsOn: ["step-2"] },
    { ...workflow().steps[1], dependsOn: ["step-1"] },
  ]).valid, false);
});

test("workflow execution is blocked until review and approval", async () => {
  const prepared = prepareWorkflowForReview(workflow());
  assert.equal(prepared.state, "ready_for_review");

  const attempted = await runApprovedWorkflow(prepared, () => ({ status: "succeeded", connectorInvoked: true, summary: "ok" }));
  assert.equal(attempted.state, "awaiting_approval");

  const approved = approveWorkflow(prepared, "operator");
  assert.equal(approved.state, "approved");
  assert.equal(approved.approval?.status, "approved");
});

test("approved workflow runs steps in dependency order with connector evidence", async () => {
  const prepared = prepareWorkflowForReview(workflow());
  const approved = approveWorkflow(prepared, "operator");
  const order: string[] = [];
  const result = await runApprovedWorkflow(approved, ({ step }) => {
    order.push(step.id);
    return { status: "succeeded", connectorInvoked: true, summary: `${step.id} ok` };
  });

  assert.deepEqual(order, ["step-1", "step-2"]);
  assert.equal(result.state, "succeeded");
  assert.ok(result.steps.every((step) => step.state === "succeeded"));
  assert.ok(result.audit.some((event) => event.eventType === "workflow.completed"));
});

test("missing connector evidence fails the step and skips dependents", async () => {
  const prepared = prepareWorkflowForReview(workflow());
  const approved = approveWorkflow(prepared, "operator");
  const result = await runApprovedWorkflow(approved, ({ step }) => {
    if (step.id === "step-1") return { status: "succeeded", connectorInvoked: false, summary: "claimed success" };
    return { status: "succeeded", connectorInvoked: true, summary: "should not run" };
  });

  assert.equal(result.state, "failed");
  assert.equal(result.steps[0].state, "failed");
  assert.equal(result.steps[1].state, "skipped");
  assert.match(result.steps[0].result?.summary ?? "", /Missing connector invocation evidence/);
});
