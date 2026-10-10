import assert from "node:assert/strict";
import test from "node:test";
import { assessDeviceHealth } from "../src/services/device-health-assessment.js";

const now = new Date("2026-10-10T10:00:00.000Z");
const online = { status: "online", checkedAt: new Date("2026-10-10T09:59:00.000Z") };
const measured = { state: "healthy", score: 96, collectedAt: new Date("2026-10-10T09:58:00.000Z") };
const base = { status: online, snapshot: measured, metrics: [], findings: [], now };

test("healthy requires fresh reachability and measured health", () => {
  assert.deepEqual(assessDeviceHealth(base), { state: "healthy", score: 96, coverage: "measured", reasons: [] });
  assert.equal(assessDeviceHealth({ ...base, snapshot: null }).state, "unknown");
  assert.equal(assessDeviceHealth({ ...base, status: null, collection: null }).state, "unknown");
});

test("a resolved finding disappears, but cannot fabricate healthy telemetry", () => {
  const findings = [{ severity: "critical", status: "resolved" }];
  assert.equal(assessDeviceHealth({ ...base, findings }).state, "healthy");
  assert.equal(assessDeviceHealth({ ...base, snapshot: null, findings }).state, "unknown");
  assert.equal(assessDeviceHealth({ ...base, findings: [{ severity: "critical", status: "active" }] }).state, "critical");
});

test("current outage or failed collection cannot be hidden by a healthy snapshot", () => {
  assert.equal(assessDeviceHealth({ ...base, status: { status: "offline", checkedAt: now } }).state, "critical");
  assert.equal(assessDeviceHealth({ ...base, collection: { status: "failed", startedAt: now } }).state, "warning");
});

test("fresh, valid resources affect health while stale or invalid samples do not", () => {
  const samples = [
    { metricKey: "cpu.usage_percent", value: 90, timestamp: now },
    { metricKey: "cpu.usage_percent", value: 12, timestamp: new Date("2026-10-10T09:00:00.000Z") }
  ];
  assert.equal(assessDeviceHealth({ ...base, metrics: samples }).state, "warning");
  assert.equal(assessDeviceHealth({ ...base, metrics: [{ ...samples[0], value: 98 }] }).state, "critical");
  assert.equal(assessDeviceHealth({ ...base, metrics: [{ ...samples[0], value: 150 }] }).state, "healthy");
  assert.equal(assessDeviceHealth({ ...base, metrics: [samples[1]] }).state, "healthy");
});

test("expired snapshots never keep a device green or red", () => {
  const old = { state: "warning", score: 30, collectedAt: new Date("2026-10-10T09:00:00.000Z") };
  assert.equal(assessDeviceHealth({ ...base, snapshot: old }).state, "unknown");
});
