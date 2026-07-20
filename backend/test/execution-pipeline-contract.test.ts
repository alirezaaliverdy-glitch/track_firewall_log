import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionPlanStatus, ActionType } from "@prisma/client";
import type { DeviceConnector } from "../src/connectors/types.js";

const actionPlanService = readFileSync(new URL("../src/services/action-plan.service.ts", import.meta.url), "utf8");
const actionCenterService = readFileSync(new URL("../src/services/action-center.service.ts", import.meta.url), "utf8");
const actionCenterClient = readFileSync(new URL("../../src/lib/actionCenter.ts", import.meta.url), "utf8");

function fakeLinuxConnector(deviceId: string, commands: Array<{ template: string; stdout: string; stderr: string; exitCode: number | null }>) {
  return {
    name: "linux_edge",
    supportedActions: [ActionType.linux_check_sudo_users],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async () => ({ executed: true, actionType: ActionType.linux_check_sudo_users, deviceId, commands, warnings: [] })
  } as unknown as DeviceConnector;
}

test("execution service resolves template, connector, validation, execution, verification, and audit phases", () => {
  for (const token of [
    "resolveExecutionPipeline",
    "getExecutionTemplate",
    "getDeviceConnectors",
    "template_resolved",
    "connector_contract_resolved",
    "validation_resolved",
    "post_execution_verification_passed",
    "post_execution_verification_failed",
    "rawCommandExecution: false"
  ]) assert.match(actionPlanService, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Action Center recognizes skipped dependent-step lifecycle without a schema status rewrite", () => {
  assert.match(actionCenterService, /result\.status === "skipped" \|\| result\.outcome === "skipped"/);
  assert.match(actionCenterClient, /"skipped"/);
});

test("quick execution persists six-phase evidence only after connector verification passes", async (t) => {
  if (!process.env.TEST_DATABASE_URL) {
    t.skip("TEST_DATABASE_URL is required for DB-backed execution pipeline checks.");
    return;
  }
  const [{ buildApp }, { prisma }, { createCredential }, { quickExecuteActionPlan }] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/prisma.js"),
    import("../src/services/credential.service.js"),
    import("../src/services/action-plan.service.js")
  ]);
  const app = await buildApp({ authRequired: false });
  const credential = await createCredential({ name: `execution-pipeline-ok-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: false });
  const device = await prisma.device.create({ data: { name: "Execution Pipeline Linux OK", vendor: "Linux", type: "linux_edge", host: "192.0.2.221", managementPort: 22, protocol: "ssh", environment: "lab", credentialId: credential.id } });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
    await app.close();
  });

  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.sudo-users/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(created.statusCode, 201);

  const executed = await quickExecuteActionPlan(created.json().id, { intent: "execute" }, {
    selectConnector: () => fakeLinuxConnector(device.id, [{ template: "sudo users", stdout: "sudo:x:27:alice", stderr: "", exitCode: 0 }])
  });

  assert.equal(executed?.status, ActionPlanStatus.succeeded);
  const result = executed?.resultJson as Record<string, unknown>;
  const evidence = result.executionEvidence as Record<string, Record<string, unknown>>;
  assert.equal((result.verification as Record<string, unknown>).ok, true);
  assert.equal(evidence.template.status, "resolved");
  assert.equal(evidence.connector.status, "invoked");
  assert.equal(evidence.validation.status, "passed");
  assert.equal(evidence.execution.status, "success");
  assert.equal(evidence.verification.status, "passed");
  assert.equal(evidence.audit.status, "recorded");

  const audit = await prisma.actionAuditLog.findMany({ where: { actionPlanId: executed!.id }, select: { eventType: true } });
  const events = new Set(audit.map((entry) => entry.eventType));
  for (const event of ["template_resolved", "connector_contract_resolved", "validation_resolved", "connector_invoked", "post_execution_verification_passed", "execution_succeeded"]) {
    assert.ok(events.has(event), `missing audit event ${event}`);
  }
});

test("quick execution fails closed when connector returns no execution evidence", async (t) => {
  if (!process.env.TEST_DATABASE_URL) {
    t.skip("TEST_DATABASE_URL is required for DB-backed execution pipeline checks.");
    return;
  }
  const [{ buildApp }, { prisma }, { createCredential }, { quickExecuteActionPlan }] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/prisma.js"),
    import("../src/services/credential.service.js"),
    import("../src/services/action-plan.service.js")
  ]);
  const app = await buildApp({ authRequired: false });
  const credential = await createCredential({ name: `execution-pipeline-fail-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: false });
  const device = await prisma.device.create({ data: { name: "Execution Pipeline Linux Fail", vendor: "Linux", type: "linux_edge", host: "192.0.2.222", managementPort: 22, protocol: "ssh", environment: "lab", credentialId: credential.id } });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
    await app.close();
  });

  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.sudo-users/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(created.statusCode, 201);

  const executed = await quickExecuteActionPlan(created.json().id, { intent: "execute" }, {
    selectConnector: () => fakeLinuxConnector(device.id, [])
  });

  assert.equal(executed?.status, ActionPlanStatus.failed);
  const result = executed?.resultJson as Record<string, unknown>;
  const evidence = result.executionEvidence as Record<string, Record<string, unknown>>;
  assert.equal((result.verification as Record<string, unknown>).ok, false);
  assert.equal(evidence.execution.status, "failed");
  assert.equal(evidence.verification.status, "failed");

  const audit = await prisma.actionAuditLog.findMany({ where: { actionPlanId: executed!.id }, select: { eventType: true } });
  assert.ok(audit.some((entry) => entry.eventType === "post_execution_verification_failed"));
});
