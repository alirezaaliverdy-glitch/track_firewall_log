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
  const resolution = resolveAiTemplate({ userText: "open ports", selectedDevice: linuxDevice });
  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalActionType, "linux_list_open_ports");
  assert.equal(resolution.executionSupport, "connector");
  assert.equal(resolution.executionTemplateRef, "linux_list_open_ports");
  assert.deepEqual(resolution.missingFields, []);
  assert.equal(resolution.normalizedParams.port, undefined);
});

test("FortiGate port status request never invents srcInterface", () => {
  const resolution = resolveAiTemplate({ userText: "show interfaces", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalActionType, "fortigate_show_interfaces");
  assert.equal(resolution.executionTemplateRef, "fortigate_show_interfaces");
  assert.equal(resolution.connectorType, "fortigate-ssh");
  assert.deepEqual(resolution.missingFields, []);
  assert.equal(resolution.normalizedParams.srcInterface, undefined);
  assert.equal(resolution.normalizedParams.srcintf, undefined);
});

test("FortiGate VPN setup resolves to partial guided workflow with fixed dropdowns", () => {
  const resolution = resolveAiTemplate({ userText: "vpn create", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_vpn_setup");
  assert.equal(resolution.canonicalVendor, "fortigate");
  assert.equal(resolution.connectorType, "fortigate-ssh");
  assert.notEqual(resolution.canonicalActionType, "custom_vendor_action");
  const blueprint = getGuidedActionBlueprint("fortigate_guided_vpn_setup");
  assert.ok(blueprint);
  assert.equal(blueprint.implementationState, "partial");
  const scenario = blueprint.steps[0]?.fields.find((field) => field.key === "vpnType");
  assert.equal(scenario?.type, "select");
  assert.ok(scenario?.options?.length);
});

test("FortiGate VDOM setup resolves to guided workflow", () => {
  const resolution = resolveAiTemplate({ userText: "vdom create", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_vdom_create");
});

test("FortiGate Zone setup resolves to guided workflow and extracts name", () => {
  const resolution = resolveAiTemplate({ userText: "zone DMZ create", selectedDevice: fortigateDevice });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_zone_create");
  assert.equal(resolution.initialValues?.zoneName, "DMZ");
});

test("Guided request without selected device starts wizard routing and creates no unknown-vendor plan", () => {
  const resolution = resolveAiTemplate({ userText: "vpn create" });
  assert.equal(resolution.mode, "guided_workflow");
  assert.equal(resolution.blueprintId, "fortigate_guided_vpn_setup");
  assert.notEqual(resolution.canonicalVendor, "unknown");
  assert.notEqual(resolution.canonicalActionType, "custom_vendor_action");
});

test("FortiGate firewall policy request resolves to guided workflow and extracts source subnet", () => {
  const resolution = resolveAiTemplate({ userText: "policy create source 192.168.7.0/24 internet", selectedDevice: fortigateDevice });
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
  const resolution = resolveAiTemplate({ userText: "service port 8443 create", selectedDevice: fortigateDevice });
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
    initialRequest: "service port 8443 create",
    initialValues: {},
  });
  assert.equal(session.ok, true);
  const sessionId = session.ok ? session.value.sessionId : "";
  const invalid = await answerGuidedActionStep(sessionId, { stepId: "service_details", values: { name: "svc_8443", protocol: "banana", port: 8443 } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.ok ? "" : invalid.error, "VALIDATION_FAILED");
  assert.match(invalid.ok ? "" : invalid.messageFa, /مجاز/);
  const built = await buildGuidedActionPlan(sessionId);
  assert.equal(built.ok, false);
});

test("Unsupported/partial FortiGate workflow does not fake executable command or success", async () => {
  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_vpn_setup",
    deviceId: "fg-partial-vpn",
    vendor: "fortigate",
    initialRequest: "vpn create",
    initialValues: { vpnType: "ipsec_site_to_site", name: "vpn1", localSubnets: "10.0.0.0/24", remoteSubnets: "10.1.0.0/24", allowedSubnets: "10.0.0.0/24", wanInterface: "wan1", remoteGateway: "203.0.113.5", authMethod: "psk", pskMode: "generate" },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, false);
  assert.equal(built.ok ? "" : built.error, "PLANNED");
  const blueprint = getGuidedActionBlueprint("fortigate_guided_vpn_setup");
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
      request: "policy create source 192.168.7.0/24 internet",
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
  assert.ok(body.currentStep.fields.some((field: { key: string }) => field.key === "srcintf"));
});

test("AI propose FortiGate VPN returns guided workflow without creating ActionPlan", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.2A FortiGate VPN",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.173",
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

  const before = await prisma.actionPlan.count({ where: { deviceId: device.id } });
  const response = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: {
      request: "vpn create",
      selectedDeviceId: device.id,
      selectedVendor: "fortigate",
      selectedConnectorType: "fortigate-ssh",
      selectedDeviceName: device.name,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.mode, "guided_workflow");
  assert.equal(body.blueprintId, "fortigate_guided_vpn_setup");
  assert.equal(body.vendor, "fortigate");
  assert.equal(body.connectorType, "fortigate-ssh");
  assert.equal(body.actionPlan, null);
  assert.equal(await prisma.actionPlan.count({ where: { deviceId: device.id } }), before);
});

test("AI propose guided request without device starts session with device-selection first step and no ActionPlan", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const response = await app.inject({
    method: "POST",
    url: "/api/commands/ai-propose",
    payload: { request: "vpn create" },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.mode, "guided_workflow");
  assert.equal(body.blueprintId, "fortigate_guided_vpn_setup");
  assert.equal(body.actionPlan, null);
  const start = await app.inject({
    method: "POST",
    url: "/api/action-sessions/start",
    payload: {
      blueprintId: body.blueprintId,
      initialRequest: "vpn create",
      initialValues: body.initialValues,
    },
  });
  assert.equal(start.statusCode, 200, start.body);
  assert.equal(start.json().currentStep.id, "device_selection");
  assert.equal(start.json().deviceId, null);
});

test("Bottom chatbot FortiGate VPN returns guided workflow and no ActionPlan", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.2A FortiGate Chat",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.174",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.aiChatMessage.deleteMany({});
    await prisma.aiChatSession.deleteMany({});
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/chat",
    payload: {
      message: "vpn create",
      selectedDeviceId: device.id,
      selectedVendor: "fortigate",
      selectedConnectorType: "fortigate-ssh",
      selectedDeviceName: device.name,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.mode, "guided_workflow");
  assert.equal(body.blueprintId, "fortigate_guided_vpn_setup");
  assert.equal(typeof body.assistantMessage, "string");
  assert.equal(body.actionPlan, null);
});
