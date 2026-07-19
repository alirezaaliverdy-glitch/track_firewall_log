import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { buildAssistantTargetContextFromRecord } = await import("../src/ai/context/assistant-target-context.js");
const { buildAiStructuredActionPlan, isInformationalAssistantRequest } = await import("../src/ai/ai-action-planner.js");

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

function actionPlanSteps(plan: ReturnType<typeof buildAiStructuredActionPlan>) {
  assert.equal(plan.kind, "action_plan");
  return plan.steps;
}

test("MikroTik change SSH port and verify creates a structured backend-resolved plan", () => {
  const plan = planFor("change SSH port to 2222 and then verify it", targetDevice({ id: "mt-1", vendor: "MikroTik", type: "mikrotik" }));
  const steps = actionPlanSteps(plan);

  assert.equal(plan.vendor, "mikrotik");
  assert.equal(plan.executionEligibility, "ready_for_action_center");
  assert.deepEqual(steps.map((step) => step.catalogCommandId), ["legacy:mikrotik.change_service_port", "mikrotik.management-services"]);
  assert.deepEqual(steps.map((step) => step.status), ["executable", "executable"]);
  assert.equal(steps[0].parameters.newPort, 2222);
  assert.equal(steps[0].parameters.serviceName, "ssh");
  assert.equal(steps[1].dependencies[0], "step-1");
});

test("FortiGate create address object, VIP and policy creates parameterized supported steps", () => {
  const plan = planFor("create address object, VIP and policy", targetDevice({ id: "fg-1", vendor: "Fortinet", type: "fortigate" }));
  const steps = actionPlanSteps(plan);

  assert.equal(plan.vendor, "fortigate");
  assert.equal(plan.executionEligibility, "needs_parameters");
  assert.deepEqual(steps.map((step) => step.actionType), ["fortigate_create_address_object", "fortigate_create_vip", "fortigate_create_policy"]);
  assert.deepEqual(steps.map((step) => step.status), ["needs_parameters", "needs_parameters", "needs_parameters"]);
  assert.equal(plan.blockedStepCount, 0);
  assert.ok(plan.missingParameterFields.includes("addressObjectName"));
  assert.ok(plan.missingParameterFields.includes("srcInterface"));
});

test("Cisco create VLAN, assign interface and save config uses Cisco selected-device context only", () => {
  const plan = planFor("on MikroTik create VLAN 123, assign interface and save config", targetDevice({ id: "sw-1", vendor: "Cisco", type: "generic_firewall" }));
  const steps = actionPlanSteps(plan);

  assert.equal(plan.vendor, "cisco");
  assert.deepEqual(steps.map((step) => step.catalogCommandId), ["cisco.create-vlan", "cisco.assign-access-vlan", "cisco.save-configuration"]);
  assert.ok(steps.every((step) => step.vendor === "cisco"));
  assert.ok(steps.every((step) => step.connectorType === "cisco-ios-xe-ssh"));
  assert.notEqual(steps[0].vendor, "mikrotik");
  assert.equal(steps[0].parameters.vlanId, 123);
  assert.equal(steps[1].parameters.vlanId, 123);
  assert.ok(steps[1].missingFields.includes("interfaceName"));
});

test("Linux restart nginx and verify status blocks unsupported restart but resolves verification", () => {
  const plan = planFor("restart nginx and verify status", targetDevice({ id: "lin-1", vendor: "Linux", type: "linux_edge" }));
  const steps = actionPlanSteps(plan);

  assert.equal(plan.vendor, "linux");
  assert.equal(plan.executionEligibility, "partially_blocked");
  assert.equal(steps[0].status, "blocked");
  assert.equal(steps[0].catalogCommandId, null);
  assert.equal(steps[0].unsupportedCapability, "restart nginx");
  assert.equal(steps[1].catalogCommandId, "linux.service-status");
  assert.equal(steps[1].status, "executable");
  assert.equal(steps[1].parameters.serviceName, "nginx");
});

test("mixed unsupported step creates a plan but blocks execution eligibility", () => {
  const plan = planFor("create VLAN 44 and erase configuration", targetDevice({ id: "sw-2", vendor: "Cisco", type: "generic_firewall" }));
  const steps = actionPlanSteps(plan);

  assert.equal(plan.vendor, "cisco");
  assert.equal(plan.executionEligibility, "partially_blocked");
  assert.equal(steps[0].catalogCommandId, "cisco.create-vlan");
  assert.equal(steps[0].status, "executable");
  assert.equal(steps[1].status, "blocked");
  assert.equal(steps[1].catalogCommandId, null);
});

test("AI structured plans never include raw command execution fields", () => {
  const plan = planFor("create VLAN 44, assign interface and save config", targetDevice({ id: "sw-3", vendor: "Cisco", type: "generic_firewall" }));
  const serialized = JSON.stringify(plan).toLowerCase();

  assert.equal(plan.rawCommandExecution, false);
  assert.ok(actionPlanSteps(plan).every((step) => step.rawCommandExecution === false));
  assert.doesNotMatch(serialized, /rawcli|raw_command|shellcommand|ai_generated_command/);
});

test("informational requests remain chat-only", () => {
  assert.equal(isInformationalAssistantRequest("how many VLANs do I have"), true);
  const plan = planFor("how many VLANs do I have", targetDevice({ id: "sw-info", vendor: "Cisco", type: "generic_firewall" }));

  assert.equal(plan.kind, "chat_only");
  assert.equal(plan.reason, "informational");
});

test("execution remains backend Action Center gated after explicit approval", () => {
  const plan = planFor("change SSH port to 2222 and then verify it", targetDevice({ id: "mt-2", vendor: "MikroTik", type: "mikrotik" }));

  assert.equal(plan.kind, "action_plan");
  assert.equal(plan.backendExecutionRequired, true);
  assert.equal(plan.approvalRequired, true);
  assert.ok(plan.steps.every((step) => step.backendValidated));
  assert.ok(plan.steps.every((step) => step.connectorType === "mikrotik-ssh"));
});
