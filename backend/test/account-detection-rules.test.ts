import assert from "node:assert/strict";
import test from "node:test";
import type { SecurityEvent } from "@prisma/client";
import { accountRuleActor, eventMatchesAccountRule } from "../src/security/account-detection-rule-library.js";

function event(rawSnippet: string, username: string | null = null, action = "unknown", tags: unknown = {}): SecurityEvent {
  return { id: "test-event", deviceId: "test-device", vendor: "linux", username, action, eventType: "vendor_log", rawSnippet, rawMessage: null, tags } as SecurityEvent;
}

test("sensitive sudo command is account-attributed but an ordinary sudo command is not an alert", () => {
  const dangerous = event("sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/systemctl stop auditd");
  assert.equal(accountRuleActor(dangerous), "alice");
  assert.equal(eventMatchesAccountRule("account.risky-privileged-command", dangerous), true);
  assert.equal(eventMatchesAccountRule("account.risky-privileged-command", event("sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/id")), false);
});

test("identity and configuration rules require an attributable actor, not merely a target account or source IP", () => {
  const identity = event("user admin added by alice", null, "configuration_change");
  assert.equal(accountRuleActor(identity), "alice");
  assert.equal(eventMatchesAccountRule("account.identity-change", identity), true);
  assert.equal(eventMatchesAccountRule("account.configuration-change", identity), false);
  assert.equal(eventMatchesAccountRule("account.identity-change", event("user admin added", null, "configuration_change")), false);
  assert.equal(eventMatchesAccountRule("account.identity-change", event("user admin added", "admin", "configuration_change")), false,
    "a structured username may name the changed account rather than the operator");
  const configuration = event("%SYS-5-CONFIG_I: Configured from console by alice", null, "configuration_change");
  assert.equal(accountRuleActor(configuration), "alice");
  assert.equal(eventMatchesAccountRule("account.configuration-change", configuration), true);
});

test("collector-owned events and ordinary traffic never trigger account rules", () => {
  const owned = event("sudo: collector : COMMAND=/usr/bin/systemctl stop auditd", "collector", "unknown", { collectorOwned: true });
  assert.equal(eventMatchesAccountRule("account.risky-privileged-command", owned), false);
  const applicationOwned = event("sudo: collector : COMMAND=/usr/bin/systemctl stop auditd", "collector", "unknown", { applicationOwned: true });
  assert.equal(eventMatchesAccountRule("account.risky-privileged-command", applicationOwned), false);
  assert.equal(eventMatchesAccountRule("account.configuration-change", event("allow src=192.0.2.1", "alice", "allow")), false);
});
