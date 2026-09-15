import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { routePersianIntent } from "../src/ai/persian-intent-router.js";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";
import { prisma } from "../src/db/prisma.js";
import { actionExecutionUiState } from "../../src/lib/actionApprovalState.ts";

const linuxDevice = { id: "linux-1", vendor: "Linux", type: "linux_edge", protocol: "ssh" } as const;
const mikrotikDevice = { id: "mt-1", vendor: "MikroTik", type: "mikrotik", protocol: "ssh" } as const;

test("Persian intent router maps Linux admin phrases to executable templates", () => {
  for (const phrase of ["وضعیت پورت های باز رو نشون بده", "پورت های باز رو نشون بده", "لیست پورت های باز", "چه پورت هایی بازه", "وضعیت پورت ها", "list open ports"]) {
    const routed = routePersianIntent({ text: phrase, selectedDeviceId: linuxDevice.id, selectedVendor: "linux" });
    assert.equal(routed.matched, true);
    assert.equal(routed.actionType, "linux_list_open_ports");
    assert.equal(routed.executionTemplateRef, "linux_list_open_ports");
    assert.equal(routed.connectorType, "linux-ssh");
    assert.deepEqual(routed.requiredParams, []);
    assert.deepEqual(routed.normalizedParams, {});
    assert.deepEqual(routed.missingFields, []);
    assert.equal(routed.readOnly, true);
  }

  const service = routePersianIntent({ text: "وضعیت nginx رو چک کن", selectedDeviceId: linuxDevice.id, selectedVendor: "linux" });
  assert.equal(service.actionType, "linux_check_service_status");
  assert.equal(service.normalizedParams.serviceName, "nginx");

  const block = routePersianIntent({ text: "آی پی 1.2.3.4 رو بلاک کن", selectedDeviceId: linuxDevice.id, selectedVendor: "linux" });
  assert.equal(block.actionType, "linux_block_ip");
  assert.deepEqual(block.requiredParams, ["ipAddress"]);
  assert.equal(block.normalizedParams.ipAddress, "1.2.3.4");

  const openPort = routePersianIntent({ text: "پورت 55000 رو باز کن", selectedDeviceId: linuxDevice.id, selectedVendor: "linux" });
  assert.equal(openPort.actionType, "linux_open_port");
  assert.equal(openPort.normalizedParams.port, 55000);
  assert.equal(openPort.normalizedParams.protocol, "tcp");
});

test("Persian intent router maps MikroTik admin phrases to executable templates", () => {
  const services = routePersianIntent({ text: "سرویس های مدیریتی میکروتیک", selectedDeviceId: mikrotikDevice.id, selectedVendor: "mikrotik" });
  assert.equal(services.actionType, "mikrotik_list_management_services");
  assert.equal(services.executionTemplateRef, "mikrotik_list_management_services");

  const logs = routePersianIntent({ text: "ورود ناموفق میکروتیک", selectedDeviceId: mikrotikDevice.id, selectedVendor: "mikrotik" });
  assert.equal(logs.actionType, "mikrotik_check_login_logs");
  assert.equal(logs.executionTemplateRef, "mikrotik_check_failed_logins");

  const block = routePersianIntent({ text: "آی پی 1.2.3.4 رو بلاک کن", selectedDeviceId: mikrotikDevice.id, selectedVendor: "mikrotik" });
  assert.equal(block.actionType, "mikrotik_block_ip");
  assert.equal(block.normalizedParams.ipAddress, "1.2.3.4");
});

test("AI resolver maps supported Persian requests to executable templates without stale params", () => {
  const listPorts = resolveAiTemplate({ userText: "وضعیت پورت های باز رو نشون بده", selectedDevice: linuxDevice });
  assert.equal(listPorts.canonicalVendor, "linux");
  assert.equal(listPorts.canonicalActionType, "linux_list_open_ports");
  assert.equal(listPorts.executionSupport, "connector");
  assert.equal(listPorts.executionTemplateRef, "linux_list_open_ports");
  assert.deepEqual(listPorts.missingFields, []);
  assert.equal(listPorts.normalizedParams.sourceIp, undefined);
  assert.equal(listPorts.normalizedParams.ipAddress, undefined);
  assert.equal(listPorts.normalizedParams.port, undefined);

  const service = resolveAiTemplate({ userText: "وضعیت nginx رو چک کن", selectedDevice: linuxDevice });
  assert.equal(service.canonicalActionType, "linux_check_service_status");
  assert.equal(service.executionSupport, "connector");
  assert.equal(service.normalizedParams.serviceName, "nginx");

  const block = resolveAiTemplate({ userText: "آی پی 1.2.3.4 رو بلاک کن", selectedDevice: linuxDevice });
  assert.equal(block.canonicalActionType, "linux_block_ip");
  assert.equal(block.executionTemplateRef, "linux_block_ip");
  assert.equal(block.normalizedParams.ipAddress, "1.2.3.4");
  assert.equal(block.normalizedParams.sourceIp, undefined);
});

test("AI resolver asks only for missing required fields", () => {
  const resolution = resolveAiTemplate({ userText: "وضعیت سرویس رو ببین", selectedDevice: linuxDevice });
  assert.deepEqual(resolution.missingFields, ["serviceName"]);
  assert.equal(resolution.executionSupport, "connector");

  const noDevice = routePersianIntent({ text: "وضعیت پورت های باز رو نشون بده", selectedVendor: "linux" });
  assert.deepEqual(noDevice.missingFields, ["deviceId"]);
  assert.equal(noDevice.reasonFa, "اول دستگاه را انتخاب کنید.");
});

test("command catalog AI fallback creates executable Linux open-port-list plans", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({
    data: {
      name: "Task 16.3 Linux",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.163",
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

  for (const phrase of ["وضعیت پورت های باز رو نشون بده", "پورت های باز رو نشون بده"]) {
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
    assert.equal(body.actionPlan.actionType, "linux_list_open_ports");
    assert.notEqual(body.actionPlan.actionType, "generic_security_action");
    assert.notEqual(body.actionPlan.parametersJson.executionSupport, "manual_or_not_implemented");
    assert.equal(body.actionPlan.parametersJson.executionSupport, "connector");
    assert.equal(body.actionPlan.parametersJson.implementationState, "implemented");
    assert.equal(body.actionPlan.parametersJson.executionTemplateRef, "linux_list_open_ports");
    assert.equal(body.actionPlan.parametersJson.connectorType, "linux-ssh");
    assert.equal(body.actionPlan.parametersJson.source, "ai_mapped_template");
    assert.deepEqual(body.actionPlan.parametersJson.normalizedParams, {});
    assert.equal(body.actionPlan.parametersJson.requiredParamsSatisfied, true);
    assert.equal(body.actionPlan.parametersJson.metadata.source, "ai_mapped_template");
    assert.equal(body.actionPlan.parametersJson.metadata.connectorInvoked, false);
    assert.deepEqual(body.actionPlan.parametersJson.metadata.normalizedParams, {});
    assert.equal(body.actionPlan.parametersJson.sourceIp, undefined);
    assert.equal(body.actionPlan.parametersJson.ipAddress, undefined);
    assert.equal(body.actionPlan.parametersJson.port, undefined);

    const validation = await app.inject({
      method: "POST",
      url: `/api/actions/${body.actionPlan.id}/validate`,
    });
    assert.equal(validation.statusCode, 200, validation.body);
    const validated = validation.json();
    const errors = JSON.stringify(validated.validationJson);
    assert.doesNotMatch(errors, /sourceIp/i);
    assert.doesNotMatch(errors, /ipAddress/i);
    assert.doesNotMatch(errors, /port has an invalid value/i);

    const ui = actionExecutionUiState(body.actionPlan);
    assert.equal(ui.canApproveAndExecute, true);
    assert.equal(ui.canExecute, true);
  }
});

test("command catalog AI fallback returns executable, guided-parameter, and manual modes honestly", async (t) => {
  const app = await buildApp({ authRequired: false });
  const linux = await prisma.device.create({
    data: {
      name: "Task 16.3 Modes Linux",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.217",
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

  const service = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت nginx رو چک کن", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(service.statusCode, 201, service.body);
  assert.equal(service.json().mode, "executable_action_plan");
  assert.equal(service.json().actionPlan.actionType, "linux_check_service_status");
  assert.equal(service.json().actionPlan.parametersJson.serviceName, "nginx");

  const block = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "آی پی 1.2.3.4 رو بلاک کن", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(block.statusCode, 201, block.body);
  assert.equal(block.json().actionPlan.actionType, "linux_block_ip");
  assert.equal(block.json().actionPlan.parametersJson.ipAddress, "1.2.3.4");
  assert.equal(block.json().actionPlan.parametersJson.sourceIp, undefined);

  const needsInput = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت سرویس رو ببین", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(needsInput.statusCode, 201);
  assert.equal(needsInput.json().mode, "guided_workflow");
  assert.equal(needsInput.json().blueprintId, "catalog:linux.service-status");
  assert.deepEqual(needsInput.json().missingFields, ["serviceName"]);
  assert.equal(needsInput.json().actionPlan.actionType, "linux_check_service_status");

  const noDevice = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "وضعیت پورت های باز رو نشون بده", vendor: "linux" },
  });
  assert.equal(noDevice.statusCode, 200);
  assert.equal(noDevice.json().mode, "needs_input");
  assert.deepEqual(noDevice.json().missingFields, ["deviceId"]);
  assert.equal(noDevice.json().messageFa, "اول دستگاه را انتخاب کنید.");

  const manual = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "برای این دستگاه یک بررسی سفارشی امنیتی بساز", vendor: "linux", deviceId: linux.id },
  });
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.json().mode, "manual_or_not_supported");
  assert.equal(manual.json().actionPlan.actionType, "custom_vendor_action");
  assert.equal(manual.json().actionPlan.parametersJson.executable, false);
  assert.equal(manual.json().actionPlan.parametersJson.executionSupport, "manual");
});
