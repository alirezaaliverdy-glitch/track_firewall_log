import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isReadOnlyResolution, monitoringMetadata } from "../src/monitoring/monitoring-action-plan.js";

test("Phase H monitoring metadata is read-only and connector-backed", () => {
  const resolution = {
    mode: "executable_action_plan",
    canonicalVendor: "cisco",
    canonicalActionType: "generic_security_action",
    catalogCommandId: "cisco.show-vlan-brief",
    executionTemplateRef: "cisco_show_vlan_brief",
    connectorType: "cisco-ios-xe-ssh",
    implementationState: "implemented",
    executionSupport: "connector",
    normalizedParams: {},
    missingFields: [],
    confidence: 0.94,
    reasonFa: "mapped",
    catalogItem: { readOnly: true, mutating: false },
  } as never;

  assert.equal(isReadOnlyResolution(resolution), true);
  const metadata = monitoringMetadata({ resolution });
  assert.equal(metadata.source, "monitoring_live");
  assert.equal(metadata.readOnly, true);
  assert.equal(metadata.monitoring, true);
  assert.equal(metadata.connectorInvoked, false);
  assert.equal(metadata.resultRoute, "/monitoring/actions/:actionPlanId/result");
});

test("Phase H assistant monitoring branch creates only read-only plans and never executes", () => {
  const source = readFileSync(new URL("../src/ai/assistant/assistant-conversation.service.ts", import.meta.url), "utf8");
  const nonActionBlock = source.slice(source.indexOf('if (classification.mode !== "action_request")'), source.indexOf("const earlyResolution = resolveAiTemplate"));
  assert.match(nonActionBlock, /intentDecision\.intent === "monitoring_live"/);
  assert.match(nonActionBlock, /isReadOnlyResolution\(monitoringResolution\)/);
  assert.match(nonActionBlock, /readOnly:\s*true/);
  assert.match(nonActionBlock, /source:\s*"monitoring_live"/);
  assert.doesNotMatch(nonActionBlock, /quickExecuteActionPlan|executeActionPlan|selectDeviceConnector/);
});

test("Phase H monitoring result route is dedicated", () => {
  const app = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /\/monitoring\/actions\/:actionId\/result/);
  assert.match(app, /MonitoringActionResultRoute/);
  assert.match(app, /ActionResultView actionPlanId=\{actionId\}/);
});
