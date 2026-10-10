import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseDeviceIssues } from "../src/services/device-issue-guide.js";

const now = new Date("2026-10-04T10:00:00.000Z");

test("diagnoses a recent connection failure without inventing a root cause", () => {
  const issues = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    status: { status: "offline", checkedAt: new Date("2026-10-04T09:59:30.000Z") },
    findings: [],
    sensors: []
  });
  assert.equal(issues[0]?.id, "connection");
  assert.match(issues[0]?.causeFa ?? "", /علت دقیق/);
  assert.equal(issues[0]?.action.kind, "connection_test");
});

test("maps authentication collection errors to setup guidance", () => {
  const issues = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    collection: { status: "failed", startedAt: new Date("2026-10-04T09:55:00.000Z"), completedAt: new Date("2026-10-04T09:55:02.000Z"), errorCode: "SSH_AUTH_FAILED" },
    findings: [],
    sensors: []
  });
  assert.equal(issues[0]?.action.kind, "setup");
  assert.match(issues[0]?.titleFa ?? "", /ورود/);
});

test("turns high findings into reviewed remediation plans, not direct execution", () => {
  const issues = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    findings: [{ id: "finding-1", title: "Repeated authentication failures", severity: "high", status: "active", lastSeen: new Date("2026-10-04T09:59:00.000Z") }],
    sensors: []
  });
  assert.equal(issues[0]?.action.kind, "finding_plan");
  assert.match(issues[0]?.nextStepFa ?? "", /پیش‌نمایش/);
});

test("uses the same five-minute freshness window as the health assessment", () => {
  const recent = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    status: { status: "offline", checkedAt: new Date("2026-10-04T09:56:00.000Z") },
    findings: [],
    sensors: []
  });
  const stale = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    status: { status: "offline", checkedAt: new Date("2026-10-04T09:54:00.000Z") },
    findings: [],
    sensors: []
  });
  assert.equal(recent[0]?.id, "connection");
  assert.equal(stale.some((item) => item.id === "connection"), false);
});

test("surfaces fresh datastore pressure and a snapshot-only warning without inventing detail", () => {
  const pressure = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    findings: [],
    sensors: [{ key: "datastore.usage_percent", value: 96, measuredAt: new Date("2026-10-04T09:59:00.000Z") }]
  });
  assert.equal(pressure[0]?.id, "resource:datastore.usage_percent");
  assert.equal(pressure[0]?.severity, "critical");

  const snapshot = diagnoseDeviceIssues({
    now,
    credentialConfigured: true,
    snapshot: { state: "warning", collectedAt: new Date("2026-10-04T09:59:00.000Z") },
    findings: [{ id: "accepted", title: "Reviewed risk", severity: "high", status: "accepted_risk", lastSeen: now }],
    sensors: []
  });
  assert.deepEqual(snapshot.map((item) => item.id), ["health-snapshot"]);
  assert.equal(snapshot[0]?.action.kind, "monitoring");
});
