import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";
import { buildApp } from "../src/app.js";
import { getGuidedActionBlueprint } from "../src/guided-actions/registry.js";
import { startGuidedActionSession, answerGuidedActionStep, buildGuidedActionPlan } from "../src/guided-actions/session-service.js";
import { prisma } from "../src/db/prisma.js";

const linuxDevice = { id: "linux-guided-1", vendor: "Linux", type: "linux_edge", protocol: "ssh" } as const;
const fortigateDevice = { id: "fg-guided-1", vendor: "Fortinet", type: "fortigate", protocol: "ssh" } as const;

test("Linux port status request maps to executable listening/open ports without missing fields", () => {
  const resolution = resolveAiTemplate({ userText: "وضعیت پورت هامو نشون بده", selectedDevice: linuxDevice });
  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalActionType, "linux_list_open_ports");
  assert.equal(resolution.executionSupport, "connector");
  assert.equal(resolution.executionTemplateRef, "linux_list_open_ports");
  assert.deepEqual(resolution.missingFields, []);
  assert.equal(resolution.normalizedParams.port, undefined);
});

test("FortiGate port status request never invents srcInterface", () => {
  const resolution = resolveAiTemplate({ userText: "وضعیت پورت هامو نشون بده", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalActionType, "fortigate_show_interfaces");
  assert.equal(resolution.executionTemplateRef, "fortigate_show_interfaces");
  assert.equal(resolution.connectorType, "fortigate-ssh");
  assert.deepEqual(resolution.missingFields, []);
  assert.equal(resolution.normalizedParams.srcInterface, undefined);
  assert.equal(resolution.normalizedParams.srcintf, undefined);
});

test("FortiGate VPN setup resolves to partial guided workflow with fixed dropdowns", () => {
  const resolution = resolveAiTemplate({ userText: "برام VPN بساز", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_ipsec_vpn_setup");
  const blueprint = getGuidedActionBlueprint("fortigate_guided_ipsec_vpn_setup");
  assert.ok(blueprint);
  assert.equal(blueprint.implementationState, "partial");
  const scenario = blueprint.steps[0]?.fields.find((field) => field.key === "vpnScenario");
  assert.equal(scenario?.type, "select");
  assert.ok(scenario?.options?.length);
});

test("FortiGate firewall policy request resolves to guided workflow and extracts source subnet", () => {
  const resolution = resolveAiTemplate({ userText: "یه رول بساز که شبکه 192.168.7.0/24 به اینترنت دسترسی داشته باشه", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_firewall_policy_create");
  assert.equal(resolution.initialValues?.sourceCidr, "192.168.7.0/24");
  const blueprint = getGuidedActionBlueprint("fortigate_guided_firewall_policy_create");
  assert.ok(blueprint);
  assert.equal(blueprint.implementationState, "implemented");
  const action = blueprint.steps[0]?.fields.find((field) => field.key === "action");
  assert.equal(action?.type, "select");
  assert.deepEqual(action?.validation?.allowedValues, ["accept", "deny"]);
});

test("FortiGate service object request uses guided protocol enum and numeric port validation", () => {
  const resolution = resolveAiTemplate({ userText: "یه سرویس برای پورت 8443 بساز", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_service_object_create");
  assert.equal(resolution.initialValues?.port, 8443);
  const blueprint = getGuidedActionBlueprint("fortigate_guided_service_object_create");
  assert.ok(blueprint);
  const protocol = blueprint.steps[0]?.fields.find((field) => field.key === "protocol");
  const port = blueprint.steps[0]?.fields.find((field) => field.key === "port");
  assert.equal(protocol?.type, "select");
  assert.deepEqual(protocol?.validation?.allowedValues, ["TCP", "UDP", "TCP-UDP"]);
  assert.equal(port?.type, "number");
  assert.equal(port?.validation?.max, 65535);
});

test("ActionSession rejects invalid enum in Persian and does not build an ActionPlan", async () => {
  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_service_object_create",
    deviceId: "fg-invalid-enum",
    vendor: "fortigate",
    initialRequest: "یه سرویس برای پورت 8443 بساز",
    initialValues: {},
  });
  assert.equal(session.ok, true);
  const sessionId = session.ok ? session.value.sessionId : "";
  const invalid = answerGuidedActionStep(sessionId, { stepId: "service_details", values: { name: "svc_8443", protocol: "banana", port: 8443 } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.ok ? "" : invalid.error, "VALIDATION_FAILED");
  assert.match(invalid.ok ? "" : invalid.messageFa, /مجاز/);
  const built = await buildGuidedActionPlan(sessionId);
  assert.equal(built.ok, false);
});

test("Unsupported/partial FortiGate workflow does not fake executable command or success", async () => {
  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_ipsec_vpn_setup",
    deviceId: "fg-partial-vpn",
    vendor: "fortigate",
    initialRequest: "برام VPN بساز",
    initialValues: { vpnScenario: "site_to_site", name: "vpn1", remoteGateway: "203.0.113.5", pskMode: "secretRef", pskSecretRef: "secret://vpn1" },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, false);
  assert.equal(built.ok ? "" : built.error, "PLANNED");
  const blueprint = getGuidedActionBlueprint("fortigate_guided_ipsec_vpn_setup");
  assert.ok(blueprint);
  assert.equal(blueprint.implementationState, "partial");
});

test("ActionSession API starts FortiGate guided workflow and exposes Persian step fields", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.2 FortiGate",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.172",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: {
      request: "یه رول بساز که شبکه 192.168.7.0/24 به اینترنت دسترسی داشته باشه",
      vendor: "fortigate",
      selectedVendor: "fortigate",
      deviceId: device.id,
      selectedDeviceId: device.id,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().mode, "guided_workflow");
  assert.equal(response.json().blueprintId, "fortigate_guided_firewall_policy_create");

  const start = await app.inject({
    method: "POST",
    url: "/api/action-sessions/start",
    payload: {
      blueprintId: response.json().blueprintId,
      deviceId: device.id,
      vendor: "fortigate",
      initialRequest: "policy",
      initialValues: response.json().initialValues,
    },
  });
  assert.equal(start.statusCode, 200, start.body);
  const body = start.json();
  assert.equal(body.status, "collecting_inputs");
  assert.equal(body.currentStep.id, "policy_basics");
  assert.ok(body.currentStep.fields.some((field: { labelFa: string }) => field.labelFa === "اینترفیس مبدا"));
});
