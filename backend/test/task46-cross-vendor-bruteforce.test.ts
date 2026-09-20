import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticationAttemptCount,
  authenticationFailureService,
  isAuthenticationFailureEvent,
} from "../src/security/brute-force-detection.js";

test("cross-vendor authentication failures identify the real attacker IP without relying on port 22", () => {
  const samples = [
    { vendor: "linux", srcIp: "198.51.100.10", action: "auth_failed", rawMessage: "sshd[10]: Failed password for root from 198.51.100.10 port 50100", dstPort: 2222, expected: "ssh" },
    { vendor: "fortigate", srcIp: "198.51.100.11", eventType: "fortigate_admin_auth_failure", action: "admin_auth_failed", rawMessage: "Admin login failed", expected: "management" },
    { vendor: "fortigate", srcIp: "198.51.100.12", eventType: "fortigate_vpn_auth_failure", action: "vpn_auth_failed", rawMessage: "SSL VPN login fail", expected: "vpn" },
    { vendor: "mikrotik", srcIp: "198.51.100.13", action: "auth_failed", rawMessage: "login failure for user admin from 198.51.100.13 via winbox", expected: "winbox" },
    { vendor: "cisco", srcIp: "198.51.100.14", action: "auth_failed", rawMessage: "%SEC_LOGIN-4-LOGIN_FAILED: Login failed [Source: 198.51.100.14]", expected: "authentication" },
  ];
  for (const sample of samples) {
    assert.equal(isAuthenticationFailureEvent(sample), true, sample.vendor);
    assert.equal(authenticationFailureService(sample), sample.expected, sample.vendor);
  }
});

test("deduplicated database rows still honor their aggregate attempt count", () => {
  const events = [{ srcIp: "203.0.113.40", action: "auth_failed", count: 5 }];
  assert.equal(authenticationAttemptCount(events), 5);
  assert.equal(isAuthenticationFailureEvent(events[0]), true);
});

test("ordinary sessions and unrelated firewall denies are not brute force", () => {
  assert.equal(isAuthenticationFailureEvent({ srcIp: "203.0.113.9", action: "session_lifecycle", rawMessage: "session closed" }), false);
  assert.equal(isAuthenticationFailureEvent({ srcIp: "203.0.113.9", action: "denied", dstPort: 443, rawMessage: "policy deny" }), false);
});
