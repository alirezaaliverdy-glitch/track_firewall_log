import test from "node:test";
import assert from "node:assert/strict";
import { monitoringCoverage } from "../src/monitoring/monitoring-coverage.js";
const now = new Date("2026-10-19T10:00:00Z");
const device = { id: "one", name: "Fixture", vendor: "mikrotik", liveCollectorSupported: true };
const collector = { deviceId: "one", enabled: true, effectiveIntervalSeconds: 60, lastSuccessAt: now, lastErrorAt: null, consecutiveFailures: 0 };
test("coverage reflects current per-device evidence, not cumulative successful runs", () => {
  const result = monitoringCoverage([device], [collector], now);
  assert.equal(result.summary.fresh, 1); assert.equal(result.devices[0].state, "fresh"); assert.ok(result.devices[0].eventRuleCount > 0);
  assert.equal(result.scope, "configured-checks-only"); assert.equal(result.automaticRemediation, false);
  assert.equal(monitoringCoverage([device], [{ ...collector, lastSuccessAt: new Date(now.getTime() - 181000) }], now).devices[0].state, "stale");
  assert.equal(monitoringCoverage([device], [{ ...collector, lastSuccessAt: null }], now).devices[0].state, "not_checked");
  assert.equal(monitoringCoverage([device], [{ ...collector, lastSuccessAt: new Date(now.getTime() + 60000) }], now).devices[0].state, "not_checked");
});
test("failed, disabled, missing and unsupported monitoring are not reported healthy", () => {
  assert.equal(monitoringCoverage([device], [{ ...collector, consecutiveFailures: 1 }], now).devices[0].state, "failed");
  assert.equal(monitoringCoverage([device], [{ ...collector, enabled: false }], now).devices[0].state, "disabled");
  assert.equal(monitoringCoverage([device], [], now).devices[0].state, "not_configured");
  const unsupported = monitoringCoverage([{ ...device, vendor: "unrecognized", liveCollectorSupported: false }], [], now);
  assert.equal(unsupported.summary.gaps, 1); assert.equal(unsupported.devices[0].state, "unsupported"); assert.equal(unsupported.devices[0].eventRuleCount, 0);
  assert.equal(unsupported.devices[0].officialGuide, null);
});
