import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { resolveCatalogAction } from "../src/commands/catalog/catalog-action-resolver.js";

test("catalog ActionPlan persists the complete executable metadata contract", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 14.1B Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.151", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); await app.close(); });
  const response = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.ssh-status/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(response.statusCode, 201);
  const plan = response.json(); const metadata = plan.parametersJson.metadata;
  assert.equal(plan.actionType, "linux_check_ssh_status");
  assert.equal(metadata.catalogCommandId, "linux.ssh-status");
  assert.ok(metadata.catalogVersion); assert.equal(metadata.vendor, "linux"); assert.equal(metadata.actionType, plan.actionType);
  assert.equal(metadata.executionSupport, "connector"); assert.equal(metadata.implementationState, "implemented");
  assert.equal(metadata.executionTemplateRef, "linux_check_ssh_status"); assert.equal(metadata.connectorType, "linux-ssh");
  assert.equal(metadata.source, "command_catalog"); assert.deepEqual(metadata.normalizedParams, {}); assert.equal(metadata.requiredParamsSatisfied, true);
  assert.equal(resolveCatalogAction(plan, device).matched, true);
});

test("quick execute resolves product catalog metadata and never returns ACTION_NOT_IN_CATALOG", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 14.1B quick", vendor: "Linux", type: "linux_edge", host: "192.0.2.152", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); await app.close(); });
  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.ssh-status/create-action-plan", payload: { deviceId: device.id, params: {} } });
  const quick = await app.inject({ method: "POST", url: `/api/actions/${created.json().id}/quick-execute`, payload: { intent: "execute", reason: "integration test" } });
  assert.notEqual(quick.json().error, "ACTION_NOT_IN_CATALOG");
  assert.ok([200, 409].includes(quick.statusCode));
});

test("manualOnly cannot quick execute and missing params do not create plans", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 14.1B guarded", vendor: "Linux", type: "linux_edge", host: "192.0.2.153", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); await app.close(); });
  const before = await prisma.actionPlan.count({ where: { deviceId: device.id } });
  const missing = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.block-ip/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(missing.statusCode, 422); assert.equal(missing.json().needsInput, true); assert.equal(await prisma.actionPlan.count({ where: { deviceId: device.id } }), before);
  const manual = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.enable-fail2ban/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(manual.statusCode, 201);
  const quick = await app.inject({ method: "POST", url: `/api/actions/${manual.json().id}/quick-execute`, payload: { intent: "execute" } });
  assert.equal(quick.statusCode, 409); assert.equal(quick.json().error, "CATALOG_COMMAND_NOT_VERIFIED");
});

test("frontend publishes selection, updates URL, and Action Center opens selected plan", () => {
  const catalog = readFileSync(new URL("../../src/components/commands/CommandCatalogPanel.tsx", import.meta.url), "utf8");
  const center = readFileSync(new URL("../../src/components/actions/ActionCenterPanel.tsx", import.meta.url), "utf8");
  const uiState = readFileSync(new URL("../../src/lib/actionApprovalState.ts", import.meta.url), "utf8");
  assert.match(catalog, /searchParams\.set\("selected", plan\.id\)/); assert.match(catalog, /publishActionPlanCreated\(plan\.id\)/); assert.match(catalog, /reviewInActionCenter/);
  assert.match(center, /URLSearchParams\(window\.location\.search\)\.get\("selected"\)/); assert.match(center, /refreshActions\(id\)/); assert.match(center, /setSelectedAction\(plan\)/);
  assert.match(uiState, /supportState !== "verified"/); assert.match(uiState, /executionSupport !== "connector"/);
});
