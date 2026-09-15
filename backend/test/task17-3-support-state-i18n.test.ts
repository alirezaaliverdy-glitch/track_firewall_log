import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { COMMAND_CATALOG, searchCatalog } from "../src/commands/catalog/index.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

test("catalog support state is authoritative and executable means verified", () => {
  const verified = COMMAND_CATALOG.filter((item) => item.supportState === "verified");
  assert.ok(verified.length > 0);
  assert.ok(verified.every((item) => item.uiHints.executable && item.executionSupport === "connector"));
  assert.ok(COMMAND_CATALOG.filter((item) => item.supportState !== "verified").every((item) => !item.uiHints.executable && item.executionSupport !== "connector"));
  assert.ok(searchCatalog({ executable: true }).every((item) => item.supportState === "verified"));
  assert.equal(COMMAND_CATALOG.find((item) => item.actionType === "fortigate_guided_vpn_setup")?.supportState ?? "preview_only", "preview_only");
  assert.ok(COMMAND_CATALOG.some((item) => item.vendor === "fortigate" && item.implementationState === "implemented" && item.supportState === "preview_only"));
});

test("non-verified catalog ActionPlan is rejected before connector execution", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 17.3 FortiGate Preview", vendor: "Fortinet", type: "fortigate", host: "192.0.2.183", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });

  const preview = COMMAND_CATALOG.find((item) => item.vendor === "fortigate" && item.supportState === "preview_only");
  assert.ok(preview, "expected at least one preview-only FortiGate item");
  const params = Object.fromEntries(preview.requiredParams.map((field) => [field.key, field.type === "number" ? 1 : field.type === "ip" ? "192.0.2.10" : field.type === "cidr" ? "192.0.2.0/24" : "test_value"]));
  const created = await app.inject({ method: "POST", url: `/api/commands/catalog/${preview.id}/create-action-plan`, payload: { deviceId: device.id, params } });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().parametersJson.metadata.supportState, "preview_only");

  const quick = await app.inject({ method: "POST", url: `/api/actions/${created.json().id}/quick-execute`, payload: { intent: "execute" } });
  assert.equal(quick.statusCode, 409, quick.body);
  assert.equal(quick.json().error, "CATALOG_COMMAND_NOT_VERIFIED");
  const stored = await prisma.actionPlan.findUnique({ where: { id: created.json().id } });
  assert.notEqual((stored?.parametersJson as Record<string, unknown>)?.metadata && ((stored?.parametersJson as Record<string, unknown>).metadata as Record<string, unknown>).connectorInvoked, true);
});

test("verified action can create a reviewable ActionPlan", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 17.3 Linux Verified", vendor: "Linux", type: "linux_edge", host: "192.0.2.184", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });
  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.open-ports/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().parametersJson.metadata.supportState, "verified");
  assert.equal(created.json().parametersJson.metadata.executable, true);
});

test("AI route creates structured ActionPlans without raw executable CLI", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 17.3 AI Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.185", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });
  const response = await app.inject({ method: "POST", url: "/api/commands/ai-propose", payload: { request: "show open ports && rm -rf /", selectedDeviceId: device.id, selectedVendor: "linux" } });
  assert.ok([200, 201].includes(response.statusCode), response.body);
  if (response.json().actionPlan) {
    assert.equal(response.json().actionPlan.parametersJson.metadata.supportState, "verified");
    assert.equal(response.json().actionPlan.dryRunJson, null);
    assert.doesNotMatch(JSON.stringify(response.json().actionPlan.parametersJson), /rm -rf|&&/);
  }
});

test("frontend source has action-library route, dashboard shortcut, filters, and locale direction", () => {
  const app = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
  const library = readFileSync(new URL("../../src/components/commands/CommandCatalogPanel.tsx", import.meta.url), "utf8");
  const assistant = readFileSync(new URL("../../src/components/ai/AiSecurityAssistantPanel.tsx", import.meta.url), "utf8");
  const actionState = readFileSync(new URL("../../src/lib/actionApprovalState.ts", import.meta.url), "utf8");
  const actionCenter = readFileSync(new URL("../../src/components/actions/ActionCenterPanel.tsx", import.meta.url), "utf8");
  const i18n = readFileSync(new URL("../../src/i18n/index.ts", import.meta.url), "utf8");
  assert.match(app, /\/action-library/);
  assert.match(app, /dashboard\.shortcuts\.library/);
  assert.match(library, /const VENDORS = \["fortigate", "mikrotik", "linux", "cisco", "pfsense", "generic"\]/);
  assert.match(library, /supportState/);
  assert.match(library, /catalogBlueprintId\(item\)/);
  assert.match(library, /guidedBlueprintId/);
  assert.doesNotMatch(library, /expanded && item\.requiredParams/);
  assert.match(assistant, /canOfferGuidedStart/);
  assert.match(assistant, /guidedStart && <button[^>]*onClick=\{startGuidedWorkflow\}/);
  assert.doesNotMatch(assistant, /response\.actionSessionId[\s\S]*navigate/);
  const actionCenterModel = readFileSync(new URL("../../src/features/actions/actionCenterModel.tsx", import.meta.url), "utf8");
  assert.match(`${actionCenter}\n${actionCenterModel}`, /Backup is disabled for Quick Controlled execution\./);
  assert.doesNotMatch(actionState, /The action changed after its preview/);
  assert.doesNotMatch(actionCenter, /backup\/export preflight required/i);
  assert.match(i18n, /document\.documentElement\.dir = locale === "fa" \? "rtl" : "ltr"/);
  assert.match(i18n, /localStorage/);
});
