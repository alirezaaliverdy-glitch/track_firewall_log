import assert from "node:assert/strict";
import test from "node:test";
import type { CommandCatalogItem } from "../src/commands/catalog/types.js";
import { ACTION_DEFINITION_SCHEMA_VERSION, toActionDefinition } from "../src/actions/definitions/action-definition.js";
import { ACTION_PAYLOAD_SCHEMA_VERSION, upcastActionPayload } from "../src/actions/definitions/json-payload-upcaster.js";
import { mockNetBoxHealth } from "../src/integrations/netbox/mock-adapter.js";
import { mockWazuhHealth } from "../src/integrations/wazuh/mock-adapter.js";

test("Phase R3 derives canonical ActionDefinition records from command catalog items", () => {
  const items: CommandCatalogItem[] = [{
    id: "linux.test-action",
    vendor: "linux",
    titleFa: "test",
    titleEn: "Test",
    descriptionFa: "test",
    category: "test",
    implementationState: "implemented",
    executionSupport: "connector",
    supportState: "verified",
    supportReason: "verified",
    supportReasonKey: "support.reason.verified",
    actionType: "linux_test_action",
    connectorType: "linux-ssh",
    riskLevel: "high",
    privilegeLevel: "admin",
    readOnly: false,
    mutating: true,
    requiresConfirmation: true,
    requiredParams: [{ key: "port", labelFa: "port", helpFa: "port", type: "number" }],
    optionalParams: [],
    defaultParams: {},
    paramCandidates: {},
    autoResolveParams: [],
    paramLabelsFa: { port: "port" },
    paramHelpFa: { port: "port" },
    tagsFa: ["test"],
    searchKeywordsFa: ["test"],
    supportedConnectors: ["linux-ssh"],
    prechecks: ["check"],
    validationRules: { port: ["number", "required"] },
    executionTemplateRef: "linux_test_action",
    verification: ["verify"],
    rollback: { available: true, steps: ["rollback"] },
    evidenceOutput: ["stdout"],
    supportedDeviceCapabilities: ["ssh"],
    disabledReasonFa: null,
    uiHints: { executable: true, badgeFa: "verified" }
  }];

  for (const item of items) {
    const definition = toActionDefinition(item);
    assert.equal(definition.schemaVersion, ACTION_DEFINITION_SCHEMA_VERSION);
    assert.equal(definition.id, item.id);
    assert.equal(definition.vendor, item.vendor);
    assert.equal(definition.risk.level, item.riskLevel);
    assert.equal(definition.execution.templateRef, item.executionTemplateRef);
    assert.equal(definition.execution.connectorType, item.connectorType);
    assert.equal(definition.ui.requiredParams.length, item.requiredParams.length);
    assert.deepEqual(definition.verification.checks, item.verification);
    assert.deepEqual(definition.rollback, item.rollback);
    assert.equal(definition.permissions.required, item.mutating && (item.riskLevel === "high" || item.riskLevel === "critical") ? "actions.execute.high_risk" : item.mutating ? "actions.execute.write" : "actions.execute.read");
    assert.equal(definition.production.executable, item.supportState === "verified");
  }
});

test("Phase R3 JSON action payload upcaster versions legacy and current payloads deterministically", () => {
  const legacy = upcastActionPayload({ port: 22, metadata: { planRevision: 2 } });
  assert.equal(legacy.schemaVersion, ACTION_PAYLOAD_SCHEMA_VERSION);
  assert.equal(legacy.metadata.schemaVersion, ACTION_PAYLOAD_SCHEMA_VERSION);
  assert.equal(legacy.metadata.planRevision, 2);
  assert.equal(legacy.parameters.port, 22);

  const current = upcastActionPayload({
    schemaVersion: ACTION_PAYLOAD_SCHEMA_VERSION,
    parameters: { serviceName: "ssh" },
    metadata: { schemaVersion: ACTION_PAYLOAD_SCHEMA_VERSION, planRevision: 4 }
  });
  assert.deepEqual(current.parameters, { serviceName: "ssh" });
  assert.equal(current.metadata.planRevision, 4);
});

test("Phase R3 mock integration health responses are clearly marked non-production", () => {
  for (const health of [mockNetBoxHealth(), mockWazuhHealth()]) {
    assert.equal(health.mode, "mock");
    assert.equal(health.production, false);
    assert.equal(health.nonProduction, true);
    assert.equal(health.executable, false);
    assert.match(health.warning, /non-production/i);
  }
});
