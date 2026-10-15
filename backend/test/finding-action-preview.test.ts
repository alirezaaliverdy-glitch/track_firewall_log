import assert from "node:assert/strict";
import test from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { createCredential } from "../src/services/credential.service.js";
import { createFindingActionPlan } from "../src/assets/asset-intelligence.service.js";

test("a repeated-login finding opens as a preview-ready IP block without invoking the connector", async () => {
  const runId = `finding-preview-${Date.now()}`;
  const sourceIp = "203.0.113.156";
  const app = await buildApp({ authRequired: false });
  let deviceId = "";
  let credentialId = "";
  try {
    const credential = await createCredential({ name: `${runId}-credential`, type: "password", username: "collector", password: "test-only-not-used", sudo: true });
    credentialId = credential.id;
    const device = await prisma.device.create({
      data: {
        name: runId,
        vendor: "linux",
        type: DeviceType.linux_edge,
        host: "192.0.2.156",
        managementPort: 22,
        protocol: DeviceProtocol.ssh,
        environment: DeviceEnvironment.lab,
        status: DeviceStatus.online,
        credentialId: credential.id,
        capabilities: {},
      },
    });
    deviceId = device.id;
    const evidence = await Promise.all([0, 1].map((index) => prisma.securityEvent.create({
      data: {
        deviceId: device.id,
        timestamp: new Date(),
        sourceType: "linux_journal",
        vendor: "linux",
        eventType: "authentication_failure",
        action: "auth_failed",
        srcIp: sourceIp,
        username: "root",
        rawSnippet: `Failed password for root from ${sourceIp} attempt ${index}`,
        normalizedJson: { result: "denied" },
        dedupeKey: `${runId}-event-${index}`,
      },
    })));
    const finding = await prisma.finding.create({
      data: {
        deviceId: device.id,
        vendor: "linux",
        title: "Repeated failed logins",
        severity: "high",
        category: "authentication",
        status: "active",
        confidence: 0.9,
        summary: "Repeated failed SSH logins from one public source.",
        evidenceJson: [],
        source: "seeded_detection_rule",
        rawRefsJson: evidence.map((event) => event.id),
        firstSeen: new Date(),
        lastSeen: new Date(),
        count: 11,
        mitreTags: ["T1110"],
        srcIp: sourceIp,
        recommendedActions: [],
        fingerprint: runId,
      },
    });

    const response = await app.inject({ method: "POST", url: `/api/security/findings/${finding.id}/action-plan` });
    assert.equal(response.statusCode, 201, response.body);
    const plan = response.json().actionPlan as {
      id: string;
      status: string;
      actionType: string;
      parametersJson: Record<string, unknown>;
      dryRunJson: { plannedCommands?: string[] };
      resultJson: Record<string, unknown> | null;
    };
    assert.equal(plan.status, "dry_run_ready", JSON.stringify(plan));
    assert.equal(plan.actionType, "linux_block_ip");
    assert.equal(plan.parametersJson.srcIp, sourceIp);
    assert.equal(plan.parametersJson.ipAddress, sourceIp);
    assert.ok(plan.dryRunJson.plannedCommands?.some((command) => command.includes(sourceIp)));
    assert.notEqual(plan.resultJson?.connectorInvoked, true);

    await prisma.securityEvent.updateMany({ where: { id: { in: evidence.map((event) => event.id) } }, data: { tags: { applicationOwned: true } } });
    const decisionResponse = await app.inject({ method: "GET", url: `/api/security/findings/${finding.id}/decision` });
    assert.equal(decisionResponse.statusCode, 200);
    assert.equal(decisionResponse.json().mode, "investigate");
    assert.equal(decisionResponse.json().supportingReferenceCount, 0);
    assert.equal(decisionResponse.json().applicationOwnedReferenceCount, 2);
    const reviewResponse = await app.inject({ method: "POST", url: `/api/security/findings/${finding.id}/action-plan` });
    assert.equal(reviewResponse.statusCode, 201);
    assert.equal(reviewResponse.json().actionPlan.actionType, "linux_daily_check");
    assert.equal(reviewResponse.json().actionPlan.status, "dry_run_ready");
    assert.equal(reviewResponse.json().actionPlan.parametersJson.responseKind, "diagnostic");
    assert.notEqual(reviewResponse.json().actionPlan.resultJson?.connectorInvoked, true);
    const telemetryResponse = await app.inject({ method: "POST", url: `/api/findings/${finding.id}/action-plan` });
    assert.equal(telemetryResponse.statusCode, 201);
    assert.equal(telemetryResponse.json().actionPlan.status, "dry_run_ready");
    assert.equal(telemetryResponse.json().actionPlan.actionType, "linux_daily_check");
    assert.equal(telemetryResponse.json().actionPlan.id, reviewResponse.json().actionPlan.id);
    assert.equal(await createFindingActionPlan(finding.id, "different-workspace-fixture"), null);

    const sudoEvent = await prisma.securityEvent.create({ data: {
      deviceId, timestamp: new Date(), vendor: "linux", sourceType: "linux_auth", eventType: "linux_log", action: "auth_success", username: "root",
      rawMessage: "Oct 13 12:18:32 fixture-host sudo: operator1 : TTY=pts/1 ; PWD=/home/operator1 ; USER=root ; COMMAND=/usr/bin/grep 'Accepted password.*root' /var/log/auth.log",
      normalizedJson: {}, dedupeKey: `${runId}-sudo`,
    } });
    const rootFinding = await prisma.finding.create({ data: {
      deviceId, vendor: "linux", title: "Linux: remote root login", category: "privileged-access", severity: "critical", status: "active", confidence: 0.82, summary: "Legacy false root login",
      evidenceJson: [], rawRefsJson: [sudoEvent.id], source: "seeded_detection_rule", firstSeen: new Date(), lastSeen: new Date(), count: 1, mitreTags: [], recommendedActions: [], fingerprint: `${runId}:linux.root-remote-login`,
    } });
    const analysisResponse = await app.inject({ method: "POST", url: `/api/security/findings/${rootFinding.id}/analysis`, payload: {} });
    assert.equal(analysisResponse.statusCode, 200);
    assert.equal(analysisResponse.json().analysis.verdict, "contradicted");
    assert.equal(analysisResponse.json().analysis.events[0].actor, "operator1");
    assert.equal(analysisResponse.json().analysis.events[0].effectiveUser, "root");
    assert.equal(analysisResponse.json().evidenceScore, 0);
    assert.equal((await prisma.finding.findUniqueOrThrow({ where: { id: rootFinding.id } })).status, "false_positive");
    assert.equal((await prisma.securityEvent.findUniqueOrThrow({ where: { id: sudoEvent.id } })).action, "sudo_command");
    assert.equal(await prisma.auditLog.count({ where: { action: "security.finding.classification_corrected", targetId: rootFinding.id } }), 1);
  } finally {
    if (deviceId) {
      await prisma.auditLog.deleteMany({ where: { deviceId } });
      await prisma.actionPlan.deleteMany({ where: { deviceId } });
      await prisma.securityEvent.deleteMany({ where: { deviceId } });
      await prisma.finding.deleteMany({ where: { deviceId } });
      await prisma.device.deleteMany({ where: { id: deviceId } });
    }
    if (credentialId) await prisma.deviceCredential.deleteMany({ where: { id: credentialId } });
    await app.close();
  }
});
