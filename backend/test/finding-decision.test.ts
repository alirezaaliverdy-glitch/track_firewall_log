import assert from "node:assert/strict";
import test from "node:test";
import { correlateFindingEvidence, type DecisionEvidence } from "../src/services/finding-decision.service.js";

const now = new Date("2026-10-12T10:00:00.000Z");
const credible: DecisionEvidence = {
  category: "authentication",
  status: "active",
  srcIp: "203.0.113.20",
  vendor: "linux",
  confidence: 0.9,
  count: 9,
  lastSeen: new Date("2026-10-12T09:58:00.000Z"),
  referenceCount: 9,
  resolvedReferenceCount: 9,
  supportingReferenceCount: 9,
  applicationOwnedReferenceCount: 0,
  independentDeviceCount: 2,
  authSuccessCount: 0,
  trustedSource: false,
};

test("correlated recent attack evidence yields a reviewable action, never execution", () => {
  const decision = correlateFindingEvidence(credible, now);
  assert.equal(decision.mode, "review_action");
  assert.equal(decision.deviceCount, 2);
  assert.ok(decision.signals.some((signal) => signal.key === "devices"));
  assert.ok(decision.evidenceScore >= 75);
});

test("missing, stale, trusted and unrelated evidence remain investigation-only", () => {
  assert.equal(correlateFindingEvidence({ ...credible, referenceCount: 0, resolvedReferenceCount: 0 }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, lastSeen: new Date("2026-10-12T08:00:00.000Z") }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, trustedSource: true }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, supportingReferenceCount: 1 }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, authSuccessCount: 1 }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, category: "account-management" }, now).mode, "investigate");
  assert.equal(correlateFindingEvidence({ ...credible, status: "resolved" }, now).mode, "closed");
});
