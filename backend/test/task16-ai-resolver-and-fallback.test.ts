import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";

test("AI resolver maps supported Persian requests to executable templates", () => {
  const linuxDevice = { id: "linux-1", vendor: "Linux", type: "linux_edge", protocol: "ssh" } as const;
  const mikrotikDevice = { id: "mt-1", vendor: "MikroTik", type: "mikrotik", protocol: "ssh" } as const;

  const openPort = resolveAiTemplate({ userText: "پورت 55000 رو باز کن", selectedDevice: linuxDevice });
  assert.equal(openPort.canonicalVendor, "linux");
  assert.equal(openPort.canonicalActionType, "linux_open_port");
  assert.equal(openPort.executionSupport, "connector");
  assert.equal(openPort.executionTemplateRef, "linux_open_port");
  assert.equal(openPort.normalizedParams.port, 55000);

  const service = resolveAiTemplate({ userText: "وضعیت nginx رو ببین", selectedDevice: linuxDevice });
  assert.equal(service.canonicalActionType, "linux_check_service_status");
  assert.equal(service.executionSupport, "connector");
  assert.equal(service.normalizedParams.serviceName, "nginx");

  const removeSudo = resolveAiTemplate({ userText: "کاربر tavakoli رو از sudo خارج کن", selectedDevice: linuxDevice });
  assert.equal(removeSudo.canonicalActionType, "linux_remove_user_from_sudo");
  assert.equal(removeSudo.executionSupport, "connector");
  assert.equal(removeSudo.normalizedParams.username, "tavakoli");

  const dailyCheck = resolveAiTemplate({ userText: "چک روزانه این دستگاه رو بگیر", selectedDevice: mikrotikDevice });
  assert.equal(dailyCheck.canonicalActionType, "mikrotik_daily_check");
  assert.equal(dailyCheck.executionSupport, "connector");

  const loginLogs = resolveAiTemplate({ userText: "لاگ لاگین میکروتیک رو ببین", selectedDevice: mikrotikDevice });
  assert.equal(loginLogs.canonicalActionType, "mikrotik_show_logs");
  assert.equal(loginLogs.executionTemplateRef, "mikrotik_check_failed_logins");
});

test("AI resolver asks only for missing required fields", () => {
  const linuxDevice = { id: "linux-1", vendor: "Linux", type: "linux_edge", protocol: "ssh" } as const;
  const resolution = resolveAiTemplate({ userText: "وضعیت سرویس رو ببین", selectedDevice: linuxDevice });
  assert.deepEqual(resolution.missingFields, ["serviceName"]);
  assert.equal(resolution.executionSupport, "connector");
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

  const needsInput = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت سرویس رو ببین", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(needsInput.statusCode, 200);
  assert.equal(needsInput.json().mode, "needs_input");
  assert.deepEqual(needsInput.json().missingFields, ["serviceName"]);

  const manual = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "برای این دستگاه یک بررسی سفارشی امنیتی بساز", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(manual.statusCode, 201);
  assert.equal(manual.json().mode, "manual_proposal");
});
