import assert from "node:assert/strict";
import test from "node:test";
import { parseLinuxSecurityLog, isLinuxRemoteRootLogin } from "../src/security/linux-log-semantics.js";
import { normalizeCollectedLine } from "../src/services/event-ingestion.service.js";
import { eventMatchesVendorRule } from "../src/security/vendor-detection-rule-library.js";
import { classifyAccountEvent, attributedAccountName } from "../src/services/vendor-user-activity.service.js";
import { parseLinuxLiveLogLine } from "../src/telemetry/linux/linux-log-stream.service.js";
import { evaluateVendorTelemetry, resetFindingEngineWindows } from "../src/telemetry/vendor-finding-engine.js";
import { analyzeFindingEvidence } from "../src/services/finding-analysis.service.js";
import type { SecurityEvent } from "@prisma/client";

const sudo = "2026-10-13T12:18:32.803895+00:00 lab-host sudo:   operator1 : TTY=pts/1 ; PWD=/home/operator1 ; USER=root ; COMMAND=/usr/bin/grep -E '(Accepted password.*root|Failed password for root|ufw disabled)' /var/log/auth.log";
const login = "2026-10-13T12:18:33+00:00 lab-host sshd[1812]: Accepted publickey for operator1 from 192.0.2.40 port 48123 ssh2";
const rootLogin = login.replace("for operator1", "for root");
const event = (raw: string) => ({ id: "one", rawMessage: raw, rawSnippet: raw, vendor: "linux", eventType: "linux_log", action: "auth_success", severity: "low", username: "root", tags: {}, timestamp: new Date(), receivedAt: new Date() }) as SecurityEvent;

test("sudo command data cannot become a root login or an attack rule", () => {
  const meaning = parseLinuxSecurityLog(sudo);
  assert.equal(meaning.kind, "sudo_command"); assert.equal(meaning.actor, "operator1");
  assert.equal(meaning.hostname, "lab-host"); assert.equal(meaning.effectiveUser, "root");
  assert.equal(meaning.sourceIp, undefined); assert.equal(isLinuxRemoteRootLogin(sudo), false);
  assert.equal(eventMatchesVendorRule("linux.root-remote-login", event(sudo)), false);
  assert.equal(eventMatchesVendorRule("linux.auth-failure-burst", event(sudo)), false);
  assert.equal(classifyAccountEvent(event(sudo))?.kind, "privileged");
  assert.equal(classifyAccountEvent(event(sudo))?.risk, "review");
  assert.equal(attributedAccountName(event(sudo)), "operator1");
});
test("actual root and normal SSH logins retain exact actors and sources", () => {
  assert.equal(parseLinuxSecurityLog(login).actor, "operator1");
  assert.equal(isLinuxRemoteRootLogin(login), false); assert.equal(isLinuxRemoteRootLogin(rootLogin), true);
  assert.equal(eventMatchesVendorRule("linux.root-remote-login", event(rootLogin)), true);
  const ipv6 = rootLogin.replace("192.0.2.40", "2001:db8::4");
  assert.equal(parseLinuxSecurityLog(ipv6).sourceIp, "2001:db8::4");
  assert.equal(isLinuxRemoteRootLogin(rootLogin.replace("publickey for", "password [REDACTED]")), true);
});
test("non-sshd producer cannot spoof an SSH login through its payload", () => {
  assert.equal(isLinuxRemoteRootLogin(rootLogin.replace("sshd[1812]", "app[1812]")), false);
  assert.equal(isLinuxRemoteRootLogin(sudo.replace("operator1 :", "root :")), false);
});
test("collector normalization separates invocation privileges from authentication", () => {
  const normalized = normalizeCollectedLine("fixture-device", { raw: sudo, sourceType: "linux_auth", timestamp: new Date() }, "linux");
  assert.equal(normalized.action, "sudo_command"); assert.equal(normalized.username, "operator1");
  assert.equal(normalized.srcIp, undefined); assert.equal(normalized.srcPort, undefined);
  assert.equal(normalizeCollectedLine("fixture-device", { raw: login, sourceType: "linux_auth" }, "linux").action, "auth_success");
});
test("live telemetry and secondary detector ignore attack phrases in sudo arguments", () => {
  const live = parseLinuxLiveLogLine("auth", sudo);
  assert.equal(live.suspicious, false); assert.ok(!live.tags.includes("root_login"));
  assert.equal(live.parsed.username, "operator1");
  resetFindingEngineWindows();
  const result = evaluateVendorTelemetry({ device: { id: "fixture-device", vendor: "linux" }, events: Array.from({ length: 8 }, () => ({ raw: sudo, source: "auth" })) });
  assert.equal(result.findings.length, 0);
});
test("root claim is contradicted only with complete interpretable references", () => {
  const finding = { title: "Linux: remote root login", fingerprint: "detection:linux.root-remote-login", vendor: "linux", category: "privileged-access", srcIp: null };
  const rows = [{ id: "one", rawMessage: sudo, timestamp: new Date() }];
  const analysis = analyzeFindingEvidence(finding, rows, { referenceCount: 1, resolvedReferenceCount: 1 });
  assert.equal(analysis.verdict, "contradicted"); assert.deepEqual(analysis.actors, ["operator1"]);
  assert.equal(analysis.events[0].effectiveUser, "root");
  assert.equal(analyzeFindingEvidence(finding, rows, { referenceCount: 2, resolvedReferenceCount: 1 }).verdict, "inconclusive");
  assert.equal(analyzeFindingEvidence(finding, [{ ...rows[0], rawMessage: rootLogin }], { referenceCount: 1, resolvedReferenceCount: 1 }).verdict, "supported");
});
test("genuine sudo failures and sensitive privileged commands remain visible", () => {
  const failure = "Oct 13 12:15:00 lab-host sudo[44]: operator1 : 3 incorrect password attempts";
  assert.equal(parseLinuxSecurityLog(failure).kind, "sudo_failure");
  assert.equal(classifyAccountEvent(event(failure))?.kind, "failed_login");
  assert.equal(classifyAccountEvent(event(sudo.replace(/COMMAND=.*/, "COMMAND=/usr/sbin/ufw disable")))?.risk, "high");
});
