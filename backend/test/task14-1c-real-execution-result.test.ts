import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ActionPlanStatus, ActionType } from "@prisma/client";
import { actionExecutionUiState } from "../../src/lib/actionApprovalState.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { actionExecutionFingerprint, dryRunActionPlan, quickExecuteActionPlan } from "../src/services/action-plan.service.js";
import type { DeviceConnector } from "../src/connectors/types.js";
import { createCredential } from "../src/services/credential.service.js";
import { createAiActionIntent, parseAiIntent } from "../src/services/ai-intent.service.js";
import { proposeActionPlan } from "../src/services/action-plan.service.js";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("Linux prepared commands use real controlled SSH templates", () => {
  const connector = read("../src/connectors/linux-ssh.connector.ts");
  assert.match(connector, /ss -lntup \|\| netstat -lntup/);
  assert.match(connector, /systemctl is-active ssh \|\| systemctl is-active sshd \|\| service ssh status/);
  assert.match(connector, /journalctl -u ssh -u sshd --since '24 hours ago'.*auth\.log/);
  assert.match(connector, /getent group sudo; getent group wheel; awk -F:/);
  assert.match(connector, /ufw status verbose \|\| .*nft list ruleset \|\| .*iptables -S/);
  assert.match(connector, /buildLinuxServiceStatusCommand\(service\)/);
});

test("dry_run_ready remains a preview and never counts as execution", () => {
  const state = actionExecutionUiState({ id: "preview", source: "user", requestedBy: null, deviceId: "device", aiIntentId: null, actionType: "linux_check_sudo_users", status: ActionPlanStatus.dry_run_ready, riskLevel: "low", parametersJson: { executionSupport: "connector", metadata: { source: "command_catalog", implementationState: "implemented", executionTemplateRef: "linux_check_sudo_users", executed: false } }, validationJson: { valid: true, errors: [], missingFields: [] }, dryRunJson: { status: "planned" }, approvalJson: {}, resultJson: {}, rollbackJson: {}, createdAt: "", updatedAt: "" });
  assert.equal(state.canExecute, true);
  assert.notEqual(ActionPlanStatus.dry_run_ready, ActionPlanStatus.succeeded);
});

test("manual catalog actions cannot expose execute and successful UI navigates to result", () => {
  const state = actionExecutionUiState({ id: "manual", source: "user", requestedBy: null, deviceId: "device", aiIntentId: null, actionType: ActionType.generic_security_action, status: ActionPlanStatus.proposed, riskLevel: "medium", parametersJson: { executionSupport: "manual_or_not_implemented", metadata: { source: "command_catalog", implementationState: "manualOnly", executed: false } }, validationJson: {}, dryRunJson: {}, approvalJson: {}, resultJson: {}, rollbackJson: {}, createdAt: "", updatedAt: "" });
  assert.equal(state.canExecute, false);
  const center = read("../../src/components/actions/ActionCenterPanel.tsx");
  const result = read("../../src/components/actions/ActionResultView.tsx");
  assert.match(center, /navigate\(actionResultUrl\(plan\.id\)\)/);
  assert.match(center, /actionResultUrl\(plan\.id\)/);
  assert.match(center, /disabled=\{Boolean\(working\)/);
  assert.match(result, /نتیجه اجرای دستور/);
  assert.match(result, /خروجی خام/);
  assert.match(result, /formatActionResult/);
});

test("backend stores actual connector result before succeeded", () => {
  const service = read("../src/services/action-plan.service.ts");
  assert.match(service, /serviceStatusReadSucceeded \|\| \(result\.executed && result\.commands\.length > 0/);
  assert.match(service, /status: verification\.ok \? ActionPlanStatus\.succeeded : ActionPlanStatus\.failed/);
  assert.match(service, /stdout: result\.commands\.map/);
  assert.match(service, /executor: connector\.name/);
});

test("generated preview metadata never changes the stable execution fingerprint", () => {
  const base = { actionType: ActionType.linux_check_sudo_users, deviceId: "device-1", parametersJson: { vendor: "linux", metadata: { catalogCommandId: "linux.sudo-users", executionTemplateRef: "linux_check_sudo_users", vendor: "linux", normalizedParams: {} } } };
  const generated = { ...base, parametersJson: { ...base.parametersJson, metadata: { ...base.parametersJson.metadata, previewGenerated: true, executed: false, lastExecutionStatus: "preview_ready", previewStale: false, executionStartedAt: new Date().toISOString() } } };
  assert.equal(actionExecutionFingerprint(base as never), actionExecutionFingerprint(generated as never));
});

test("explicit execute invokes a fake Linux connector exactly once and persists its stdout", async (t) => {
  const app = await buildApp({ authRequired: false });
  let executeCalls = 0;
  const traceStages: string[] = [];
  const credential = await createCredential({ name: `task-14-1d-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: false });
  const device = await prisma.device.create({ data: { name: "Task 14.1D fake Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.201", managementPort: 22, protocol: "ssh", environment: "lab", credentialId: credential.id } });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
    await app.close();
  });

  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.sudo-users/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(created.statusCode, 201);
  assert.equal(executeCalls, 0);

  const preview = await dryRunActionPlan(created.json().id);
  assert.equal(preview?.status, ActionPlanStatus.dry_run_ready);
  assert.equal(executeCalls, 0);

  const fakeConnector = {
    name: "linux_edge",
    supportedActions: [ActionType.linux_check_sudo_users],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async () => {
      executeCalls += 1;
      return { executed: true, actionType: ActionType.linux_check_sudo_users, deviceId: device.id, commands: [{ template: "sudo users", stdout: "sudo:x:27:alice\nwheel:x:10:bob\nroot", stderr: "", exitCode: 0 }], warnings: [] };
    }
  } as unknown as DeviceConnector;

  const executed = await quickExecuteActionPlan(created.json().id, { intent: "execute" }, { selectConnector: () => fakeConnector, trace: (stage) => traceStages.push(stage) });
  assert.equal(executeCalls, 1);
  assert.equal(executed?.status, ActionPlanStatus.succeeded);
  assert.equal((executed?.parametersJson as Record<string, { connectorInvoked?: boolean }>).metadata.connectorInvoked, true);
  assert.match(String((executed?.resultJson as Record<string, unknown>).stdout), /sudo:x:27:alice/);

  for (const stage of ["action_execute_requested", "action_catalog_resolved", "action_preview_checked", "action_policy_guard_passed", "action_connector_resolved", "action_connector_invoked", "action_remote_command_started", "action_remote_command_completed", "action_execution_result_saved", "action_execution_succeeded"]) {
    assert.ok(traceStages.includes(stage), `missing trace stage ${stage}`);
  }
});

test("Persian AI sudo removal extracts tavakoli and missing input asks only for username", () => {
  const parsed = parseAiIntent("کاربر tavakoli رو از sudo خارج کن");
  assert.equal(parsed?.intentType, ActionType.linux_remove_user_from_sudo);
  assert.equal(parsed?.parameters.username, "tavakoli");
  assert.equal(parsed?.parameters.executionSupport, "connector");

  const missing = parseAiIntent("یک کاربر را از sudo خارج کن");
  assert.deepEqual(missing?.parameters.missingFields, ["username"]);
  assert.deepEqual(missing?.parameters.clarificationQuestions, ["نام کاربر لینوکس چیست؟"]);
});

test("AI-created destructive Linux action stays connector-executable and runs once in unrestricted lab", async (t) => {
  const credential = await createCredential({ name: `task-14-1e-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: true });
  const device = await prisma.device.create({ data: { name: "Task 14.1E AI Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.202", managementPort: 22, protocol: "ssh", environment: "lab", credentialId: credential.id } });
  const session = await prisma.aiChatSession.create({ data: { title: "Task 14.1E" } });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.aiActionIntent.deleteMany({ where: { sessionId: session.id } });
    await prisma.aiChatSession.delete({ where: { id: session.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
  });

  const parsed = parseAiIntent("کاربر tavakoli رو از sudo خارج کن");
  assert.ok(parsed);
  const intent = await createAiActionIntent({ sessionId: session.id, deviceId: device.id, parsedIntent: parsed });
  const plan = await proposeActionPlan({ aiIntentId: intent.id });
  const metadata = (plan.parametersJson as Record<string, Record<string, unknown>>).metadata;

  assert.equal(plan.actionType, ActionType.linux_remove_user_from_sudo);
  assert.equal((plan.parametersJson as Record<string, unknown>).executionSupport, "connector");
  assert.equal(metadata.implementationState, "implemented");
  assert.equal(metadata.executionTemplateRef, "linux_remove_user_from_sudo");

  let calls = 0;
  const fake = {
    name: "linux_edge",
    supportedActions: [ActionType.linux_remove_user_from_sudo],
    supports: () => true,
    testConnection: async () => { throw new Error("unused"); },
    getCapabilities: async () => { throw new Error("unused"); },
    collectStatus: async () => { throw new Error("unused"); },
    dryRun: async () => { throw new Error("unused"); },
    rollback: async () => { throw new Error("unused"); },
    execute: async () => {
      calls += 1;
      return { executed: true, actionType: ActionType.linux_remove_user_from_sudo, deviceId: device.id, commands: [{ template: "remove user from sudo", stdout: "Removing user tavakoli from group sudo\ntavakoli : tavakoli", stderr: "", exitCode: 0 }], warnings: [] };
    }
  } as unknown as DeviceConnector;

  const result = await quickExecuteActionPlan(plan.id, { intent: "execute" }, { selectConnector: () => fake });
  assert.equal(calls, 1);
  assert.equal(result?.status, ActionPlanStatus.succeeded);
  assert.equal((result?.parametersJson as Record<string, Record<string, unknown>>).metadata.connectorInvoked, true);
});
