import assert from "node:assert/strict";
import test from "node:test";
import { ActionPlanStatus } from "@prisma/client";
import type { DeviceConnector } from "../src/connectors/types.js";
import { buildApp } from "../src/app.js";
import { COMMAND_CATALOG } from "../src/commands/catalog/index.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { firewalldHasPort, parseIptablesAllowRuleNumbers, parseNftAllowRules, parseUfwAllowRuleNumbers } from "../src/connectors/linux-ssh.connector.js";
import { prisma } from "../src/db/prisma.js";
import { actionExecutionFingerprint, approveActionPlan, dryRunActionPlan, proposeActionPlan, quickExecuteActionPlan } from "../src/services/action-plan.service.js";

test("Task 19.1 close-port capability has one verified catalog/template/connector contract", () => {
  const item = COMMAND_CATALOG.find((entry) => entry.id === "linux.close-port");
  assert.ok(item);
  assert.equal(item.actionType, "close_port");
  assert.equal(item.supportState, "verified");
  assert.equal(item.executionSupport, "connector");
  assert.equal(item.connectorType, "linux-ssh");
  assert.equal(item.executionTemplateRef, "linux_close_port");
  assert.deepEqual(getExecutionTemplate("linux_close_port"), { id: "linux_close_port", actionType: "close_port", connectorType: "linux-ssh", handler: "linuxEdgePlanner" });
});

test("Task 19.1 canonical fingerprint normalizes values and ignores operational metadata", () => {
  const base = { actionType: "close_port", deviceId: "linux-1", riskLevel: "medium", parametersJson: { port: "545", protocol: "TCP", scopes: ["b", "a"], metadata: { resolvedVendor: "linux", resolvedPlatform: "linux_edge", capabilityKey: "linux.close-port", catalogCommandId: "linux.close-port", executionTemplateRef: "linux_close_port", connectorType: "linux-ssh" } } };
  const equivalent = { ...base, parametersJson: { ...base.parametersJson, port: 545, protocol: "tcp", scopes: ["a", "b"], metadata: { ...base.parametersJson.metadata, connectorInvoked: true, executionStartedAt: new Date().toISOString(), planState: "executing" } } };
  assert.equal(actionExecutionFingerprint(base as never), actionExecutionFingerprint(equivalent as never));
});

test("Task 19.1 firewall adapter parsers identify only matching effective allow rules", () => {
  assert.deepEqual(parseUfwAllowRuleNumbers("[ 1] 545/tcp ALLOW IN Anywhere\n[ 7] 545/tcp ALLOW IN 192.0.2.0/24\n[ 9] 545/udp ALLOW IN Anywhere", 545, "tcp"), [7, 1]);
  assert.equal(firewalldHasPort("22/tcp 545/tcp 53/udp", 545, "tcp"), true);
  assert.deepEqual(parseIptablesAllowRuleNumbers("1 ACCEPT tcp -- 0.0.0.0/0 0.0.0.0/0 tcp dpt:545\n2 DROP tcp -- 0.0.0.0/0 0.0.0.0/0 tcp dpt:545", 545, "tcp"), [1]);
  assert.deepEqual(parseNftAllowRules("table inet filter {\n chain input {\n tcp dport 545 accept # handle 12\n udp dport 545 accept # handle 13\n }\n}", 545, "tcp"), [{ family: "inet", table: "filter", chain: "input", handle: 12 }]);
});

test("Task 19.1 stale approved inputs automatically regenerate and execute the newest revision", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 19.1 revision Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.219", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); await app.close(); });

  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.close-port/create-action-plan", payload: { deviceId: device.id, params: { port: 545, protocol: "tcp" } } });
  assert.equal(created.statusCode, 201);
  const preview = await dryRunActionPlan(created.json().id);
  assert.equal(preview?.status, ActionPlanStatus.dry_run_ready);
  const previewMetadata = (preview?.parametersJson as { metadata: Record<string, unknown> }).metadata;
  assert.equal(previewMetadata.planRevision, 1);
  assert.equal(previewMetadata.planState, "preview_ready");
  for (const field of ["canonicalParameters", "canonicalParametersHash", "canonicalPayloadHash", "previewHash", "resolvedVendor", "resolvedPlatform", "catalogCommandId", "executionTemplateRef", "connectorType", "idempotencyKey"]) assert.ok(previewMetadata[field], field);

  await approveActionPlan(created.json().id, { approvedBy: "task19-admin-approver", approvedByRole: "admin", reason: "Task 19.1 revision test" });
  const approved = await prisma.actionPlan.findUniqueOrThrow({ where: { id: created.json().id } });
  const approvedMetadata = (approved.parametersJson as { metadata: Record<string, unknown> }).metadata;
  assert.equal(approvedMetadata.approvedRevision, 1);
  assert.equal(approvedMetadata.planState, "approved");

  await prisma.actionPlan.update({ where: { id: approved.id }, data: { parametersJson: { ...(approved.parametersJson as object), port: 546 } } });
  let connectorCalls = 0;
  const fakeConnector = {
    name: "linux-ssh",
    supportedActions: ["close_port"],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async () => {
      connectorCalls += 1;
      return { executed: true, actionType: "close_port", deviceId: device.id, commands: [{ template: "close port 546", stdout: "verified closed", stderr: "", exitCode: 0 }], warnings: [], verification: { outcome: "completed" } };
    },
  } as unknown as DeviceConnector;

  const revised = await quickExecuteActionPlan(approved.id, { intent: "execute", actionPlanRevision: 1 }, { selectConnector: () => fakeConnector });
  assert.equal(connectorCalls, 1);
  assert.equal(revised?.status, ActionPlanStatus.succeeded);
  const revisedMetadata = (revised?.parametersJson as { metadata: Record<string, unknown> }).metadata;
  assert.equal(revisedMetadata.planRevision, 2);
  assert.equal(revisedMetadata.approvedRevision, 2);
  assert.equal(revisedMetadata.executingRevision, 2);
  assert.equal(revisedMetadata.planState, "completed");
  assert.equal(revisedMetadata.previewStale, false);
  assert.equal(revisedMetadata.staleReason, null);
  assert.equal(revisedMetadata.connectorInvoked, true);
  const audit = await prisma.actionAuditLog.findMany({ where: { actionPlanId: approved.id }, select: { eventType: true } });
  assert.ok(audit.some((entry) => entry.eventType === "action_revision_regenerated"));
  assert.ok(audit.some((entry) => entry.eventType === "action_revision_ready"));
  assert.ok(!audit.some((entry) => entry.eventType === "execution_failed"));
});

test("Task 19.1 repeated verified desired state reuses one ActionPlan", async (t) => {
  const device = await prisma.device.create({ data: { name: "Task 19.1 idempotent Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.220", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); });
  const first = await proposeActionPlan({ source: "ai", deviceId: device.id, vendor: "linux", actionType: "close_port", riskLevel: "medium", parametersJson: { port: 545, protocol: "tcp" } });
  const parameters = first.parametersJson as Record<string, unknown>;
  await prisma.actionPlan.update({ where: { id: first.id }, data: { status: "succeeded", parametersJson: { ...parameters, metadata: { ...((parameters.metadata as object) ?? {}), connectorInvoked: true } }, resultJson: { executed: true, connectorInvoked: true, outcome: "verified_no_change" } } });
  const repeated = await proposeActionPlan({ source: "ai", deviceId: device.id, vendor: "linux", actionType: "close_port", riskLevel: "medium", parametersJson: { port: 545, protocol: "tcp" } });
  assert.equal(repeated.id, first.id);
  assert.equal(await prisma.actionPlan.count({ where: { deviceId: device.id, actionType: "close_port" } }), 1);
});
