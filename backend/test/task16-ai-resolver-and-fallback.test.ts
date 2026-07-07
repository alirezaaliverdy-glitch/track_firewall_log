import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";

const linuxDevice = { id: "linux-1", vendor: "Linux", type: "linux_edge", protocol: "ssh" } as const;
const mikrotikDevice = { id: "mt-1", vendor: "MikroTik", type: "mikrotik", protocol: "ssh" } as const;

test("AI resolver maps supported Persian requests to executable templates", () => {
  const openPort = resolveAiTemplate({ userText: "پورت 55000 رو باز کن", selectedDevice: linuxDevice });
  assert.equal(openPort.canonicalVendor, "linux");
  assert.equal(openPort.canonicalActionType, "linux_open_port");
  assert.equal(openPort.executionSupport, "connector");
  assert.equal(openPort.executionTemplateRef, "linux_open_port");
  assert.equal(openPort.normalizedParams.port, 55000);

  const listPorts = resolveAiTemplate({ userText: "وضعیت پورت های رو میخوام ببینم", selectedDevice: linuxDevice });
  assert.equal(listPorts.canonicalVendor, "linux");
  assert.equal(listPorts.canonicalActionType, "linux_read_listening_ports");
  assert.equal(listPorts.executionSupport, "connector");
  assert.equal(listPorts.executionTemplateRef, "linux_list_open_ports");

  const service = resolveAiTemplate({ userText: "وضعیت nginx رو ببین", selectedDevice: linuxDevice });
  assert.equal(service.canonicalActionType, "linux_check_service_status");
  assert.equal(service.executionSupport, "connector");
  assert.equal(service.normalizedParams.serviceName, "nginx");

  const sudoUsers = resolveAiTemplate({ userText: "چه کسانی sudo دارن", selectedDevice: linuxDevice });
  assert.equal(sudoUsers.canonicalActionType, "linux_check_sudo_users");
  assert.equal(sudoUsers.executionSupport, "connector");

  const dailyCheck = resolveAiTemplate({ userText: "سلامت سرور رو بررسی کن", selectedDevice: mikrotikDevice });
  assert.equal(dailyCheck.canonicalActionType, "mikrotik_daily_check");
  assert.equal(dailyCheck.executionSupport, "connector");

  const loginLogs = resolveAiTemplate({ userText: "لاگ لاگین میکروتیک رو ببین", selectedDevice: mikrotikDevice });
  assert.equal(loginLogs.canonicalActionType, "mikrotik_show_logs");
  assert.equal(loginLogs.executionTemplateRef, "mikrotik_check_failed_logins");
});

test("AI resolver asks only for missing required fields", () => {
  const resolution = resolveAiTemplate({ userText: "وضعیت سرویس رو ببین", selectedDevice: linuxDevice });
  assert.deepEqual(resolution.missingFields, ["serviceName"]);
  assert.equal(resolution.executionSupport, "connector");
});

test("command catalog AI fallback creates executable Linux open-port-list plans", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({
    data: {
      name: "Task 16.2 Linux",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.162",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: linux.id } });
    await prisma.device.delete({ where: { id: linux.id } });
    await app.close();
  });

  for (const phrase of ["وضعیت پورت های رو میخوام ببینم", "پورت های باز رو نشون بده"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/commands/ai-propose",
      payload: { request: phrase, vendor: "linux", selectedVendor: "linux", currentVendor: "linux", deviceId: linux.id, selectedDeviceId: linux.id },
    });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.mode, "executable_action_plan");
    assert.equal(body.executionSupport, "connector");
    assert.equal(body.implementationState, "implemented");
    assert.equal(body.executionTemplateRef, "linux_list_open_ports");
    assert.equal(body.connectorType, "linux-ssh");
    assert.equal(body.messageFa, "برنامه اجرای قابل تأیید ساخته شد.");
    assert.equal(body.actionPlan.actionType, "linux_read_listening_ports");
    assert.notEqual(body.actionPlan.actionType, "generic_security_action");
    assert.equal(body.actionPlan.parametersJson.executionSupport, "connector");
    assert.equal(body.actionPlan.parametersJson.implementationState, "implemented");
    assert.equal(body.actionPlan.parametersJson.executionTemplateRef, "linux_list_open_ports");
    assert.equal(body.actionPlan.parametersJson.connectorType, "linux-ssh");
    assert.equal(body.actionPlan.parametersJson.source, "command_search_ai_fallback");
    assert.equal(body.actionPlan.parametersJson.requiredParamsSatisfied, true);
    assert.equal(body.actionPlan.parametersJson.metadata.source, "command_search_ai_fallback");
    assert.equal(body.actionPlan.parametersJson.metadata.connectorInvoked, false);
  }
});

test("command catalog AI fallback returns executable, needs_input, and manual modes honestly", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({
    data: {
      name: "Task 16 Linux",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.216",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });

  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: linux.id } });
    await prisma.device.delete({ where: { id: linux.id } });
    await app.close();
  });

  const executable = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "پورت 55000 رو باز کن", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(executable.statusCode, 201);
  assert.equal(executable.json().mode, "executable_action_plan");
  assert.equal(executable.json().messageFa, "برنامه اجرای قابل تأیید ساخته شد.");

  const service = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت nginx رو ببین", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(service.statusCode, 201, service.body);
  assert.equal(service.json().mode, "executable_action_plan");
  assert.equal(service.json().actionPlan.actionType, "linux_check_service_status");
  assert.equal(service.json().actionPlan.parametersJson.serviceName, "nginx");

  const needsInput = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت سرویس رو ببین", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(needsInput.statusCode, 200);
  assert.equal(needsInput.json().mode, "needs_input");
  assert.deepEqual(needsInput.json().missingFields, ["serviceName"]);

  const noDevice = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت پورت های رو میخوام ببینم", vendor: "linux" },
  });
  assert.equal(noDevice.statusCode, 200);
  assert.equal(noDevice.json().mode, "needs_input");
  assert.deepEqual(noDevice.json().missingFields, ["deviceId"]);
  assert.equal(noDevice.json().messageFa, "اول دستگاه را انتخاب کنید تا برنامه قابل اجرا ساخته شود.");

  const manual = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "برای این دستگاه یک بررسی سفارشی امنیتی بساز", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.json().mode, "manual_proposal");
  assert.equal(manual.json().actionPlan, null);
});
