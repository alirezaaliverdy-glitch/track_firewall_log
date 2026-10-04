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
