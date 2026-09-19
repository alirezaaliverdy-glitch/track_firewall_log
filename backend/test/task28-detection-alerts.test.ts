import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import test from "node:test";
import type { SecurityEvent } from "@prisma/client";
import { PRIORITY_EMAIL_RULE_KEYS, PRIORITY_EMAIL_RULE_LABELS_FA, VENDOR_DETECTION_RULES, deduplicateDetectionEvents, eventMatchesVendorRule } from "../src/security/vendor-detection-rule-library.js";
import { sendSmtpMail, verifySmtpConnection } from "../src/services/smtp-client.js";
import { parseVendorLogTimestamp } from "../src/collectors/vendor-log-parser.js";
import { isCollectorDue } from "../src/services/security-monitor-schedule.js";
import { normalizeGmailAppPassword } from "../src/services/gmail-smtp.js";
import { isRetryableSecurityEmailError, nextSecurityEmailRetryAt, securityEmailRetryDelayMinutes } from "../src/services/security-email-retry.js";
import { findMutationPermission } from "../src/security/authorization.js";
import { loggerConfig } from "../src/lib/logger.js";
import { normalizeSecurityAlertRecipients } from "../src/services/security-email-recipients.js";

function event(vendor: string, rawMessage: string): SecurityEvent {
  return { id: "event-1", deviceId: "device-1", assetId: null, sourceId: null, batchId: null, timestamp: new Date(), receivedAt: new Date(), sourceType: "syslog", vendor, eventType: "vendor_log", action: null, severity: "warning", srcIp: "198.51.100.9", srcPort: null, dstIp: null, dstPort: null, protocol: null, username: null, ruleName: null, interfaceIn: null, interfaceOut: null, rawMessage, rawSnippet: null, normalizedJson: {}, evidenceJson: null, dedupeKey: null, firstSeen: null, lastSeen: null, count: 1, tags: null, createdAt: new Date() };
}

test("vendor detection library provides six executable event-backed rules per primary vendor", () => {
  for (const vendor of ["linux", "mikrotik", "fortigate", "cisco", "pfsense"]) {
    const rules = VENDOR_DETECTION_RULES.filter((item) => item.vendor === vendor);
    assert.equal(rules.length, 6);
    for (const rule of rules) {
      assert.ok(rule.threshold >= 1);
      assert.ok(rule.windowMinutes >= 1);
      assert.ok(rule.standards.some((item) => item.framework === "NIST CSF 2.0"));
      assert.match(rule.sourceUrl, /^https:\/\//);
    }
  }
});

test("all high and critical vendor rules have a Persian email label", () => {
  assert.equal(PRIORITY_EMAIL_RULE_KEYS.size, 15);
  for (const rule of VENDOR_DETECTION_RULES.filter((item) => item.severity === "high" || item.severity === "critical")) {
    assert.ok(PRIORITY_EMAIL_RULE_LABELS_FA[rule.key], `missing Persian label for ${rule.key}`);
  }
});

test("rules match only their own vendor evidence", () => {
  assert.equal(eventMatchesVendorRule("linux.auth-failure-burst", event("Ubuntu Linux", "sshd: Failed password for invalid user root")), true);
  assert.equal(eventMatchesVendorRule("linux.auth-failure-burst", event("Cisco IOS-XE", "sshd: Failed password for invalid user root")), false);
  assert.equal(eventMatchesVendorRule("mikrotik.firewall-change", event("RouterOS", "firewall filter rule changed by admin")), true);
  assert.equal(eventMatchesVendorRule("fortigate.sslvpn-failure", event("Fortinet", "ssl-vpn login authentication failed")), true);
  assert.equal(eventMatchesVendorRule("cisco.configuration-change", event("Cisco IOS-XE", "%SYS-5-CONFIG_I: Configured from console by admin")), true);
  assert.equal(eventMatchesVendorRule("pfsense.vpn-failure", event("Netgate pfSense", "openvpn TLS authentication failed")), true);
  assert.equal(eventMatchesVendorRule("linux.web-probe-burst", event("Linux", "GET /.env HTTP/1.1")), true);
  assert.equal(eventMatchesVendorRule("mikrotik.port-scan", event("RouterOS", "port scan detected from address")), true);
  assert.equal(eventMatchesVendorRule("fortigate.local-in-probe", event("FortiGate", "local-in policy denied management probe")), true);
  assert.equal(eventMatchesVendorRule("cisco.snmp-auth-failure", event("Cisco IOS", "%SNMP-3-AUTHFAIL: Authentication failure")), true);
  assert.equal(eventMatchesVendorRule("pfsense.ids-alert", event("pfSense", "suricata priority: 1 exploit attempt")), true);
});

test("authentication thresholds count logical attempts instead of duplicate SSH/PAM lines", () => {
  const rule = VENDOR_DETECTION_RULES.find((item) => item.key === "linux.auth-failure-burst");
  assert.ok(rule);
  const base = event("Linux", "2026-09-02T08:00:00+00:00 host sshd[2994306]: Failed password for root from 5.115.146.191 port 14831 ssh2");
  base.eventType = "auth_failed";
  base.username = "root";
  base.timestamp = new Date("2026-09-02T08:00:00Z");
  const duplicate = { ...base, id: "event-2", rawMessage: "host sshd[2994306]: Failed password for root from 5.115.146.191 port 14831 ssh2", timestamp: new Date("2026-09-02T08:00:00.2Z") };
  const pamPair = { ...base, id: "event-3", rawMessage: "host pam_unix(sshd:auth)[2994306]: authentication failure; user=root rhost=5.115.146.191", timestamp: new Date("2026-09-02T08:00:02Z") };
  const nextAttempt = { ...base, id: "event-4", rawMessage: "host sshd[2994306]: Failed password for root from 5.115.146.191 port 14832 ssh2", timestamp: new Date("2026-09-02T08:00:12Z") };
  assert.equal(deduplicateDetectionEvents(rule, [base, duplicate, pamPair, nextAttempt]).length, 2);
});

test("SMTP client sends a complete UTF-8 message to a real local SMTP socket", async (t) => {
  let data = "";
  let inData = false;
  const server = net.createServer((socket) => {
    socket.write("220 local test smtp\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (inData) {
        data += text;
        if (text.includes("\r\n.\r\n")) { inData = false; socket.write("250 accepted\r\n"); }
        return;
      }
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 OK\r\n");
        else if (line.startsWith("MAIL FROM")) socket.write("250 sender ok\r\n");
        else if (line.startsWith("RCPT TO")) socket.write("250 recipient ok\r\n");
        else if (line === "DATA") { inData = true; socket.write("354 end data\r\n"); }
        else if (line === "QUIT") socket.write("221 bye\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await sendSmtpMail({ host: "127.0.0.1", port: address.port, secure: false, startTls: false, from: "alerts@example.test" }, { to: "operator@example.test", subject: "هشدار آزمایشی", text: "متن هشدار", html: "<p dir=\"rtl\">متن هشدار</p>" });
  assert.match(data, /operator@example\.test/);
  assert.match(data, /Content-Type: text\/html/);
  assert.match(data, /متن هشدار/);
});

test("Gmail App Password is normalized, authenticated, and covered by mutation policy", async (t) => {
  assert.equal(normalizeGmailAppPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
  assert.throws(() => normalizeGmailAppPassword("normal-account-password"), /INVALID_GMAIL_APP_PASSWORD/);
  assert.equal(findMutationPermission("PUT", "/api/security/alerts/email"), "security.policy.manage");
  assert.equal(findMutationPermission("POST", "/api/security/alerts/email/test"), "security.policy.manage");
  assert.equal(findMutationPermission("PUT", "/api/security/alerts/email/gmail"), "security.policy.manage");
  assert.equal(findMutationPermission("DELETE", "/api/security/alerts/email/gmail"), "security.policy.manage");
  assert.equal(findMutationPermission("POST", "/api/security/alerts/email/test-vendors"), "security.policy.manage");
  const loggerPaths = (loggerConfig as { redact?: { paths?: string[] } }).redact?.paths ?? [];
  assert.ok(loggerPaths.includes("req.body.appPassword"));

  const authenticated: string[] = [];
  let authStep = 0;
  const server = net.createServer((socket) => {
    socket.write("220 local auth fixture\r\n");
    socket.on("data", (chunk) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) {
        if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH LOGIN\r\n");
        else if (line === "AUTH LOGIN") { authStep = 1; socket.write("334 VXNlcm5hbWU6\r\n"); }
        else if (authStep === 1) { authenticated.push(Buffer.from(line, "base64").toString("utf8")); authStep = 2; socket.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (authStep === 2) { authenticated.push(Buffer.from(line, "base64").toString("utf8")); authStep = 0; socket.write("235 authenticated\r\n"); }
        else if (line === "QUIT") socket.write("221 bye\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await verifySmtpConnection({ host: "127.0.0.1", port: address.port, secure: false, startTls: false, username: "sender@example.test", password: "abcdefghijklmnop", from: "sender@example.test" });
  assert.deepEqual(authenticated, ["sender@example.test", "abcdefghijklmnop"]);
});

test("temporary SMTP and internet failures remain retryable without a five-attempt cutoff", () => {
  for (const code of ["SMTP_TIMEOUT", "SMTP_HOST_UNREACHABLE", "SMTP_CONNECTION_FAILED", "SMTP_TEMPORARY_REJECTED", "SMTP_SEND_FAILED"]) {
    assert.equal(isRetryableSecurityEmailError(code), true, code);
  }
  assert.equal(isRetryableSecurityEmailError("SMTP_AUTH_FAILED"), false);
  assert.equal(isRetryableSecurityEmailError("INVALID_GMAIL_APP_PASSWORD"), false);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map(securityEmailRetryDelayMinutes), [1, 2, 4, 8, 16, 30, 30]);
  assert.equal(nextSecurityEmailRetryAt(50, 0).getTime(), 30 * 60_000);
});

test("security alert recipients are normalized, deduplicated, and validated", () => {
  assert.deepEqual(normalizeSecurityAlertRecipients([" First@Example.test ", "second@example.test", "first@example.test"]), ["first@example.test", "second@example.test"]);
  assert.deepEqual(normalizeSecurityAlertRecipients("one@example.test; two@example.test"), ["one@example.test", "two@example.test"]);
  assert.throws(() => normalizeSecurityAlertRecipients(["not-an-email"]), /INVALID_RECIPIENT_EMAIL/);
  assert.throws(() => normalizeSecurityAlertRecipients(Array.from({ length: 11 }, (_, index) => `user${index}@example.test`)), /TOO_MANY_RECIPIENT_EMAILS/);
});

test("continuous monitoring registry covers all five primary SSH vendors", () => {
  const source = fs.readFileSync(new URL("../src/collectors/collector-registry.service.ts", import.meta.url), "utf8");
  for (const collector of ["linuxSshLogCollector", "mikroTikLogCollector", "fortiGateLogCollector", "ciscoLogCollector", "pfSenseLogCollector"]) {
    assert.match(source, new RegExp(`\\b${collector}\\b`));
  }
});

test("vendor log timestamps are stable across collector polls", () => {
  const now = new Date("2026-08-29T15:00:00Z");
  assert.equal(parseVendorLogTimestamp("date=2026-08-29 time=12:34:56 devname=FGT", now)?.getFullYear(), 2026);
  assert.equal(parseVendorLogTimestamp("aug/29/2026 12:34:56 system,error login failure", now)?.getMonth(), 7);
  assert.equal(parseVendorLogTimestamp("Aug 29 12:34:56 router %SEC_LOGIN-4-LOGIN_FAILED", now)?.getDate(), 29);
});

test("collector scheduling runs immediately then respects success and error intervals", () => {
  const now = new Date("2026-08-29T12:00:00Z");
  assert.equal(isCollectorDue({ intervalSeconds: 60, lastCollectedAt: null, lastErrorAt: null }, now), true);
  assert.equal(isCollectorDue({ intervalSeconds: 60, lastCollectedAt: new Date("2026-08-29T11:59:30Z"), lastErrorAt: null }, now), false);
  assert.equal(isCollectorDue({ intervalSeconds: 60, lastCollectedAt: null, lastErrorAt: new Date("2026-08-29T11:57:00Z") }, now), true);
});
