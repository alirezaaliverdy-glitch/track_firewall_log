import assert from "node:assert/strict";
import test from "node:test";
import { ActionType } from "@prisma/client";
import { COMMAND_CATALOG, searchCatalog } from "../src/commands/catalog/index.js";
import { validateCommandCatalog } from "../src/commands/catalog/command-catalog-validator.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

test("strict catalog contract validates every item", () => {
  assert.deepEqual(validateCommandCatalog(COMMAND_CATALOG), { valid: true, count: COMMAND_CATALOG.length });
  for (const item of COMMAND_CATALOG) {
    assert.ok(item.actionType in ActionType, item.id);
    for (const field of item.requiredParams) { assert.ok(field.labelFa, `${item.id}:${field.key}:label`); assert.ok(field.helpFa, `${item.id}:${field.key}:help`); }
    if (item.mutating) assert.equal(item.requiresConfirmation, true, item.id);
    if (item.implementationState === "implemented") assert.ok(getExecutionTemplate(item.executionTemplateRef), item.id);
    if (["planned", "unsupported"].includes(item.implementationState)) assert.equal(item.uiHints.executable, false, item.id);
  }
});

test("Persian search, vendor filtering, and planned hiding are deterministic", () => {
  assert.ok(searchCatalog({ q: "پورت‌های باز" }).some((item) => item.id === "linux.open-ports"));
  assert.ok(searchCatalog({ vendor: "mikrotik" }).every((item) => item.vendor === "mikrotik"));
  assert.equal(searchCatalog({ vendor: "linux" }).some((item) => item.vendor === "mikrotik"), false);
  assert.equal(searchCatalog({}).some((item) => item.implementationState === "planned"), false);
});

test("missing parameters return needsInput and never create broken plans", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({ data: { name: "Task 14.1 Linux needs input", vendor: "Linux", type: "linux_edge", host: "192.0.2.141", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: linux.id } }); await prisma.device.delete({ where: { id: linux.id } }); await app.close(); });
  const before = await prisma.actionPlan.count({ where: { deviceId: linux.id } });
  for (const id of ["linux.service-status", "linux.block-ip"]) {
    const response = await app.inject({ method: "POST", url: `/api/commands/catalog/${id}/create-action-plan`, payload: { deviceId: linux.id, params: {} } });
    assert.equal(response.statusCode, 422, id); assert.equal(response.json().needsInput, true, id); assert.ok(response.json().fields[0].labelFa); assert.ok(response.json().fields[0].helpFa);
  }
  assert.equal(await prisma.actionPlan.count({ where: { deviceId: linux.id } }), before);
});

test("Linux SSH needs no serviceName, completed inputs work, and planned commands are rejected", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({ data: { name: "Task 14.1 Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.142", managementPort: 22, protocol: "ssh", environment: "lab" } });
  const mikrotik = await prisma.device.create({ data: { name: "Task 14.1 MikroTik", vendor: "MikroTik", type: "mikrotik", host: "192.0.2.143", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: { in: [linux.id, mikrotik.id] } } }); await prisma.device.deleteMany({ where: { id: { in: [linux.id, mikrotik.id] } } }); await app.close(); });

  const ssh = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.ssh-status/create-action-plan", payload: { deviceId: linux.id, params: {} } });
  assert.equal(ssh.statusCode, 201); assert.equal(ssh.json().actionType, "linux_check_ssh_status"); assert.equal(ssh.json().parametersJson.serviceName, undefined);
  const service = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.service-status/create-action-plan", payload: { deviceId: linux.id, params: { serviceName: "nginx" } } });
  assert.equal(service.statusCode, 201);
  const blocked = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.block-ip/create-action-plan", payload: { deviceId: linux.id, params: { ipAddress: "203.0.113.7" } } });
  assert.equal(blocked.statusCode, 201); assert.equal(blocked.json().parametersJson.srcIp, "203.0.113.7");
  const planned = await app.inject({ method: "POST", url: "/api/commands/catalog/mikrotik.change-ssh-port/create-action-plan", payload: { deviceId: mikrotik.id, params: {} } });
  assert.equal(planned.statusCode, 409);
});

test("every implemented command creates a plan or explicitly requests input; manual and AI stay non-executable", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({ data: { name: "Task 14.1 all Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.144", managementPort: 22, protocol: "ssh", environment: "lab" } });
  const mikrotik = await prisma.device.create({ data: { name: "Task 14.1 all MikroTik", vendor: "MikroTik", type: "mikrotik", host: "192.0.2.145", managementPort: 22, protocol: "ssh", environment: "lab" } });
  t.after(async () => { await prisma.actionPlan.deleteMany({ where: { deviceId: { in: [linux.id, mikrotik.id] } } }); await prisma.device.deleteMany({ where: { id: { in: [linux.id, mikrotik.id] } } }); await app.close(); });
  for (const item of COMMAND_CATALOG.filter((entry) => entry.implementationState === "implemented")) {
    const response = await app.inject({ method: "POST", url: `/api/commands/catalog/${item.id}/create-action-plan`, payload: { deviceId: item.vendor === "linux" ? linux.id : mikrotik.id, params: {} } });
    assert.ok([201, 422].includes(response.statusCode), `${item.id}:${response.statusCode}:${response.body}`);
    if (response.statusCode === 201) assert.equal(response.json().status, "proposed", item.id);
  }
  const manual = await app.inject({ method: "POST", url: "/api/commands/catalog/linux.enable-fail2ban/create-action-plan", payload: { deviceId: linux.id, params: {} } });
  assert.equal(manual.statusCode, 201); assert.equal(manual.json().actionType, "generic_security_action"); assert.equal(manual.json().parametersJson.executionSupport, "manual_or_not_implemented");
  const aiDraft = await app.inject({ method: "POST", url: "/api/commands/ai-propose", payload: { request: "یک بررسی سفارشی بساز", vendor: "linux", deviceId: linux.id, createActionPlan: false } });
  assert.equal(aiDraft.statusCode, 201); assert.equal(aiDraft.json().draft.autoExecuted, false); assert.equal(aiDraft.json().actionPlan, null);
});
