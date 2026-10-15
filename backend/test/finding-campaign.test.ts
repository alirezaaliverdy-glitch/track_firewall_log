import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCampaignSources, campaignWindow } from "../src/services/finding-campaign.service.js";
import { groupFindings } from "../../src/features/security/findingGroups.js";
import type { SecurityFinding } from "../../src/lib/platform.js";

test("campaign windows are deterministic UTC half-open 15-minute intervals", () => {
  const first = campaignWindow(new Date("2026-10-15T11:29:59Z"));
  assert.equal(first.start.toISOString(), "2026-10-15T11:15:00.000Z");
  assert.equal(first.end.toISOString(), "2026-10-15T11:30:00.000Z");
  assert.equal(campaignWindow(first.end).start.toISOString(), first.end.toISOString());
});
test("multiple evidence IPs aggregate without duplicated events, sudo or application-owned sessions", () => {
  const row = { timestamp: "2026-10-15T11:20:00Z", findingId: "f1", action: "auth_failed", username: "root" };
  const sources = aggregateCampaignSources([
    { ...row, id: "1", srcIp: "203.0.113.1" }, { ...row, id: "1", srcIp: "203.0.113.1" },
    { ...row, id: "2", srcIp: "203.0.113.1" }, { ...row, id: "3", srcIp: "2001:db8::1" },
    { ...row, id: "4", srcIp: "203.0.113.2", tags: { applicationOwned: true } },
    { ...row, id: "5", srcIp: "203.0.113.3", action: "auth_success" },
    { ...row, id: "6", srcIp: "invalid" },
    { ...row, id: "7", srcIp: "203.0.113.4", rawMessage: "lab-host sudo: operator1 : USER=root ; COMMAND=/bin/grep 'Failed password' /var/log/auth.log" },
  ]);
  assert.deepEqual(sources.map(source => [source.ip, source.events]), [["203.0.113.1", 2], ["2001:db8::1", 1]]);
});
test("list grouping preserves original findings and separates target, status and windows", () => {
  const seed = { id: "f1", deviceId: "d1", vendor: "linux", source: "rule", title: "Failed logins", category: "authentication", status: "active", lastSeen: "2026-10-15T11:20:00Z", srcIp: "203.0.113.1" } as SecurityFinding;
  const groups = groupFindings([seed, { ...seed, id: "f2", srcIp: "203.0.113.2" }, { ...seed, id: "f3", deviceId: "d2" }, { ...seed, id: "f4", status: "resolved" }, { ...seed, id: "f5", lastSeen: "2026-10-15T11:30:00Z" }]);
  assert.equal(groups.length, 4); assert.equal(groups[0].members.length, 2);
  assert.deepEqual(groups[0].ips, ["203.0.113.1", "203.0.113.2"]);
  assert.equal(seed.id, "f1");
});
