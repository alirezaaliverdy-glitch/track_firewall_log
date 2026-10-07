import test from "node:test";
import assert from "node:assert/strict";
import { accountNameFromEvent, attributedAccountName, classifyAccountEvent } from "../src/services/vendor-user-activity.service.js";

function event(rawSnippet: string, action = "unknown", username: string | null = null, tags: unknown = {}) {
  return { rawSnippet, rawMessage: null, action, eventType: "vendor_log", username, tags };
}

test("Linux login is attributed to its account but app-owned SSH login is not displayed", () => {
  const login = event("sshd: Accepted publickey for alireza from 198.51.100.10 port 51234", "auth_success");
  assert.equal(accountNameFromEvent(login), "alireza");
  assert.deepEqual(classifyAccountEvent(login), { kind: "login", risk: "normal" });
  assert.equal(classifyAccountEvent({ ...login, tags: { collector: true, collectorOwned: true } }), null);
});

test("MikroTik login and account change are separately classified", () => {
  const login = event("system,info,account user admin logged in from 192.0.2.7 via ssh");
  const change = event("system,info,account user admin changed firewall rule by admin", "configuration_change");
  assert.equal(accountNameFromEvent(login), "admin");
  assert.deepEqual(classifyAccountEvent(login), { kind: "login", risk: "normal" });
  assert.equal(accountNameFromEvent(change), "admin");
  assert.deepEqual(classifyAccountEvent(change), { kind: "change", risk: "review" });
});

test("Cisco and FortiGate successful administrative logins are recognized without treating failures as success", () => {
  const cisco = event("%SEC_LOGIN-5-LOGIN_SUCCESS: Login Success [user: netadmin] [Source: 192.0.2.8]");
  const forti = event('type="event" subtype="system" action="login" status="success" user="fadmin"');
  const failed = event('type="event" subtype="system" action="login" status="fail" user="fadmin"', "admin_auth_failed");
  assert.equal(accountNameFromEvent(cisco), "netadmin");
  assert.equal(classifyAccountEvent(cisco)?.kind, "login");
  assert.equal(accountNameFromEvent(forti), "fadmin");
  assert.equal(classifyAccountEvent(forti)?.kind, "login");
  assert.equal(classifyAccountEvent(failed)?.kind, "failed_login");
});

test("pfSense and imported ESXi account login messages are shown only when a login is explicit", () => {
  const pfsense = event("webConfigurator: Successful login for user operator from 192.0.2.70");
  const esxi = event("User root logged in via Host Client from 192.0.2.80");
  assert.equal(accountNameFromEvent(pfsense), "operator");
  assert.equal(classifyAccountEvent(pfsense)?.kind, "login");
  assert.equal(accountNameFromEvent(esxi), "root");
  assert.equal(classifyAccountEvent(esxi)?.kind, "login");
});

test("Privileged command is flagged for review, not labeled as proven misuse", () => {
  const ordinary = event("sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/id");
  const high = event("sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/systemctl stop sshd");
  assert.equal(accountNameFromEvent(ordinary), "alice");
  assert.deepEqual(classifyAccountEvent(ordinary), { kind: "privileged", risk: "review" });
  assert.deepEqual(classifyAccountEvent(high), { kind: "privileged", risk: "high" });
});

test("a risky change is attributed to its operator, never just the target username", () => {
  assert.equal(attributedAccountName(event("user admin added", "configuration_change", "admin")), null);
  assert.equal(attributedAccountName(event("user admin added by alice", "configuration_change", "admin")), "alice");
  assert.equal(attributedAccountName(event("sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/ufw disable", "unknown", "root")), "alice");
});

test("Traffic event and invalid actor do not create a fabricated successful login", () => {
  const traffic = event("allow src=192.0.2.20 dst=198.51.100.20", "allow", "alice");
  assert.deepEqual(classifyAccountEvent(traffic), { kind: "activity", risk: "normal" });
  assert.equal(accountNameFromEvent(event("Accepted password for bob from 192.0.2.3", "auth_success", "../../bad")), "bob");
  assert.equal(accountNameFromEvent(event("allow src=192.0.2.20", "allow", "invalid")), null);
});
