import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { listVendorUserActivity } from "../src/services/vendor-user-activity.service.js";
import { runSecurityDetection } from "../src/assets/asset-intelligence.service.js";

const runId = `vendor-user-api-${Date.now()}`;

test("vendor account API shows only observed human logins, scoped activity, and linked findings", async () => {
  const app = await buildApp({ authRequired: false });
  const device = await prisma.device.create({ data: {
    name: runId, vendor: "Linux", type: "linux_edge", host: "192.0.2.210", managementPort: 22,
    protocol: "ssh", environment: "lab", status: "online"
  } });
  const unrelatedDevice = await prisma.device.create({ data: {
    name: `${runId}-unrelated`, vendor: "Linux", type: "linux_edge", host: "192.0.2.211", managementPort: 22,
    protocol: "ssh", environment: "lab", status: "online"
  } });
  try {
    const now = new Date();
    await prisma.securityEvent.createMany({ data: [
      { deviceId: device.id, vendor: "linux", eventType: "linux_log", action: "auth_success", username: "alice", rawSnippet: "Accepted publickey for alice from 198.51.100.20 port 55001", srcIp: "198.51.100.20", timestamp: now, normalizedJson: {}, tags: { collector: true } },
      { deviceId: device.id, vendor: "linux", eventType: "linux_log", action: "auth_success", username: "collector", rawSnippet: "Accepted publickey for collector from 198.51.100.30 port 55002", srcIp: "198.51.100.30", timestamp: now, normalizedJson: {}, tags: { collector: true, collectorOwned: true } },
      { deviceId: device.id, vendor: "linux", eventType: "linux_log", action: "unknown", rawSnippet: "sudo: alice : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/systemctl stop sshd", timestamp: now, normalizedJson: {} },
      { deviceId: device.id, vendor: "linux", eventType: "linux_log", action: "unknown", rawSnippet: "sudo: bob : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/systemctl stop auditd", timestamp: now, normalizedJson: {} },
      { deviceId: device.id, vendor: "mikrotik", eventType: "mikrotik_log", action: "unknown", rawSnippet: "user routeradmin logged in from 203.0.113.10 via ssh", timestamp: now, normalizedJson: {} }
    ] });
    await prisma.finding.create({ data: {
      deviceId: device.id, vendor: "linux", title: "Privileged change needs review", severity: "high", category: "privileged-access",
      status: "active", confidence: 0.9, summary: "Account activity", evidenceJson: {}, source: "test",
      rawRefsJson: [], firstSeen: now, lastSeen: now, actor: "alice", recommendedActions: [], fingerprint: runId
    } });
    await prisma.finding.create({ data: {
      deviceId: unrelatedDevice.id, vendor: "linux", title: "Unrelated device", severity: "high", category: "account-privileged-activity",
      status: "active", confidence: 0.9, summary: "Other device", evidenceJson: {}, source: "test",
      rawRefsJson: [], firstSeen: now, lastSeen: now, actor: "alice", recommendedActions: [], fingerprint: `${runId}-unrelated`
    } });

    const response = await app.inject({ method: "GET", url: `/api/security/vendor-users?vendor=linux&username=alice&days=30` });
    assert.equal(response.statusCode, 200, response.body);
    const result = response.json();
    const account = result.accounts.find((item: { username: string }) => item.username === "alice");
    assert.equal(account.loginCount, 1);
    assert.equal(account.reviewCount, 1);
    assert.equal(account.findingCount, 1);
    assert.equal(result.accounts.find((item: { username: string }) => item.username === "bob")?.loginCount, 0, "attributed risky activity is visible even if login logs are missing");
    assert.equal(result.accounts.some((item: { username: string }) => item.username === "collector"), false);
    assert.equal(result.accounts.some((item: { username: string }) => item.username === "routeradmin"), false);
    assert.equal(result.timeline.length, 2);
    assert.equal(result.timeline.find((item: { kind: string }) => item.kind === "privileged")?.risk, "high");
    assert.equal(result.findings[0].username, "alice");

    const scoped = await app.inject({ method: "GET", url: `/api/security/vendor-users?vendor=linux&deviceId=not-a-linux-device` });
    assert.equal(scoped.statusCode, 400);
    const otherOwner = await listVendorUserActivity({ ownerId: "another-owner" });
    assert.equal(otherOwner.vendors.includes("linux"), false);

    const detection = await runSecurityDetection({ deviceId: device.id });
    assert.ok(detection.findingsCreated >= 1);
    const accountFinding = await prisma.finding.findFirst({ where: { deviceId: device.id, category: "account-privileged-activity", actor: "alice" } });
    assert.ok(accountFinding);
    assert.equal(accountFinding.srcIp, null, "account review must not become an automatic IP-block suggestion");
    const afterDetection = await app.inject({ method: "GET", url: `/api/security/vendor-users?vendor=linux&username=alice&days=30` });
    assert.equal(afterDetection.statusCode, 200);
    assert.equal(afterDetection.json().findings.some((item: { id: string }) => item.id === accountFinding.id), true);
    const rerun = await runSecurityDetection({ deviceId: device.id });
    assert.equal(rerun.findingsUpdated, 0, "same evidence must not repeatedly update the finding");
  } finally {
    await prisma.finding.deleteMany({ where: { deviceId: { in: [device.id, unrelatedDevice.id] } } });
    await prisma.securityEvent.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.device.delete({ where: { id: unrelatedDevice.id } });
    await app.close();
  }
});
