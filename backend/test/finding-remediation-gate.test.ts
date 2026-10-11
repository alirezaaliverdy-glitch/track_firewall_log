import assert from "node:assert/strict";
import test from "node:test";
import { findingSupportsIpResponse } from "../src/assets/finding-remediation-policy.js";

const base = { category: "authentication", srcIp: "203.0.113.10", confidence: 0.9, status: "active" };

test("IP response is proposed only for open, credible attack categories", () => {
  assert.equal(findingSupportsIpResponse(base), true);
  assert.equal(findingSupportsIpResponse({ ...base, category: "threat-prevention" }), true);
  assert.equal(findingSupportsIpResponse({ ...base, category: "account-management" }), false);
  assert.equal(findingSupportsIpResponse({ ...base, category: "privileged-access" }), false);
  assert.equal(findingSupportsIpResponse({ ...base, category: "configuration-change" }), false);
  assert.equal(findingSupportsIpResponse({ ...base, category: "network-defense" }), false);
  assert.equal(findingSupportsIpResponse({ ...base, confidence: 0.69 }), false);
  assert.equal(findingSupportsIpResponse({ ...base, srcIp: null }), false);
  assert.equal(findingSupportsIpResponse({ ...base, status: "resolved" }), false);
});
