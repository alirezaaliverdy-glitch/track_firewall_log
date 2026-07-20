import assert from "node:assert/strict";
import test from "node:test";

import {
  isExecutableRegisteredAction,
  isWorkflowReadyForReview,
  type AssistantDecision,
  type RegisteredAction,
  type WorkflowPlan,
} from "../src/workflow/workflow-contracts.js";

const registeredAction: RegisteredAction = {
  key: "linux.memory",
  vendor: "linux",
  platforms: ["linux"],
  mode: "read",
  executionType: "direct",
  parameterSchema: {},
  risk: "low",
  approvalRequired: true,
  executable: true,
  connector: "linux-ssh",
  verificationKey: "linux.memory",
};

const readyWorkflow: WorkflowPlan = {
  id: "wf-1",
  title: "Check Linux memory",
  deviceId: "device-1",
  vendor: "linux",
  platform: "linux",
  state: "ready_for_review",
  risk: "low",
  rawCommandExecution: false,
  approval: { required: true, status: "pending", requestedBy: "operator" },
  audit: [],
  steps: [{
    id: "step-1",
    clientStepId: "client-step-1",
    intentKey: "linux.memory",
    actionKey: "linux.memory",
    state: "ready",
    parameters: {},
    dependsOn: [],
    missingParameters: [],
    verificationIntentKey: "linux.memory",
  }],
};

test("assistant decisions never carry raw command execution", () => {
  const decisions: AssistantDecision[] = [
    { mode: "chat", message: "سلام", reason: "conversation", rawCommandExecution: false },
    { mode: "direct_action", deviceId: "device-1", intentKey: "linux.memory", parameters: {}, reason: "supported", rawCommandExecution: false },
    { mode: "guided_workflow", deviceId: "device-1", title: "Restart and verify", reason: "multi-step", rawCommandExecution: false, steps: [{ clientStepId: "s1", intentKey: "linux.service-status", parameters: {}, dependsOn: [] }] },
  ];

  assert.ok(decisions.every((decision) => decision.rawCommandExecution === false));
  assert.doesNotMatch(JSON.stringify(decisions).toLowerCase(), /rawcli|shellcommand|ai_generated_command/);
});

test("registered actions are executable only with an explicit connector", () => {
  assert.equal(isExecutableRegisteredAction(registeredAction), true);
  assert.equal(isExecutableRegisteredAction({ ...registeredAction, connector: "" }), false);
  assert.equal(isExecutableRegisteredAction({ ...registeredAction, executable: false }), false);
});

test("workflow review readiness requires ready non-blocked steps with complete parameters", () => {
  assert.equal(isWorkflowReadyForReview(readyWorkflow), true);
  assert.equal(isWorkflowReadyForReview({ ...readyWorkflow, state: "draft" }), false);
  assert.equal(isWorkflowReadyForReview({ ...readyWorkflow, steps: [{ ...readyWorkflow.steps[0], missingParameters: ["serviceName"] }] }), false);
  assert.equal(isWorkflowReadyForReview({ ...readyWorkflow, steps: [{ ...readyWorkflow.steps[0], state: "blocked", blockedReason: "unsupported" }] }), false);
});
