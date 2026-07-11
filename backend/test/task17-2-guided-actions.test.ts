import assert from "node:assert/strict";
import test from "node:test";
import { ActionPlanStatus, ActionType } from "@prisma/client";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";
import { buildApp } from "../src/app.js";
import { getGuidedActionBlueprint } from "../src/guided-actions/registry.js";
import { startGuidedActionSession, answerGuidedActionStep, buildGuidedActionPlan } from "../src/guided-actions/session-service.js";
import { catalogGuidedBlueprintId } from "../src/guided-actions/catalog-guided-blueprint.js";
import { validateFortiGateAction } from "../src/actions/fortigate-action-catalog.js";
import { normalizeFortiGateGuidedVpnParameters, validateFortiGateGuidedVpnParameters } from "../src/services/fortigate-guided-vpn.schema.js";
import { dryRunActionPlan, quickExecuteActionPlan } from "../src/services/action-plan.service.js";
import { createCredential } from "../src/services/credential.service.js";
import type { DeviceConnector } from "../src/connectors/types.js";
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

test("Persian and English VPN chat intents create FortiGate guided ActionSessions", async (t) => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.5 FortiGate Chat VPN",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.178",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  const chatSessionIds: string[] = [];
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    if (chatSessionIds.length) {
      await prisma.aiChatMessage.deleteMany({ where: { sessionId: { in: chatSessionIds } } });
      await prisma.aiChatSession.deleteMany({ where: { id: { in: chatSessionIds } } });
    }
    await prisma.device.delete({ where: { id: device.id } });
    await app.close();
  });

  for (const message of ["برام vpn بساز", "build vpn"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: {
        message,
        selectedDeviceId: device.id,
        selectedVendor: "fortigate",
        selectedConnectorType: "fortigate-ssh",
        selectedDeviceName: device.name,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    if (typeof body.sessionId === "string") chatSessionIds.push(body.sessionId);
    assert.equal(body.mode, "guided_workflow");
    assert.equal(body.blueprintId, "fortigate_guided_vpn_setup");
    assert.equal(body.vendor, "fortigate");
    assert.equal(body.connectorType, "fortigate-ssh");
    assert.equal(body.actionPlan, null);
    assert.equal(body.shouldCreateActionPlan, false);
    assert.equal(typeof body.actionSessionId, "string");
    assert.equal(body.guidedActionUrl, `/guided-actions/${encodeURIComponent(body.actionSessionId)}`);
    assert.equal(body.actionSession.sessionId, body.actionSessionId);
    assert.equal(body.actionSession.deviceId, device.id);
    assert.equal(body.actionSession.currentStep.id, "vpn_type");

    const build = await app.inject({ method: "POST", url: `/api/action-sessions/${body.actionSessionId}/build-plan`, payload: {} });
    assert.equal(build.statusCode, 422, build.body);
    assert.equal(build.json().error, "VALIDATION_FAILED");
  }
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

test("Complete FortiGate IPsec site-to-site guided session builds executable redacted ActionPlan", async (t) => {
  const device = await prisma.device.create({
    data: {
      name: "Task 17.2C FortiGate VPN Preview",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.175",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  });

  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_vpn_setup",
    deviceId: device.id,
    vendor: "fortigate",
    initialRequest: "vpn create",
    initialValues: { vpnType: "ipsec_site_to_site", vpnName: "test-vpn", localSubnet: "192.168.1.0/24", remoteSubnet: "10.10.10.0/24", allowedSubnets: "192.168.1.0/24", wanInterface: "wan1", lanInterface: "internal1", remoteGateway: "203.0.113.10", authMethod: "psk", pskMode: "manual", psk: "redaction-test-value", proposal: "aes256-sha256", dhGroup: "14", ikeVersion: "2", natTraversal: true, createFirewallPolicy: true, createStaticRoute: true, natEnabled: false, logTraffic: true, enableAfterCreate: false },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.value.actionPlanId);
  assert.equal(built.value.actionPlan.actionType, "fortigate_guided_vpn_setup");
  const params = built.value.actionPlan.parametersJson as Record<string, unknown>;
  const metadata = params.metadata as Record<string, unknown>;
  assert.equal(params.vendor, "fortigate");
  assert.equal(params.executionSupport, "connector");
  assert.equal(params.implementationState, "implemented");
  assert.equal(params.executable, true);
  assert.equal(params.supportState, "verified");
  assert.equal(params.executionTemplateRef, "fortigate_guided_vpn_setup");
  assert.equal(typeof params.pskSecretRef, "string");
  assert.equal(params.psk, undefined);
  assert.equal(params.vpnName, "test-vpn");
  assert.equal(params.phase1Name, "test-vpn");
  assert.equal(params.phase2Name, "test-vpn-p2");
  assert.equal(params.wanInterface, "wan1");
  assert.equal(params.lanInterface, "internal1");
  assert.equal(params.srcInterface, undefined);
  assert.equal(params.dstInterface, undefined);
  assert.equal(params.sourceIp, undefined);
  assert.equal(metadata.actionType, "fortigate.guided_vpn_setup");
  assert.equal(metadata.connectorType, "fortigate-ssh");
  assert.equal(metadata.source, "guided_action_wizard");
  assert.equal(metadata.supportState, "verified");
  assert.equal(metadata.executable, true);
  assert.notEqual(JSON.stringify(built.value), "redaction-test-value");
  assert.doesNotMatch(JSON.stringify(built.value), /redaction-test-value/);
  assert.doesNotMatch(JSON.stringify(built.value.actionPlan.dryRunJson), /redaction-test-value/);
  const validation = validateFortiGateAction({
    actionType: built.value.actionPlan.actionType,
    riskLevel: built.value.actionPlan.riskLevel,
    parametersJson: built.value.actionPlan.parametersJson,
  });
  assert.equal(validation.valid, true, validation.errors.join(", "));
  const commands = validation.commandSpecs.map((spec) => spec.command).join("\n");
  assert.match(commands, /config vpn ipsec phase1-interface/);
  assert.match(commands, /config vpn ipsec phase2-interface/);
  assert.match(commands, /config router static/);
  assert.match(commands, /config firewall policy/);
  assert.match(commands, /set interface "wan1"/);
  assert.match(commands, /set remote-gw 203\.0\.113\.10/);
  assert.match(commands, /set ike-version 2/);
  assert.match(commands, /set dhgrp 14/);
  assert.match(commands, /set src-subnet 192\.168\.1\.0 255\.255\.255\.0/);
  assert.match(commands, /set dst-subnet 10\.10\.10\.0 255\.255\.255\.0/);
  assert.match(commands, /set psksecret \*\*\*\*\*\*\*\*/);
  assert.doesNotMatch(commands, /redaction-test-value/);
  assert.notEqual(params.wanInterface, "guided_action_wizard");
  assert.notEqual(params.lanInterface, "guided_action_wizard");
  assert.doesNotMatch(commands, /guided_action_wizard/);
  const blueprint = getGuidedActionBlueprint("fortigate_guided_vpn_setup");
  assert.ok(blueprint);
  assert.equal(blueprint.implementationState, "partial");
});

test("parameterized catalog action uses guided flow and blocks missing, placeholder, and invalid params", async (t) => {
  const device = await prisma.device.create({
    data: {
      name: "Task 17.6C Linux Guided Params",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.181",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  });

  const blueprintId = catalogGuidedBlueprintId("linux.open-port");
  const blueprint = getGuidedActionBlueprint(blueprintId);
  assert.ok(blueprint);
  assert.equal(blueprint.vendor, "linux");
  assert.equal(blueprint.steps[0]?.id, "catalog_parameters");

  const missing = startGuidedActionSession({ blueprintId, deviceId: device.id, vendor: "linux", initialRequest: "open port", initialValues: {} });
  assert.equal(missing.ok, true);
  const missingBuild = await buildGuidedActionPlan(missing.ok ? missing.value.sessionId : "");
  assert.equal(missingBuild.ok, false);
  assert.equal(missingBuild.ok ? "" : missingBuild.error, "VALIDATION_FAILED");

  const placeholder = startGuidedActionSession({ blueprintId, deviceId: device.id, vendor: "linux", initialRequest: "open port", initialValues: {} });
  assert.equal(placeholder.ok, true);
  const placeholderAnswer = await answerGuidedActionStep(placeholder.ok ? placeholder.value.sessionId : "", { stepId: "catalog_parameters", values: { port: "55000" } });
  assert.equal(placeholderAnswer.ok, false);
  assert.equal(placeholderAnswer.ok ? "" : placeholderAnswer.error, "VALIDATION_FAILED");

  const invalid = startGuidedActionSession({ blueprintId, deviceId: device.id, vendor: "linux", initialRequest: "open port", initialValues: {} });
  assert.equal(invalid.ok, true);
  const invalidAnswer = await answerGuidedActionStep(invalid.ok ? invalid.value.sessionId : "", { stepId: "catalog_parameters", values: { port: "abc" } });
  assert.equal(invalidAnswer.ok, false);
  assert.equal(invalidAnswer.ok ? "" : invalidAnswer.error, "VALIDATION_FAILED");
});

test("parameterized executable catalog action reaches connector only after confirmed execution", async (t) => {
  const credential = await createCredential({ name: `task-17-6c-linux-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: true });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.6C Linux Confirmed Execute",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.182",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
      credentialId: credential.id,
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
  });

  const session = startGuidedActionSession({
    blueprintId: catalogGuidedBlueprintId("linux.open-port"),
    deviceId: device.id,
    vendor: "linux",
    initialRequest: "open port",
    initialValues: { port: 55001 },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.value.actionPlan.parametersJson.metadata.guidedBlueprintId, catalogGuidedBlueprintId("linux.open-port"));
  assert.equal(built.value.actionPlan.parametersJson.metadata.supportState, "verified");
  assert.equal(built.value.actionPlan.parametersJson.guided_action_wizard, undefined);
  assert.equal(built.value.actionPlan.parametersJson.source, undefined);

  await dryRunActionPlan(built.value.actionPlanId);
  let executeCalls = 0;
  const fakeConnector = {
    name: "linux",
    supportedActions: [ActionType.linux_open_port],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async () => {
      executeCalls += 1;
      return {
        executed: true,
        actionType: ActionType.linux_open_port,
        deviceId: device.id,
        commands: [{ template: "linux_open_port", stdout: "ok", stderr: "", exitCode: 0 }],
      };
    },
  } as unknown as DeviceConnector;

  assert.equal(executeCalls, 0);
  const executed = await quickExecuteActionPlan(built.value.actionPlanId, { intent: "execute" }, { selectConnector: () => fakeConnector });
  assert.equal(executeCalls, 1);
  assert.equal(executed?.status, ActionPlanStatus.succeeded);
});

test("parameterized preview/manual catalog action builds review plan but never executes", async (t) => {
  const device = await prisma.device.create({
    data: {
      name: "Task 17.6C Linux Manual Params",
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.183",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  });

  const session = startGuidedActionSession({
    blueprintId: catalogGuidedBlueprintId("linux.restrict-ssh"),
    deviceId: device.id,
    vendor: "linux",
    initialRequest: "restrict ssh",
    initialValues: { allowedSource: "198.51.100.0/24" },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.value.actionPlan.parametersJson.metadata.supportState, "manual_only");

  let executeCalls = 0;
  const fakeConnector = {
    name: "linux",
    supportedActions: [ActionType.generic_security_action],
    supports: () => true,
    execute: async () => {
      executeCalls += 1;
      throw new Error("connector should not be invoked");
    },
  } as unknown as DeviceConnector;
  await assert.rejects(() => quickExecuteActionPlan(built.value.actionPlanId, { intent: "execute" }, { selectConnector: () => fakeConnector }));
  assert.equal(executeCalls, 0);
});

test("FortiGate guided VPN execution does not run mandatory backup/export", async (t) => {
  const credential = await createCredential({ name: `task-17-6-fg-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.6 FortiGate VPN Execute",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.179",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
      credentialId: credential.id,
      capabilities: { fortigateStatus: { fortigate: { interfaces: ["internal1", "wan1"], zones: [], vdomMode: "disabled" } } },
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
  });

  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_vpn_setup",
    deviceId: device.id,
    vendor: "fortigate",
    initialRequest: "vpn create",
    initialValues: { vpnType: "ipsec_site_to_site", vpnName: "task17-6-vpn", localSubnet: "192.168.70.0/24", remoteSubnet: "10.30.40.0/24", allowedSubnets: "192.168.70.0/24", wanInterface: "wan1", lanInterface: "internal1", remoteGateway: "203.0.113.20", authMethod: "psk", pskMode: "manual", psk: "redaction-test-value", proposal: "aes256-sha256", dhGroup: "14", ikeVersion: "2", natTraversal: true, createFirewallPolicy: true, createStaticRoute: true, natEnabled: false, logTraffic: true, enableAfterCreate: false },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const preview = await dryRunActionPlan(built.value.actionPlanId);
  assert.equal(preview?.status, ActionPlanStatus.dry_run_ready);
  const dryRun = preview?.dryRunJson as Record<string, unknown>;
  const planned = JSON.stringify(dryRun);
  assert.doesNotMatch(planned, /show full-configuration/i);
  assert.doesNotMatch(planned, /backup\/export preflight required/i);
  assert.equal((dryRun.exactTarget as Record<string, unknown>)?.backupEnabled, false);
  assert.equal((dryRun.exactTarget as Record<string, unknown>)?.requiresBackup, false);

  let executeCalls = 0;
  let commandPayload = "";
  const fakeConnector = {
    name: "fortigate",
    supportedActions: [ActionType.fortigate_guided_vpn_setup],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async (plan) => {
      executeCalls += 1;
      const validation = validateFortiGateAction(plan);
      commandPayload = validation.commandSpecs.map((spec) => spec.command).join("\n");
      assert.equal(validation.valid, true, validation.errors.join(", "));
      assert.doesNotMatch(commandPayload, /show full-configuration/i);
      return {
        executed: true,
        actionType: ActionType.fortigate_guided_vpn_setup,
        deviceId: device.id,
        commands: validation.commandSpecs.map((spec) => ({ template: spec.template, stdout: "OK", stderr: "", exitCode: 0 })),
        warnings: ["Backup is disabled for Quick Controlled execution."],
        rollbackJson: { type: "delete_created_ipsec_vpn", backupEnabled: false, requiresBackup: false },
      };
    },
  } as unknown as DeviceConnector;

  const executed = await quickExecuteActionPlan(built.value.actionPlanId, { intent: "execute" }, { selectConnector: () => fakeConnector });
  assert.equal(executeCalls, 1);
  assert.equal(executed?.status, ActionPlanStatus.succeeded);
  assert.match(commandPayload, /config vpn ipsec phase1-interface/);
  assert.doesNotMatch(commandPayload, /show full-configuration/i);
  const metadata = (executed?.parametersJson as Record<string, Record<string, unknown>>).metadata;
  assert.equal(metadata.connectorInvoked, true);
  assert.equal(metadata.backupEnabled, false);
  assert.equal((executed?.resultJson as Record<string, unknown>).backupEnabled, false);
  const audit = await prisma.actionAuditLog.findMany({ where: { actionPlanId: built.value.actionPlanId } });
  assert.equal(audit.some((entry) => entry.eventType === "backup_export_created"), false);
  assert.ok(audit.some((entry) => entry.eventType === "connector_invoked" && (entry.metadataJson as Record<string, unknown>)?.backupEnabled === false));
});

test("FortiGate guided VPN invalid params still fail before connector execution", async (t) => {
  const credential = await createCredential({ name: `task-17-6-fg-invalid-${Date.now()}`, type: "password", username: "tester", password: "test-only-not-used", sudo: false });
  const device = await prisma.device.create({
    data: {
      name: "Task 17.6 FortiGate VPN Invalid Execute",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.180",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
      credentialId: credential.id,
      capabilities: { fortigateStatus: { fortigate: { interfaces: ["internal1", "wan1"], zones: [], vdomMode: "disabled" } } },
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.deviceCredential.delete({ where: { id: credential.id } });
  });

  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_vpn_setup",
    deviceId: device.id,
    vendor: "fortigate",
    initialRequest: "vpn create",
    initialValues: { vpnType: "ipsec_site_to_site", vpnName: "task17-6-bad", localSubnet: "192.168.70.0/24", remoteSubnet: "10.30.40.0/24", allowedSubnets: "192.168.70.0/24", wanInterface: "wan1", lanInterface: "internal1", remoteGateway: "203.0.113.30", authMethod: "psk", pskMode: "manual", psk: "redaction-test-value", proposal: "aes256-sha256", dhGroup: "14", ikeVersion: "2", natTraversal: true, createFirewallPolicy: true, createStaticRoute: true },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, true);
  if (!built.ok) return;
  await prisma.actionPlan.update({
    where: { id: built.value.actionPlanId },
    data: { parametersJson: { ...(built.value.actionPlan.parametersJson as Record<string, unknown>), wanInterface: "guided_action_wizard" } },
  });

  let executeCalls = 0;
  const fakeConnector = {
    name: "fortigate",
    supportedActions: [ActionType.fortigate_guided_vpn_setup],
    supports: () => true,
    testConnection: async () => { throw new Error("not used"); },
    getCapabilities: async () => { throw new Error("not used"); },
    collectStatus: async () => { throw new Error("not used"); },
    dryRun: async () => { throw new Error("not used"); },
    rollback: async () => { throw new Error("not used"); },
    execute: async () => {
      executeCalls += 1;
      throw new Error("connector should not be invoked");
    },
  } as unknown as DeviceConnector;

  await assert.rejects(() => quickExecuteActionPlan(built.value.actionPlanId, { intent: "execute" }, { selectConnector: () => fakeConnector }));
  assert.equal(executeCalls, 0);
  const stored = await prisma.actionPlan.findUnique({ where: { id: built.value.actionPlanId } });
  const metadata = (stored?.parametersJson as Record<string, Record<string, unknown>>).metadata;
  assert.notEqual(metadata?.connectorInvoked, true);
});

test("FortiGate guided VPN parameter schema maps canonical interfaces and rejects placeholders", () => {
  const normalized = normalizeFortiGateGuidedVpnParameters({
    vpnName: "test-vpn",
    wanInterface: "port2",
    lanInterface: "port1",
    remoteGateway: "185.238.45.165",
    localSubnet: "192.168.1.0/24",
    remoteSubnet: "10.10.10.0/24",
    pskSecretRef: "secret-ref",
    source: "guided_action_wizard",
  });
  assert.equal(normalized.lanInterface, "port1");
  assert.equal(normalized.wanInterface, "port2");
  assert.equal(normalized.srcInterface, undefined);
  assert.equal(normalized.dstInterface, undefined);
  assert.doesNotMatch(JSON.stringify(normalized), /"lanInterface":"guided_action_wizard"/);

  const bad = validateFortiGateGuidedVpnParameters({
    vpnName: "bad-vpn",
    wanInterface: "guided_action_wizard",
    lanInterface: "",
    remoteGateway: "185.238.45.165",
    localSubnet: "192.168.1.0/33",
    remoteSubnet: "10.10.10.0/24",
  }, new Set(["port1", "port2"]));
  assert.ok(bad.issues.some((issue) => issue.field === "wanInterface"));
  assert.ok(bad.issues.some((issue) => issue.field === "lanInterface"));
  assert.ok(bad.issues.some((issue) => issue.field === "localSubnet"));
  assert.ok(bad.issues.some((issue) => issue.field === "pskSecretRef"));
  assert.equal(bad.issues.some((issue) => issue.field === "srcInterface"), false);
});

test("FortiGate VPN guided build rejects invalid CIDR before ActionPlan creation", async (t) => {
  const device = await prisma.device.create({
    data: {
      name: "Task 17.2C FortiGate VPN Invalid",
      vendor: "Fortinet",
      type: "fortigate",
      host: "192.0.2.176",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.actionPlan.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
  });
  const before = await prisma.actionPlan.count({ where: { deviceId: device.id } });
  const session = startGuidedActionSession({
    blueprintId: "fortigate_guided_vpn_setup",
    deviceId: device.id,
    vendor: "fortigate",
    initialRequest: "vpn create",
    initialValues: { vpnType: "ipsec_site_to_site", vpnName: "vpn_bad", localSubnet: "10.0.0.0/33", remoteSubnet: "10.1.0.0/24", allowedSubnets: "10.0.0.0/24", wanInterface: "wan1", lanInterface: "port2", remoteGateway: "203.0.113.5", authMethod: "psk", pskMode: "manual", psk: "redaction-test-value" },
  });
  assert.equal(session.ok, true);
  const built = await buildGuidedActionPlan(session.ok ? session.value.sessionId : "");
  assert.equal(built.ok, false);
  assert.equal(built.ok ? "" : built.error, "VALIDATION_FAILED");
  assert.equal(await prisma.actionPlan.count({ where: { deviceId: device.id } }), before);
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
