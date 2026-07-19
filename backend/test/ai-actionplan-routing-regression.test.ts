import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { buildAssistantTargetContextFromRecord } = await import("../src/ai/context/assistant-target-context.js");
const { resolveAiTemplate } = await import("../src/ai/ai-template-resolver.js");

const baseDevice = {
  name: "Target",
  host: "192.0.2.10",
  managementPort: 22,
  protocol: "ssh",
  status: "online",
  capabilities: {},
  statusChecks: [],
};

function targetDevice(overrides: { id: string; vendor: string; type: string }) {
  return {
    ...baseDevice,
    ...overrides,
  };
}

function resolveForTarget(request: string, device: ReturnType<typeof targetDevice>) {
  const targetDeviceContext = buildAssistantTargetContextFromRecord(device);
  return resolveAiTemplate({
    userText: request,
    selectedDevice: device,
    targetDeviceContext,
  });
}

test("MikroTik change SSH port uses selected target context and creates an ActionPlan candidate", () => {
  const resolution = resolveForTarget("change ssh port to 2222", targetDevice({ id: "mt-1", vendor: "MikroTik", type: "mikrotik" }));

  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalVendor, "mikrotik");
  assert.equal(resolution.canonicalActionType, "mikrotik_change_service_port");
  assert.equal(resolution.catalogCommandId, "legacy:mikrotik.change_service_port");
  assert.equal(resolution.connectorType, "mikrotik-ssh");
  assert.equal(resolution.executionSupport, "connector");
  assert.equal(resolution.normalizedParams.serviceName, "ssh");
  assert.equal(resolution.normalizedParams.newPort, 2222);
  assert.deepEqual(resolution.missingFields, []);
});

test("Cisco create VLAN uses selected Cisco context and does not need text vendor inference", () => {
  const resolution = resolveForTarget("create VLAN 123", targetDevice({ id: "sw-1", vendor: "Cisco", type: "cisco_switch" }));

  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalVendor, "cisco");
  assert.equal(resolution.canonicalActionType, "generic_security_action");
  assert.equal(resolution.catalogCommandId, "cisco.create-vlan");
  assert.equal(resolution.connectorType, "cisco-ios-xe-ssh");
  assert.equal(resolution.executionSupport, "connector");
  assert.equal(resolution.normalizedParams.vlanId, 123);
});

test("FortiGate create policy uses selected target catalog and creates an ActionPlan candidate", () => {
  const resolution = resolveForTarget("create policy", targetDevice({ id: "fg-1", vendor: "Fortinet", type: "fortigate" }));

  assert.equal(resolution.mode, "needs_input");
  assert.equal(resolution.canonicalVendor, "fortigate");
  assert.equal(resolution.canonicalActionType, "fortigate_create_policy");
  assert.equal(resolution.catalogCommandId, "legacy:fortigate.create_firewall_policy");
  assert.equal(resolution.connectorType, "fortigate-ssh");
  assert.equal(resolution.executionSupport, "connector");
  assert.deepEqual(resolution.missingFields, ["srcInterface", "dstInterface"]);
});

test("Linux supported service status action uses selected Linux context", () => {
  const resolution = resolveForTarget("check nginx service status", targetDevice({ id: "lin-1", vendor: "Linux", type: "linux_edge" }));

  assert.equal(resolution.mode, "executable_action_plan");
  assert.equal(resolution.canonicalVendor, "linux");
  assert.equal(resolution.canonicalActionType, "linux_check_service_status");
  assert.equal(resolution.catalogCommandId, "linux.service-status");
  assert.equal(resolution.connectorType, "linux-ssh");
  assert.equal(resolution.executionSupport, "connector");
  assert.equal(resolution.normalizedParams.serviceName, "nginx");
});

test("unsupported custom request stays chat-only with no ActionPlan catalog match", () => {
  const resolution = resolveForTarget("configure something for me", targetDevice({ id: "mt-2", vendor: "MikroTik", type: "mikrotik" }));

  assert.equal(resolution.mode, "manual_or_not_supported");
  assert.equal(resolution.canonicalVendor, "mikrotik");
  assert.equal(resolution.catalogCommandId, null);
  assert.equal(resolution.executionTemplateRef, null);
  assert.equal(resolution.catalogItem, null);
  assert.equal(resolution.targetSupportedAction, undefined);
  assert.equal(resolution.executionSupport, "manual");
});

test("resolver does not infer another vendor from prompt text when a target is selected", () => {
  const resolution = resolveForTarget("on Cisco create VLAN 123", targetDevice({ id: "mt-3", vendor: "MikroTik", type: "mikrotik" }));

  assert.equal(resolution.canonicalVendor, "mikrotik");
  assert.notEqual(resolution.catalogCommandId, "cisco.create-vlan");
  assert.notEqual(resolution.connectorType, "cisco-ios-xe-ssh");
  assert.equal(resolution.mode, "manual_or_not_supported");
});
