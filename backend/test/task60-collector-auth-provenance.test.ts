import test from "node:test";
import assert from "node:assert/strict";
import { isCollectorOwnedAuthSuccess, matchesCollectorSession } from "../src/security/collector-auth-provenance.js";

test("only the exact collector SSH session is marked as self-login for any device", () => {
  const session = { collectorSourceIp: "198.51.100.8", collectorSourcePort: 22001 };
  assert.equal(matchesCollectorSession({ action: "auth_success", srcIp: "198.51.100.8", srcPort: 22001 }, session), true);
  assert.equal(matchesCollectorSession({ action: "auth_success", srcIp: "198.51.100.8", srcPort: 22002 }, session), false);
  assert.equal(matchesCollectorSession({ action: "auth_success", srcIp: "203.0.113.9", srcPort: 22001 }, session), false);
  assert.equal(matchesCollectorSession({ action: "auth_failed", srcIp: "198.51.100.8", srcPort: 22001 }, session), false);
  assert.equal(isCollectorOwnedAuthSuccess({ action: "auth_success", tags: { collector: true, collectorOwned: true } }), true);
  assert.equal(isCollectorOwnedAuthSuccess({ action: "auth_success", tags: { collector: true } }), false);
  assert.equal(isCollectorOwnedAuthSuccess({ action: "auth_failed", tags: { collector: true, collectorOwned: true } }), false);
});

test("provenance is evaluated from each asset's own session, never as a global IP allowlist", () => {
  const assetA = { applicationSshSessions: [{ ip: "198.51.100.8", port: 22001 }] };
  const assetB = { applicationSshSessions: [{ ip: "198.51.100.8", port: 22002 }] };
  const login = { action: "auth_success", srcIp: "198.51.100.8", srcPort: 22001 };
  assert.equal(matchesCollectorSession(login, assetA), true);
  assert.equal(matchesCollectorSession(login, assetB), false);
  assert.equal(matchesCollectorSession({ ...login, srcPort: 22003 }, assetA), false);
  assert.equal(matchesCollectorSession({ ...login, srcPort: 22003 }, assetB), false);
});
