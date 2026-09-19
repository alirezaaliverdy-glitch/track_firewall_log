import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const runId = `attacker-api-${Date.now()}`;
const publicIp = "203.0.113.201";
const privateIp = "10.44.0.9";
const unqualifiedIp = "198.51.100.77";
const sessionNoiseIp = "198.51.100.88";

async function cleanup() {
  const devices = await prisma.device.findMany({ where: { name: { startsWith: runId } }, select: { id: true } });
  if (devices.length) await prisma.actionPlan.deleteMany({ where: { deviceId: { in: devices.map((device) => device.id) } } });
  await prisma.securityEvent.deleteMany({ where: { dedupeKey: { startsWith: runId } } });
  await prisma.finding.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.asset.deleteMany({ where: { name: { startsWith: runId } } });
  await prisma.device.deleteMany({ where: { name: { startsWith: runId } } });
}

test("attacker API aggregates qualified source IPs across vendors and excludes log-only IPs", async () => {
  await cleanup();
  const app = await buildApp({ authRequired: false });
  try {
    const linux = await prisma.device.create({
      data: {
        name: `${runId}-linux`,
        vendor: "Linux",
        type: "linux_edge",
        host: "192.0.2.241",
        managementPort: 22,
        protocol: "ssh",
        environment: "lab",
        status: "online"
      }
    });
    const mikrotik = await prisma.device.create({
      data: {
        name: `${runId}-mikrotik`,
        vendor: "MikroTik",
        type: "mikrotik",
        host: "192.0.2.242",
        managementPort: 22,
        protocol: "ssh",
        environment: "lab",
        status: "online"
      }
    });
    const linuxAsset = await prisma.asset.create({ data: { name: `${runId}-linux-asset`, hostname: "linux-lab", managementIp: linux.host, deviceId: linux.id, healthState: "warning" } });
    const mikrotikAsset = await prisma.asset.create({ data: { name: `${runId}-mikrotik-asset`, hostname: "router-lab", managementIp: mikrotik.host, deviceId: mikrotik.id, healthState: "healthy" } });
    const now = new Date();

    await prisma.finding.createMany({
      data: [
        {
          deviceId: linux.id,
          assetId: linuxAsset.id,
          vendor: "linux",
          title: "Repeated SSH authentication failures",
          severity: "high",
          category: "authentication_attack",
          status: "active",
          confidence: 0.96,
          summary: "Repeated authentication failures from one source",
          evidenceJson: { sourceIp: publicIp, password: "must-not-leak" },
          source: "linux_journal",
          rawRefsJson: [],
          firstSeen: new Date(now.getTime() - 120_000),
          lastSeen: now,
          count: 12,
          mitreTags: ["T1110"],
          actor: "root",
          srcIp: publicIp,
          dstIp: linux.host,
          dstPort: 22,
          recommendedActions: [],
          fingerprint: `${runId}-linux-public`
        },
        {
          deviceId: mikrotik.id,
          assetId: mikrotikAsset.id,
          vendor: "mikrotik",
          title: "Firewall scan detected",
          severity: "critical",
          category: "network_scan",
          status: "investigating",
          confidence: 0.91,
          summary: "A scan crossed the configured threshold",
          evidenceJson: { sourceIp: publicIp },
          source: "routeros_log",
          rawRefsJson: [],
          firstSeen: new Date(now.getTime() - 90_000),
          lastSeen: now,
          count: 7,
          mitreTags: ["T1046"],
          srcIp: publicIp,
          dstIp: mikrotik.host,
          dstPort: 8291,
          recommendedActions: [],
          fingerprint: `${runId}-mikrotik-public`
        },
        {
          deviceId: linux.id,
          assetId: linuxAsset.id,
          vendor: "linux",
          title: "Suspicious internal source",
          severity: "medium",
          category: "lateral_movement",
          status: "active",
          confidence: 0.8,
          summary: "Internal source requires review",
          evidenceJson: { sourceIp: privateIp },
          source: "linux_journal",
          rawRefsJson: [],
          firstSeen: now,
          lastSeen: now,
          count: 2,
          mitreTags: ["T1021"],
          srcIp: privateIp,
          dstIp: linux.host,
          dstPort: 22,
          recommendedActions: [],
          fingerprint: `${runId}-linux-private`
        },
        {
          deviceId: linux.id,
          assetId: linuxAsset.id,
          vendor: "linux",
          title: "Linux: repeated authentication failures",
          severity: "high",
          category: "authentication",
          status: "active",
          confidence: 0.9,
          summary: "Historical detector incorrectly grouped session lifecycle lines",
          evidenceJson: Array.from({ length: 8 }, (_, index) => ({ message: `sshd[42${index}]: Timeout, client not responding from user alireza ${sessionNoiseIp} port 54${index}21` })),
          source: "seeded_detection_rule",
          rawRefsJson: [],
          firstSeen: new Date(now.getTime() - 60_000),
          lastSeen: now,
          count: 8,
          mitreTags: ["T1110"],
          actor: "alireza",
          srcIp: sessionNoiseIp,
          dstIp: linux.host,
          dstPort: 22,
          recommendedActions: [],
          fingerprint: `${runId}-linux-session-noise`
        }
      ]
    });

    await prisma.securityEvent.createMany({
      data: [
        {
          deviceId: linux.id,
          assetId: linuxAsset.id,
          timestamp: now,
          sourceType: "linux_journal",
          vendor: "linux",
          eventType: "authentication_failure",
          action: "denied",
          severity: "high",
          srcIp: publicIp,
          srcPort: 49221,
          dstIp: linux.host,
          dstPort: 22,
          protocol: "tcp",
          username: "root",
          rawSnippet: "login denied password=super-secret token=hidden",
          normalizedJson: { result: "denied" },
          dedupeKey: `${runId}-event-linux`
        },
        {
          deviceId: mikrotik.id,
          assetId: mikrotikAsset.id,
          timestamp: now,
          sourceType: "routeros_syslog",
          vendor: "mikrotik",
          eventType: "port_scan",
          action: "drop",
          severity: "critical",
          srcIp: publicIp,
          dstIp: mikrotik.host,
          dstPort: 8291,
          protocol: "tcp",
          ruleName: "input-drop",
          rawSnippet: "firewall dropped scanner",
          normalizedJson: { chain: "input" },
          dedupeKey: `${runId}-event-mikrotik`
        },
        {
          deviceId: linux.id,
          assetId: linuxAsset.id,
          timestamp: now,
          sourceType: "linux_journal",
          vendor: "linux",
          eventType: "ordinary_connection",
          action: "allow",
          severity: "info",
          srcIp: unqualifiedIp,
          dstIp: linux.host,
          dstPort: 443,
          protocol: "tcp",
          rawSnippet: "ordinary connection",
          normalizedJson: { result: "allowed" },
          dedupeKey: `${runId}-event-unqualified`
        }
      ]
    });

    const response = await app.inject({ method: "GET", url: "/api/security/attackers" });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    const publicAttacker = body.attackers.find((item: { ip: string }) => item.ip === publicIp);
    const privateAttacker = body.attackers.find((item: { ip: string }) => item.ip === privateIp);
    assert.ok(publicAttacker);
    assert.ok(privateAttacker);
    assert.equal(body.attackers.some((item: { ip: string }) => item.ip === unqualifiedIp), false);
    assert.equal(body.attackers.some((item: { ip: string }) => item.ip === sessionNoiseIp), false);
    assert.deepEqual(new Set(publicAttacker.vendors), new Set(["linux", "mikrotik"]));
    assert.equal(publicAttacker.devices.length, 2);
    assert.equal(publicAttacker.assets.length, 2);
    assert.deepEqual(publicAttacker.targetedPorts, [22, 8291]);
    assert.equal(publicAttacker.status, "investigating");
    assert.equal(privateAttacker.scope, "private");
    assert.equal(body.summary.affectedDevices, 2);

    const vendorResponse = await app.inject({ method: "GET", url: "/api/security/attackers?vendor=mikrotik" });
    assert.equal(vendorResponse.statusCode, 200);
    assert.deepEqual(vendorResponse.json().attackers.map((item: { ip: string }) => item.ip), [publicIp]);
    assert.deepEqual(vendorResponse.json().attackers[0].vendors, ["mikrotik"]);

    const detailResponse = await app.inject({ method: "GET", url: `/api/security/attackers/${publicIp}` });
    assert.equal(detailResponse.statusCode, 200);
    const detail = detailResponse.json().attacker;
    assert.equal(detail.findings.length >= 2, true);
    assert.equal(detail.latestEvidence.length >= 2, true);
    assert.match(detail.latestEvidence[0].message + detail.latestEvidence[1].message, /\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(detail), /super-secret|must-not-leak|token=hidden/);

    const responsePlan = await app.inject({ method: "POST", url: `/api/security/findings/${detail.findings.find((item: { vendor: string }) => item.vendor === "linux").id}/action-plan` });
    assert.equal(responsePlan.statusCode, 201);
    assert.equal(responsePlan.json().actionPlan.actionType, "linux_block_ip");
    assert.equal(responsePlan.json().actionPlan.parametersJson.ipAddress, publicIp);
    assert.equal(responsePlan.json().actionPlan.parametersJson.executionSupport, "connector");

    const fortigate = await prisma.device.create({
      data: { name: `${runId}-fortigate`, vendor: "FortiGate", type: "fortigate", host: "192.0.2.243", managementPort: 22, protocol: "ssh", environment: "lab", status: "online" }
    });
    const fortiFinding = await prisma.finding.create({
      data: {
        deviceId: fortigate.id, vendor: "fortigate", title: "FortiGate: high-severity security threat", severity: "critical", category: "threat-prevention", status: "active", confidence: 0.98,
        summary: "FortiGate IPS blocked a signature", evidenceJson: [{ attack: "test-signature" }], source: "seeded_detection_rule", rawRefsJson: [], firstSeen: now, lastSeen: now, count: 1,
        mitreTags: ["T1190"], srcIp: "198.51.100.55", dstIp: "10.0.0.10", dstPort: 443, recommendedActions: [], fingerprint: `${runId}-fortigate-threat`
      }
    });
    await prisma.securityEvent.create({
      data: { deviceId: fortigate.id, timestamp: now, sourceType: "fortigate_log", vendor: "fortigate", eventType: "fortigate_ips_attack", action: "blocked", severity: "critical", srcIp: "198.51.100.55", dstIp: "10.0.0.10", dstPort: 443, protocol: "tcp", interfaceIn: "wan1", interfaceOut: "port1", rawSnippet: "IPS signature blocked", normalizedJson: {}, dedupeKey: `${runId}-event-fortigate` }
    });
    const fortiResponsePlan = await app.inject({ method: "POST", url: `/api/security/findings/${fortiFinding.id}/action-plan` });
    assert.equal(fortiResponsePlan.statusCode, 201);
    assert.equal(fortiResponsePlan.json().actionPlan.actionType, "fortigate_create_deny_policy");
    assert.equal(fortiResponsePlan.json().actionPlan.parametersJson.sourceIp, "198.51.100.55");
    assert.equal(fortiResponsePlan.json().actionPlan.parametersJson.srcintf, "wan1");
    assert.equal(fortiResponsePlan.json().actionPlan.parametersJson.dstintf, "port1");
    assert.equal(fortiResponsePlan.json().actionPlan.parametersJson.disabled, false);

    const missingResponse = await app.inject({ method: "GET", url: `/api/security/attackers/${unqualifiedIp}` });
    assert.equal(missingResponse.statusCode, 404);
  } finally {
    await cleanup();
    await app.close();
  }
});
