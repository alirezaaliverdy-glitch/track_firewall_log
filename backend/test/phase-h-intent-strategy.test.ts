import assert from "node:assert/strict";
import test from "node:test";
import { classifyAssistantIntent } from "../src/ai/assistant-intent-classifier.js";
import { decideAssistantIntent, resolveExecutionStrategy } from "../src/ai/assistant-intent-decision.js";

test("Phase H intent model keeps explanation requests out of mutation planning", () => {
  const classification = classifyAssistantIntent({
    message: "Explain the command used to create a VLAN.",
    hasSelectedDevice: true,
  });
  const decision = decideAssistantIntent({
    message: "Explain the command used to create a VLAN.",
    classification,
    targetDevice: { id: "sw-1", vendor: "cisco", platform: "ios-xe" },
  });

  assert.equal(decision.intent, "conversation");
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.requiresLiveData, false);
  assert.equal(decision.destructivePotential, "none");
  assert.equal(resolveExecutionStrategy({ decision }), "chat_only");
});

test("Phase H intent model distinguishes live monitoring from cached answers", () => {
  const classification = classifyAssistantIntent({
    message: "Check current VLANs now",
    hasSelectedDevice: true,
  });
  const decision = decideAssistantIntent({
    message: "Check current VLANs now",
    classification,
    targetDevice: { id: "sw-1", vendor: "cisco", platform: "ios-xe" },
    hasFreshCachedEvidence: true,
  });

  assert.equal(decision.intent, "monitoring_live");
  assert.equal(decision.requiresLiveData, true);
  assert.equal(decision.requiresApproval, true);
  assert.equal(decision.destructivePotential, "none");
  assert.equal(resolveExecutionStrategy({ decision }), "live_monitoring");
});

test("Phase H strategy resolver routes catalog, guided, and generic action plans explicitly", () => {
  const classification = classifyAssistantIntent({
    message: "Create VLAN 120",
    hasSelectedDevice: true,
  });
  const decision = decideAssistantIntent({
    message: "Create VLAN 120",
    classification,
    targetDevice: { id: "sw-1", vendor: "cisco", platform: "ios-xe" },
  });

  assert.equal(decision.intent, "single_step_action");
  assert.equal(resolveExecutionStrategy({
    decision,
    resolution: {
      mode: "executable_action_plan",
      canonicalVendor: "cisco",
      canonicalActionType: "generic_security_action",
      catalogCommandId: "cisco.create-vlan",
      executionTemplateRef: "cisco_create_vlan",
      connectorType: "cisco-ios-xe-ssh",
      implementationState: "implemented",
      executionSupport: "connector",
      normalizedParams: { vlanId: 120 },
      missingFields: [],
      confidence: 0.9,
      reasonFa: "mapped",
      catalogItem: null,
    },
  }), "catalog_action");

  assert.equal(resolveExecutionStrategy({
    decision,
    resolution: {
      mode: "manual_or_not_supported",
      canonicalVendor: "cisco",
      canonicalActionType: "custom_vendor_action",
      catalogCommandId: null,
      executionTemplateRef: null,
      connectorType: null,
      implementationState: "manualOnly",
      executionSupport: "manual",
      normalizedParams: {},
      missingFields: [],
      confidence: 0.5,
      reasonFa: "generic",
      catalogItem: null,
    },
  }), "generic_vendor_action");
});
