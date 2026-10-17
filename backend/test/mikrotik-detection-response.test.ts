import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionType, AiRiskLevel, type SecurityEvent } from "@prisma/client";
import { parseMikroTikSecurityLog } from "../src/security/mikrotik-log-semantics.js";
import { deduplicateDetectionEvents, eventMatchesVendorRule, VENDOR_DETECTION_RULES } from "../src/security/vendor-detection-rule-library.js";
import { validateMikroTikAction } from "../src/actions/mikrotik-action-catalog.js";

test("RouterOS account logs identify remote sources and users, not syslog relay addresses", () => {
  for (const service of ["ssh", "winbox", "api", "web"]) {
    const event = parseMikroTikSecurityLog(`Oct 17 12:00:00 192.0.2.1 system,error,critical login failure for user admin from 203.0.113.8 via ${service}`);
    assert.equal(event.srcIp, "203.0.113.8"); assert.equal(event.username, "admin"); assert.equal(event.action, "auth_failed"); assert.equal(event.protocol, service);
  }
  const cef = parseMikroTikSecurityLog('CEF:0|MikroTik|RouterOS|7|10|system,error|High|dvc=192.0.2.1 msg=login failure for user guest from 203.0.113.9 via ssh src=203.0.113.9');
  assert.equal(cef.srcIp, "203.0.113.9"); assert.equal(cef.username, "guest");
  assert.equal(parseMikroTikSecurityLog("192.0.2.1 login failure for user admin from 999.1.1.1 via ssh").srcIp, undefined);
  assert.equal(parseMikroTikSecurityLog("192.0.2.1 system,warning device restarted").srcIp, undefined);
  const success = parseMikroTikSecurityLog("system,info,account user alireza logged in from 2001:db8::9 via winbox");
  assert.equal(success.action, "auth_success"); assert.equal(success.username, "alireza"); assert.equal(success.srcIp, "2001:db8::9");
  const flow = parseMikroTikSecurityLog("192.0.2.1 firewall: in:ether1 out:(unknown 0), proto TCP (SYN), 203.0.113.9:4567->192.0.2.1:22, len 60");
  assert.equal(flow.srcIp, "203.0.113.9"); assert.equal(flow.dstIp, "192.0.2.1");
});

test("six independent fast RouterOS failures remain six attempts while transport duplicates collapse", () => {
  const definition = VENDOR_DETECTION_RULES.find(rule => rule.key === "mikrotik.login-failure-burst")!;
  const rows = Array.from({ length: 6 }, (_, index) => ({ id: `fixture-${index}`, deviceId: "router", vendor: "mikrotik", username: "admin", srcIp: "203.0.113.8",
    action: "auth_failed", eventType: "mikrotik_log", severity: "high", timestamp: new Date(1700000000000 + index * 1000), rawMessage: "login failure for user admin from 203.0.113.8 via ssh" }) as unknown as SecurityEvent);
  assert.equal(deduplicateDetectionEvents(definition, [...rows, { ...rows[0], id: "transport-copy" }]).length, 6);
  assert.ok(rows.every(row => eventMatchesVendorRule(definition.key, row)));
  assert.equal(eventMatchesVendorRule(definition.key, { ...rows[0], action: "auth_success", rawMessage: "user admin logged in from 203.0.113.8 via ssh" }), false);
});

test("registered MikroTik containment checks existing firewall rules read-only and verifies source state", () => {
  const preview = validateMikroTikAction({ actionType: ActionType.mikrotik_block_ip, riskLevel: AiRiskLevel.high,
    parametersJson: { address: "203.0.113.8", listName: "firewall-log-analyzer-blocked", timeout: "1h", requireDropRule: true } });
  assert.equal(preview.valid, true); assert.equal(preview.commandSpecs.length, 5); assert.equal(preview.normalizedParameters.requireDropRule, true);
  assert.ok(preview.commandSpecs.slice(3).every(spec => spec.write === false));
  assert.match(preview.commandSpecs[3].command, /EOSNET_DROP_RULE_VERIFIED/); assert.match(preview.commandSpecs[4].command, /EOSNET_SOURCE_ENTRY_VERIFIED/);
  assert.ok(preview.commandSpecs.every(spec => !/\/ip firewall filter (?:add|set|enable|move|remove)/.test(spec.command)), "firewall rules must not be changed automatically");
  const injection = validateMikroTikAction({ actionType: ActionType.mikrotik_block_ip, riskLevel: AiRiskLevel.high,
    parametersJson: { address: "203.0.113.8", listName: 'list\"; /system reboot', requireDropRule: true } });
  assert.equal(injection.valid, false);
});
