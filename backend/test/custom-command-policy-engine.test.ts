import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionType, DeviceProtocol, DeviceType } from "@prisma/client";
import { buildCustomCommandPlan, validateCustomCommandPlan } from "../src/ai/custom-action-plan.js";
import { getCustomCommandPolicy } from "../src/commands/custom-policy/custom-command-policy.registry.js";

const customFacade = readFileSync(new URL("../src/ai/custom-action-plan.ts", import.meta.url), "utf8");
const actionPlanSource = readFileSync(new URL("../src/services/action-plan.service.ts", import.meta.url), "utf8");
const policyGuardSource = readFileSync(new URL("../src/services/policy-guard.service.ts", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../src/commands/custom-policy/custom-command-policy.registry.ts", import.meta.url), "utf8");

const linuxDevice = { id: "linux-1", type: DeviceType.linux_edge, vendor: "Linux", protocol: DeviceProtocol.ssh, capabilities: { platform: "ubuntu" } };
const mikrotikDevice = { id: "mt-1", type: DeviceType.mikrotik, vendor: "MikroTik", protocol: DeviceProtocol.ssh, capabilities: { platform: "routeros" } };
const fortigateDevice = { id: "fg-1", type: DeviceType.fortigate, vendor: "FortiGate", protocol: DeviceProtocol.ssh, capabilities: { platform: "fortios" } };
const ciscoDevice = { id: "iosxe-1", type: DeviceType.generic_firewall, vendor: "Cisco", protocol: DeviceProtocol.ssh, capabilities: { platform: "ios-xe" } };

test("custom command validator delegates allow and deny decisions to the policy registry", () => {
  assert.match(customFacade, /evaluateCustomCommandPolicy/);
  assert.doesNotMatch(customFacade, /function linuxCommandAllowed/);
  assert.doesNotMatch(customFacade, /function routerOsCommandAllowed/);
  assert.match(registrySource, /POLICIES: Record<CustomConnectorVendor, VendorCustomCommandPolicy>/);
  assert.match(actionPlanSource, /"ai_custom_connector_plan"/);
  assert.match(policyGuardSource, /"ai_custom_connector_plan"/);
});

test("vendor policy registry exposes platform-aware policies for all connector vendors", () => {
  assert.equal(getCustomCommandPolicy("linux").supportsDevice(linuxDevice), true);
  assert.equal(getCustomCommandPolicy("mikrotik").supportsDevice(mikrotikDevice), true);
  assert.equal(getCustomCommandPolicy("fortigate").supportsDevice(fortigateDevice), true);
  assert.equal(getCustomCommandPolicy("cisco").supportsDevice(ciscoDevice), true);
  assert.equal(getCustomCommandPolicy("linux").supportsDevice(mikrotikDevice), false);
});

test("valid custom commands not in the static catalog pass vendor policy validation", () => {
  const cases = [
    { device: linuxDevice, message: "Restart nginx on this server" },
    { device: mikrotikDevice, message: "Set RouterOS identity to branch-edge-1" },
    { device: fortigateDevice, message: "Set admin timeout to 30 minutes" },
    { device: ciscoDevice, message: "Set interface GigabitEthernet1 description uplink" },
  ];
  for (const item of cases) {
    const plan = buildCustomCommandPlan({ message: item.message, device: item.device });
    assert.ok(plan);
    const validation = validateCustomCommandPlan({ plan, device: item.device, actionType: ActionType.custom_vendor_action });
    assert.equal(validation.valid, true, `${plan.vendor}: ${validation.errors.join("; ")}`);
    assert.equal(validation.normalizedPlan?.backendValidation.commandSafety, "passed");
    assert.equal(validation.normalizedPlan?.rawCommandExecution, false);
    assert.ok(validation.rollbackJson.requiredPermission);
  }
});

test("policy engine exposes typed v2 operations, ordering dependencies, limits, and role metadata", () => {
  const plan = buildCustomCommandPlan({ message: "Restart nginx on this server", device: linuxDevice });
  assert.ok(plan);
  assert.equal(plan.schemaVersion, "custom_action_plan_v2");
  assert.equal(plan.source, "ai_custom");
  assert.equal(plan.requiresExplicitApproval, true);
  assert.deepEqual(plan.orderedOperations.map((operation) => operation.dependsOn), [[]]);
  const validation = validateCustomCommandPlan({ plan, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(validation.valid, true);
  assert.equal(validation.normalizedPlan?.typedParameters.requiredRole, "admin");
  assert.equal(validation.normalizedPlan?.typedParameters.requiredPermission, "actions.custom.linux");
  assert.equal(validation.normalizedPlan?.typedParameters.outputLimitBytes, 64 * 1024);
});

test("hard-deny, secret, and missing-verification policies fail closed with exact reasons", () => {
  const destructive = buildCustomCommandPlan({
    message: "Restart nginx",
    device: linuxDevice,
    parameters: { orderedCommands: ["sudo -n systemctl restart nginx", "rm -rf /"], verificationCommands: ["systemctl is-active nginx"] },
  });
  assert.ok(destructive);
  const destructiveValidation = validateCustomCommandPlan({ plan: destructive, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(destructiveValidation.valid, false);
  assert.ok(destructiveValidation.errors.some((error) => /hard-denied|not allowed/i.test(error)));

  const secret = buildCustomCommandPlan({
    message: "Set interface GigabitEthernet1 description uplink",
    device: ciscoDevice,
    parameters: { orderedCommands: ["username admin secret topsecret"], verificationCommands: ["show running-config interface GigabitEthernet1"] },
  });
  assert.ok(secret);
  const secretValidation = validateCustomCommandPlan({ plan: secret, device: ciscoDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(secretValidation.valid, false);
  assert.ok(secretValidation.errors.some((error) => /secret|not allowed/i.test(error)));

  const noVerification = buildCustomCommandPlan({
    message: "Restart nginx",
    device: linuxDevice,
    parameters: { orderedCommands: ["sudo -n systemctl restart nginx"], verificationCommands: [] },
  });
  assert.ok(noVerification);
  noVerification.verificationCommands = [];
  const noVerificationValidation = validateCustomCommandPlan({ plan: noVerification, device: linuxDevice, actionType: ActionType.custom_vendor_action });
  assert.equal(noVerificationValidation.valid, false);
  assert.ok(noVerificationValidation.errors.some((error) => /explicit verification/i.test(error)));
});
