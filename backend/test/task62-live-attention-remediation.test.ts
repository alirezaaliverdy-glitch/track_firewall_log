import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backend = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const frontend = (path: string) => readFileSync(`/src/${path}`, "utf8");

test("asset health is projected from fresh evidence for every managed vendor", () => {
  const source = backend("assets/asset-intelligence.service.ts");
  assert.match(source, /assessDeviceHealth\(\{/);
  assert.match(source, /statusChecks:\s*\{[^}]*checkedAt:\s*"desc"/s);
  assert.match(source, /metricSamples:[\s\S]*telemetrySince/);
  assert.match(source, /findings:\s*\{\s*where:\s*openFindingWhere/);
  assert.match(source, /healthState:\s*assessment\.state/);
  assert.match(source, /healthObservedAt:\s*observedAt/);
});

test("dashboard refreshes findings and prioritizes current actionable vendor problems", () => {
  const hook = frontend("features/security/hooks/useFindings.ts");
  const dashboard = frontend("features/dashboard/pages/DashboardPage.tsx");
  assert.match(hook, /setInterval\([\s\S]*5_000/);
  assert.match(hook, /visibilitychange/);
  assert.match(dashboard, /actionableFindings = openFindings\.filter/);
  assert.match(dashboard, /\["critical", "high"\]/);
  assert.match(dashboard, /const selected = new Map<string, AttentionItem>/);
  assert.match(dashboard, /left\.priority - right\.priority/);
  assert.match(dashboard, /"resolved", "closed", "false_positive"/);
});

test("verified actions trigger a read-only health refresh without fabricating execution failure", () => {
  const execution = backend("actions/action-plan/action-plan-execution.service.ts");
  const fleet = backend("services/fleet-health.service.ts");
  assert.match(execution, /if \(verification\.ok\) \{[\s\S]*refreshFleetHealthDevice\(device\.id\)/);
  assert.match(execution, /post_execution_health_refreshed/);
  assert.match(execution, /post_execution_health_refresh_failed/);
  assert.match(execution, /findingRemediationActions\.has\(plan\.actionType\)/);
  assert.match(execution, /security\.finding\.remediated/);
  assert.match(execution, /reason: "verified_connector_remediation"/);
  assert.match(execution, /\.catch\(\(\) => undefined\)/);
  assert.match(fleet, /export async function refreshFleetHealthDevice/);
  assert.match(fleet, /if \(running\) \{\s*await running;\s*if \(!force\) return;/);
  assert.match(fleet, /collect\(deviceId, true\)/);
  assert.match(fleet, /if \(force\)[\s\S]*collectLinuxSecuritySnapshot/);
});
