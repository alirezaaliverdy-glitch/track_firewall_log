import assert from "node:assert/strict";
import test from "node:test";
import { eventMatchesVendorRule } from "../src/security/vendor-detection-rule-library.js";

process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/firewall_log_analyzer_test";
const { normalizeCollectedLine } = await import("../src/services/event-ingestion.service.js");

test("FortiOS IPS key/value logs preserve the real source, target, interfaces and vendor action", () => {
  const event = normalizeCollectedLine("forti-1", {
    sourceType: "fortigate_log",
    timestamp: new Date("2026-09-11T10:00:00Z"),
    command: "execute log display",
    raw: 'date=2026-09-11 time=13:30:00 type="utm" subtype="ips" eventtype="signature" level="alert" srcip=198.51.100.44 srcport=49152 srcintf="wan1" dstip=10.10.1.20 dstport=443 dstintf="lan" proto=6 action="dropped" attack="Apache.Log4j.RCE" attackid=51006 msg="intrusion detected"'
  }, "fortigate");

  assert.equal(event.eventType, "fortigate_ips_attack");
  assert.equal(event.action, "blocked");
  assert.equal(event.severity, "critical");
  assert.equal(event.srcIp, "198.51.100.44");
  assert.equal(event.dstIp, "10.10.1.20");
  assert.equal(event.srcPort, 49152);
  assert.equal(event.dstPort, 443);
  assert.equal(event.protocol, "tcp");
  assert.equal(event.interfaceIn, "wan1");
  assert.equal(event.interfaceOut, "lan");
  assert.equal(event.ruleName, "Apache.Log4j.RCE");
  assert.equal(event.evidenceJson.parser, "fortios-kv-v1");
  assert.equal(eventMatchesVendorRule("fortigate.security-threat", event as never), true);
});

test("FortiOS SSL-VPN failures use remip as the attacker and do not mistake another IP for the source", () => {
  const event = normalizeCollectedLine("forti-2", {
    sourceType: "fortigate_log",
    command: "execute log display",
    raw: 'date=2026-09-11 time=13:31:00 type="event" subtype="vpn" level="alert" action="ssl-login-fail" remip=203.0.113.9 user="operator" dst_host="10.0.0.1" logdesc="SSL VPN login fail" reason="sslvpn_login_permission_denied"'
  }, "Fortinet");

  assert.equal(event.eventType, "fortigate_vpn_auth_failure");
  assert.equal(event.action, "vpn_auth_failed");
  assert.equal(event.srcIp, "203.0.113.9");
  assert.equal(event.username, "operator");
  assert.equal(eventMatchesVendorRule("fortigate.sslvpn-failure", event as never), true);
});

test("FortiOS plain denies remain medium telemetry until the burst threshold is reached", () => {
  const event = normalizeCollectedLine("forti-3", {
    sourceType: "fortigate_log",
    command: "execute log display",
    raw: 'type="traffic" subtype="forward" level="notice" srcip=192.0.2.10 dstip=10.0.0.8 dstport=22 proto=6 action="deny"'
  }, "fortigate");

  assert.equal(event.eventType, "fortigate_traffic_denied");
  assert.equal(event.action, "denied");
  assert.equal(event.severity, "medium");
  assert.equal(eventMatchesVendorRule("fortigate.denied-source-burst", event as never), true);
});

test("FortiOS threat families are normalized without losing the firewall outcome", () => {
  const samples = [
    {
      raw: 'type="utm" subtype="anomaly" eventtype="anomaly" level="alert" srcip=198.51.100.10 dstip=10.0.0.8 action="clear_session" msg="tcp_syn_flood detected"',
      eventType: "fortigate_dos_attack",
      action: "threat_detected"
    },
    {
      raw: 'type="utm" subtype="virus" level="critical" srcip=198.51.100.11 dstip=10.0.0.9 action="quarantine" virus="EICAR_TEST_FILE" msg="File is infected"',
      eventType: "fortigate_malware_detected",
      action: "blocked"
    },
    {
      raw: 'type="utm" subtype="webfilter" level="alert" srcip=198.51.100.12 dstip=10.0.0.10 action="blocked" botnetdomain="c2.example" msg="Botnet domain blocked"',
      eventType: "fortigate_botnet_detected",
      action: "blocked"
    },
    {
      raw: 'type="utm" subtype="waf" level="alert" srcip=198.51.100.13 dstip=10.0.0.11 action="blocked" attack="SQL Injection" msg="Web application attack detected"',
      eventType: "fortigate_web_attack",
      action: "blocked"
    }
  ];

  for (const sample of samples) {
    const event = normalizeCollectedLine("forti-family", {
      sourceType: "fortigate_log",
      command: "execute log display",
      raw: sample.raw
    }, "fortigate");
    assert.equal(event.eventType, sample.eventType);
    assert.equal(event.action, sample.action);
    assert.equal(eventMatchesVendorRule("fortigate.security-threat", event as never), true);
  }
});

test("Linux session noise is not an authentication attack and UFW ports keep their direction", () => {
  const timeout = normalizeCollectedLine("linux-1", {
    sourceType: "linux_ssh",
    command: "journalctl",
    raw: "sshd[1234]: Timeout, client not responding from user alireza 203.0.113.7 port 54321"
  }, "linux");
  assert.equal(timeout.action, "session_lifecycle");
  assert.equal(timeout.severity, "low");
  assert.equal(eventMatchesVendorRule("linux.auth-failure-burst", timeout as never), false);

  const denied = normalizeCollectedLine("linux-1", {
    sourceType: "linux_ufw",
    command: "journalctl",
    raw: "[UFW BLOCK] SRC=198.51.100.20 DST=10.0.0.5 PROTO=TCP SPT=51000 DPT=8080"
  }, "linux");
  assert.equal(denied.srcPort, 51000);
  assert.equal(denied.dstPort, 8080);
  assert.equal(denied.dstIp, "10.0.0.5");
  assert.equal(denied.eventType, "linux_firewall_denied");
});
