import assert from "node:assert/strict";
import test from "node:test";
import { COMMAND_CATALOG, searchCatalog } from "../src/commands/catalog/index.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

test("starter catalog loads and Persian search plus vendor filters work", () => {
  assert.ok(COMMAND_CATALOG.length >= 30);
  assert.ok(searchCatalog({ q: "پورت‌های باز" }).some((item) => item.id === "linux.open-ports"));
  const mikrotik = searchCatalog({ vendor: "mikrotik" });
  assert.ok(mikrotik.length >= 8);
  assert.ok(mikrotik.every((item) => item.vendor === "mikrotik"));
});

test("catalog creates a proposed ActionPlan and AI fallback never executes", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: { name: "Task 14 Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.14", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } }); await prisma.device.delete({ where: { id: device.id } }); await app.close(); });

  const created = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.open-ports/create-action-plan", payload: { deviceId: device.id, params: {} } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().status, "proposed");
  assert.equal(created.json().parametersJson.metadata.catalogCommandId, "linux.open-ports");
  const actionCenter = await app.inject({ method: "GET", url: "/api/actions" });
  assert.equal(actionCenter.statusCode, 200);
  assert.ok(actionCenter.json().actions.some((plan: { id: string }) => plan.id === created.json().id));

  const aiDraft = await app.inject({ method: "POST", url: "/api/commands/ai-propose", payload: { request: "یک بررسی سفارشی بساز", vendor: "linux", deviceId: device.id, createActionPlan: false } });
  assert.equal(aiDraft.statusCode, 201);
  assert.equal(aiDraft.json().draft.autoExecuted, false);
  assert.equal(aiDraft.json().actionPlan, null);
});
