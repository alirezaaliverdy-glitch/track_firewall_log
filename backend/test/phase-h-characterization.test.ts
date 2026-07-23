import assert from "node:assert/strict";
import test from "node:test";
import { ActionType } from "@prisma/client";
import { buildCustomCommandPlan, validateCustomCommandPlan } from "../src/ai/custom-action-plan.js";

const ciscoDevice = {
  id: "phase-h-cisco",
  type: "generic_firewall",
  vendor: "Cisco",
  protocol: "ssh",
  capabilities: { platform: "ios-xe" },
};

test("Phase H Cisco VLAN regression: create VLAN produces connector-backed custom commands and verification", () => {
  const plan = buildCustomCommandPlan({
    message: "Create VLAN 120 named STAFF",
    device: ciscoDevice,
    parameters: {},
  });

  assert.ok(plan);
  assert.equal(plan.vendor, "cisco");
  assert.equal(plan.connectorType, "cisco-ios-xe-ssh");
  assert.equal(plan.executionTemplateRef, "cisco_custom_connector_command");
  assert.equal(plan.rawCommandExecution, false);
  assert.deepEqual(plan.missingFields, []);
  assert.deepEqual(plan.orderedCommands, ["configure terminal", "vlan 120", "name STAFF", "end"]);
  assert.deepEqual(plan.verificationCommands, ["show vlan brief | include ^120\\b"]);
  assert.equal(plan.typedParameters.operation, "create_vlan");
  assert.equal(plan.typedParameters.vlanId, 120);
  assert.equal(plan.typedParameters.name, "STAFF");

  const validation = validateCustomCommandPlan({ plan, device: ciscoDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedPlan?.backendValidation.commandSafety, "passed");
  assert.equal(validation.normalizedPlan?.backendValidation.vendorPlatformCompatible, true);
});

test("Phase H generic custom action: catalog absence does not force manual-only unsupported state", () => {
  const plan = buildCustomCommandPlan({
    message: "Enable DHCP snooping on VLAN 10",
    device: ciscoDevice,
    parameters: {},
  });

  assert.ok(plan);
  assert.equal(plan.vendor, "cisco");
  assert.equal(plan.connectorType, "cisco-ios-xe-ssh");
  assert.equal(plan.executionTemplateRef, "cisco_custom_connector_command");
  assert.equal(plan.rawCommandExecution, false);
  assert.deepEqual(plan.missingFields, []);
  assert.deepEqual(plan.orderedCommands, ["configure terminal", "ip dhcp snooping", "ip dhcp snooping vlan 10", "end"]);
  assert.deepEqual(plan.verificationCommands, ["show ip dhcp snooping"]);
  assert.equal(plan.typedParameters.operation, "enable_dhcp_snooping");
  assert.equal(plan.typedParameters.vlanId, 10);

  const validation = validateCustomCommandPlan({ plan, device: ciscoDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true);
  assert.equal(validation.errors, []);
  assert.equal(validation.normalizedPlan?.backendValidation.commandSafety, "passed");
});
