import assert from "node:assert/strict";
import test from "node:test";
import { buildVendorWorkflowHealth, summarizeWorkflowPlans, workflowBucket } from "../src/services/dashboard-workflow-summary.js";

test("dashboard workflow summary buckets connector integrity failures as failed", () => {
  const summary = summarizeWorkflowPlans([
    { status: "proposed" },
    { status: "validation_failed" },
    { status: "dry_run_ready" },
    { status: "approved" },
    { status: "executing" },
    { status: "succeeded", resultJson: { connectorInvoked: true } },
    { status: "succeeded", resultJson: { connectorInvoked: false } },
    { status: "rejected" },
  ]);

  assert.equal(summary.draft, 1);
  assert.equal(summary.needsInput, 1);
  assert.equal(summary.readyForReview, 1);
  assert.equal(summary.approved, 1);
  assert.equal(summary.running, 1);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(workflowBucket({ status: "succeeded", resultJson: {} }), "failed");
});

test("dashboard vendor workflow health uses device vendor scope and attention score", () => {
  const rows = buildVendorWorkflowHealth({
    devices: [
      { vendor: "Cisco", type: "cisco_switch", capabilities: { verified: true } },
      { vendor: "MikroTik", type: "mikrotik", capabilities: {} },
    ],
    plans: [
      { status: "dry_run_ready", device: { vendor: "Cisco" }, updatedAt: "2026-07-20T08:00:00.000Z" },
      { status: "executing", device: { vendor: "MikroTik" }, updatedAt: "2026-07-20T08:01:00.000Z" },
      { status: "succeeded", resultJson: {}, device: { vendor: "Cisco" }, updatedAt: "2026-07-20T08:02:00.000Z" },
    ],
  });
  const cisco = rows.find((item) => item.vendor === "cisco");
  const mikrotik = rows.find((item) => item.vendor === "mikrotik");

  assert.equal(cisco?.registeredDevices, 1);
  assert.equal(cisco?.pendingApprovals, 1);
  assert.equal(cisco?.failedActions, 1);
  assert.equal(cisco?.path, "/assets/vendors/cisco");
  assert.equal(mikrotik?.unverifiedDevices, 1);
  assert.equal(mikrotik?.runningActions, 1);
});
