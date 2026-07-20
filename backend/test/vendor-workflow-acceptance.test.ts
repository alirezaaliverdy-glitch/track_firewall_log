import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { resolveRegisteredAction } = await import("../src/actions/unified-action-registry.js");
const { buildAssistantTargetContextFromRecord } = await import("../src/ai/context/assistant-target-context.js");
const { buildAiStructuredActionPlan } = await import("../src/ai/ai-action-planner.js");

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
  return { ...baseDevice, ...overrides };
}

function planFor(message: string, device: ReturnType<typeof targetDevice>) {
  return buildAiStructuredActionPlan({
    message,
    selectedDevice: device,
    targetDeviceContext: buildAssistantTargetContextFromRecord(device),
  });
}

test("Phase 8 direct vendor actions resolve through the shared registry and registered connectors", () => {
  const cases = [
    { vendor: "linux", platform: "linux", key: "linux.daily-check", connector: "linux-ssh" },
    { vendor: "cisco", platform: "ios-xe", key: "cisco.show-version", connector: "cisco-ios-xe-ssh" },
    { vendor: "cisco", platform: "ios-classic", key: "cisco.show-version", connector: "cisco-ios-xe-ssh" },
    { vendor: "mikrotik", platform: "routeros", key: "mikrotik.daily-check", connector: "mikrotik-ssh" },
    { vendor: "fortigate", platform: "fortios", key: "fortigate.system-status", connector: "fortigate-ssh" },
  ];

  for (const item of cases) {
    const action = resolveRegisteredAction({ key: item.key, vendor: item.vendor, platform: item.platform });
    assert.equal(action?.vendor, item.vendor);
    assert.equal(action?.executable, true);
    assert.equal(action?.connector, item.connector);
    assert.doesNotMatch(JSON.stringify(action).toLowerCase(), /raw_command|shellcommand|ai_generated_command/);
  }
});

test("Phase 8 guided workflow examples stay selected-vendor scoped and backend gated", () => {
  const cases = [
    { vendor: "linux", device: targetDevice({ id: "lin-1", vendor: "Linux", type: "linux_edge" }), prompt: "restart nginx and verify status" },
    { vendor: "mikrotik", device: targetDevice({ id: "mt-1", vendor: "MikroTik", type: "mikrotik" }), prompt: "change SSH port to 2222 and verify" },
    { vendor: "fortigate", device: targetDevice({ id: "fg-1", vendor: "Fortinet", type: "fortigate" }), prompt: "create address object, VIP and policy then verify" },
    { vendor: "cisco", device: targetDevice({ id: "sw-1", vendor: "Cisco", type: "generic_firewall" }), prompt: "create VLAN 123, assign interface, save configuration and verify" },
  ];

  for (const item of cases) {
    const plan = planFor(item.prompt, item.device);
    assert.equal(plan.kind, "action_plan");
    assert.equal(plan.vendor, item.vendor);
    assert.equal(plan.backendExecutionRequired, true);
    assert.equal(plan.approvalRequired, true);
    assert.equal(plan.rawCommandExecution, false);
    assert.ok(plan.steps.length >= 2);
    assert.ok(plan.steps.every((step) => step.vendor === item.vendor));
    assert.ok(plan.steps.every((step) => step.rawCommandExecution === false));
  }
});

test("Phase 8 unsupported Cisco platforms do not reuse IOS-XE or IOS Classic actions", () => {
  assert.equal(resolveRegisteredAction({ key: "cisco.show-version", vendor: "cisco", platform: "nx-os" }), null);
  assert.equal(resolveRegisteredAction({ key: "cisco.show-version", vendor: "cisco", platform: "asa" }), null);
  assert.equal(resolveRegisteredAction({ key: "cisco.show-version", vendor: "cisco", platform: "ios-xr" }), null);
});
