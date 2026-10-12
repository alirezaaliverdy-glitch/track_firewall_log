import assert from "node:assert/strict";
import test from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { createCredential } from "../src/services/credential.service.js";

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
    assert.equal(reviewResponse.statusCode, 409);
    assert.equal(reviewResponse.json().code, "ACTION_NOT_IN_CATALOG");
  } finally {
    if (deviceId) {
      await prisma.actionPlan.deleteMany({ where: { deviceId } });
      await prisma.securityEvent.deleteMany({ where: { deviceId } });
      await prisma.finding.deleteMany({ where: { deviceId } });
      await prisma.device.deleteMany({ where: { id: deviceId } });
    }
    if (credentialId) await prisma.deviceCredential.deleteMany({ where: { id: credentialId } });
    await app.close();
  }
});
