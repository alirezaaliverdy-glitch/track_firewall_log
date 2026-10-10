import test from "node:test";
import assert from "node:assert/strict";
import { isCollectorOwnedAuthSuccess, matchesCollectorSession } from "../src/security/collector-auth-provenance.js";
import { clearApplicationCommandProvenance, matchesApplicationCommand, matchesFixedCollectorRead, trackApplicationSshCommand } from "../src/security/application-command-provenance.js";

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

test("historical backfill accepts only fixed collector reads by the integration account", () => {
  assert.equal(matchesFixedCollectorRead({ rawSnippet: "sudo: alireza : USER=root ; COMMAND=/usr/sbin/ufw status verbose" }, "alireza"), true);
  assert.equal(matchesFixedCollectorRead({ rawSnippet: "sudo: alireza : USER=root ; COMMAND=/usr/bin/journalctl -u ufw --since 2026-10-10T08:00:00Z --no-pager -o short-iso" }, "alireza"), true);
  assert.equal(matchesFixedCollectorRead({ rawSnippet: "sudo: alireza : USER=root ; COMMAND=/usr/bin/systemctl stop auditd" }, "alireza"), false);
  assert.equal(matchesFixedCollectorRead({ rawSnippet: "sudo: operator : USER=root ; COMMAND=/usr/sbin/ufw status verbose" }, "alireza"), false);
});

test("only the application's exact sudo command, account and execution window are marked as owned", async () => {
  clearApplicationCommandProvenance();
  const observedAt = new Date();
  await trackApplicationSshCommand(
    { deviceId: "linux-a", username: "alireza", command: "sudo -n /usr/sbin/ufw status verbose" },
    async () => undefined
  );
  assert.equal(matchesApplicationCommand({
    deviceId: "linux-a", timestamp: observedAt,
    rawSnippet: "sudo: alireza : PWD=/home/alireza ; USER=root ; COMMAND=/usr/sbin/ufw status verbose"
  }), true);
  assert.equal(matchesApplicationCommand({
    deviceId: "linux-a", timestamp: observedAt,
    rawSnippet: "sudo: alireza : PWD=/home/alireza ; USER=root ; COMMAND=/usr/bin/systemctl stop auditd"
  }), false, "another command by the same account must remain security evidence");
  assert.equal(matchesApplicationCommand({
    deviceId: "linux-a", timestamp: observedAt,
    rawSnippet: "sudo: another-user : PWD=/home/another-user ; USER=root ; COMMAND=/usr/sbin/ufw status verbose"
  }), false);
  assert.equal(matchesApplicationCommand({
    deviceId: "linux-b", timestamp: observedAt,
    rawSnippet: "sudo: alireza : PWD=/home/alireza ; USER=root ; COMMAND=/usr/sbin/ufw status verbose"
  }), false);
  clearApplicationCommandProvenance();
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
