import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyExecutionResultState } from "../src/actions/action-plan/execution-result-state.js";

test("Phase H result state distinguishes verified, unverified, partial, and failed outcomes", () => {
  assert.equal(classifyExecutionResultState({ connectorInvoked: true, executionSucceeded: true, verificationOk: true, verificationEvidenceCount: 1 }), "succeeded_verified");
  assert.equal(classifyExecutionResultState({ connectorInvoked: true, executionSucceeded: true, verificationOk: true, verificationEvidenceCount: 0 }), "succeeded_unverified");
  assert.equal(classifyExecutionResultState({ connectorInvoked: true, executionSucceeded: false, verificationOk: false, verificationEvidenceCount: 0, commandExitCodes: [0, 1] }), "partially_succeeded");
  assert.equal(classifyExecutionResultState({ connectorInvoked: false, executionSucceeded: true, verificationOk: true, verificationEvidenceCount: 1 }), "failed");
});

test("Phase H approval binding persists hashes, target identity, risk version, and expiration", () => {
  const approvalService = readFileSync(new URL("../src/actions/action-plan/action-plan-approval.service.ts", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../src/actions/action-plan/action-plan.shared.ts", import.meta.url), "utf8");
  assert.match(shared, /ACTION_APPROVAL_BINDING_VERSION/);
  for (const field of ["planHash", "deviceId", "vendor", "platform", "parametersHash", "generatedStepsHash", "riskVersion", "expiresAt"]) {
    assert.match(shared, new RegExp(field));
  }
  assert.match(approvalService, /buildApprovalBinding/);
  assert.match(approvalService, /approvalBinding/);
  assert.match(approvalService, /approvedBinding/);
});

test("Phase H execution results persist result state, approval binding, and verification evidence", () => {
  const execution = readFileSync(new URL("../src/actions/action-plan/action-plan-execution.service.ts", import.meta.url), "utf8");
  assert.match(execution, /classifyExecutionResultState/);
  assert.match(execution, /resultPayload\.resultState = resultState/);
  assert.match(execution, /resultPayload\.approvalBinding/);
  assert.match(execution, /verificationEvidenceCount/);
  assert.match(execution, /execution_result_state_recorded/);
  assert.match(execution, /resultState:\s*"failed"/);
});
