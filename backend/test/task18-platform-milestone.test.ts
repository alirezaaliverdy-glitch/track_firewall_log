import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { applyAssetImport, syncExistingDevicesToAssets } from "../src/assets/asset-intelligence.service.js";

async function cleanup() {
  await prisma.actionAuditLog.deleteMany({ where: { message: { contains: "Action plan proposed" } } });
  await prisma.actionPlan.deleteMany({ where: { requestedBy: { startsWith: "finding:" } } });
  await prisma.finding.deleteMany({ where: { source: "seeded_detection_rule" } });
  await prisma.securityEvent.deleteMany({ where: { vendor: { in: ["linux", "test"] } } });
  await prisma.assetRelationship.deleteMany();
  await prisma.assetIpAddress.deleteMany({ where: { address: { startsWith: "192.0.2." } } });
  await prisma.assetInterface.deleteMany();
  await prisma.asset.deleteMany({ where: { OR: [{ name: { contains: "task18" } }, { managementIp: { startsWith: "192.0.2." } }, { externalId: { startsWith: "netbox:" } }, { externalId: { startsWith: "wazuh:" } }] } });
  await prisma.assetSyncRun.deleteMany({ where: { sourceType: { in: ["manual_json", "netbox", "wazuh"] } } });
  await prisma.assetSource.deleteMany({ where: { type: { in: ["manual_json", "netbox", "wazuh", "existing_devices"] } } });
  await prisma.assetLocation.deleteMany();
  await prisma.assetSite.deleteMany();
  await prisma.assetPlatform.deleteMany();
  await prisma.assetVendor.deleteMany();
  await prisma.assetRole.deleteMany();
  await prisma.device.deleteMany({ where: { name: { startsWith: "task18" } } });
}

beforeEach(cleanup);

test("asset import preview is non-mutating and apply is idempotent", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const body = { sourceType: "manual_json", idempotencyKey: "task18-import-1", assets: [{ name: "task18-imported", managementIp: "192.0.2.71", vendor: "Linux", site: "Lab" }] };
    const preview = await app.inject({ method: "POST", url: "/api/assets/import/preview", payload: body });
    assert.equal(preview.statusCode, 200);
    assert.equal(await prisma.asset.count({ where: { managementIp: "192.0.2.71" } }), 0);

    const first = await app.inject({ method: "POST", url: "/api/assets/import/apply", payload: body });
    const second = await app.inject({ method: "POST", url: "/api/assets/import/apply", payload: body });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(await prisma.asset.count({ where: { managementIp: "192.0.2.71" } }), 1);
    assert.equal((second.json() as { idempotentReplay: boolean }).idempotentReplay, true);
  } finally {
    await app.close();
  }
});

test("existing device links to one unified asset", async () => {
  const device = await prisma.device.create({
    data: {
      name: "task18-linux",
      vendor: "linux",
      type: DeviceType.linux_edge,
      host: "192.0.2.72",
      managementPort: 22,
      protocol: DeviceProtocol.ssh,
      environment: DeviceEnvironment.lab,
      status: DeviceStatus.online,
      capabilities: {}
    }
  });
  await syncExistingDevicesToAssets();
  await syncExistingDevicesToAssets();
  const assets = await prisma.asset.findMany({ where: { deviceId: device.id } });
  assert.equal(assets.length, 1);
  assert.equal(assets[0].managementIp, "192.0.2.72");
});

test("seeded detection rules create and update one finding from repeated events", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const device = await prisma.device.create({
      data: { name: "task18-detect", vendor: "linux", type: DeviceType.linux_edge, host: "192.0.2.73", managementPort: 22, protocol: DeviceProtocol.ssh, environment: DeviceEnvironment.lab, status: DeviceStatus.online, capabilities: {} }
    });
    await applyAssetImport({ sourceType: "manual_json", assets: [{ name: "task18-detect", managementIp: "192.0.2.73", vendor: "Linux" }] });
    for (let index = 0; index < 5; index += 1) {
      await app.inject({ method: "POST", url: "/api/security/events", payload: { deviceId: device.id, vendor: "linux", eventType: "auth_failure", action: "denied", srcIp: "203.0.113.55", dstPort: 22, rawMessage: "Failed password for admin" } });
    }
    const findings = await app.inject({ method: "GET", url: "/api/security/findings" });
    assert.equal(findings.statusCode, 200);
    const body = findings.json() as { findings: Array<{ title: string; count: number; assetId?: string }> };
    const authFinding = body.findings.find((finding) => finding.title === "Repeated failed logins");
    assert.ok(authFinding);
    assert.equal(authFinding.count, 5);

    await app.inject({ method: "POST", url: "/api/security/events", payload: { deviceId: device.id, vendor: "linux", eventType: "auth_failure", action: "denied", srcIp: "203.0.113.55", dstPort: 22, rawMessage: "Failed password for admin again" } });
    const second = await app.inject({ method: "GET", url: "/api/security/findings" });
    const updated = (second.json() as { findings: Array<{ title: string; count: number }> }).findings.find((finding) => finding.title === "Repeated failed logins");
    assert.ok(updated);
    assert.ok(updated.count >= 6);
  } finally {
    await app.close();
  }
});

test("finding creates reviewed ActionPlan with asset context but does not execute", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const device = await prisma.device.create({
      data: { name: "task18-action", vendor: "linux", type: DeviceType.linux_edge, host: "192.0.2.74", managementPort: 22, protocol: DeviceProtocol.ssh, environment: DeviceEnvironment.lab, status: DeviceStatus.online, capabilities: {} }
    });
    const imported = await applyAssetImport({ sourceType: "manual_json", assets: [{ name: "task18-action", managementIp: "192.0.2.74", vendor: "Linux" }] });
    assert.equal((imported.applied as { created: number }).created, 1);
    for (let index = 0; index < 5; index += 1) await app.inject({ method: "POST", url: "/api/security/events", payload: { deviceId: device.id, vendor: "linux", eventType: "auth_failure", action: "denied", srcIp: "203.0.113.56", dstPort: 22, rawMessage: "Failed password" } });
    const findings = await app.inject({ method: "GET", url: "/api/security/findings" });
    const finding = (findings.json() as { findings: Array<{ id: string; deviceId?: string | null }> }).findings.find((item) => item.deviceId === device.id);
    assert.ok(finding);
    const response = await app.inject({ method: "POST", url: `/api/security/findings/${finding.id}/action-plan` });
    assert.equal(response.statusCode, 201);
    const plan = (response.json() as { actionPlan: { status: string; assetId: string | null; parametersJson: Record<string, unknown> } }).actionPlan;
    assert.equal(plan.status, "proposed");
    assert.ok(plan.assetId);
    assert.equal((plan.parametersJson.assetContext as { managementIp?: string }).managementIp, "192.0.2.74");
    assert.equal((plan.parametersJson.metadata as Record<string, unknown> | undefined)?.connectorInvoked, undefined);
  } finally {
    await app.close();
  }
});

test("mock adapters are idempotent and rule DSL rejects unsafe operators", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const netboxPreview = await app.inject({ method: "GET", url: "/api/integrations/netbox/sync-preview" });
    assert.equal(netboxPreview.statusCode, 200);
    const first = await app.inject({ method: "POST", url: "/api/integrations/netbox/sync", payload: { idempotencyKey: "task18-netbox" } });
    const second = await app.inject({ method: "POST", url: "/api/integrations/netbox/sync", payload: { idempotencyKey: "task18-netbox" } });
    assert.equal(first.statusCode, 200);
    assert.equal((second.json() as { idempotentReplay: boolean }).idempotentReplay, true);

    const wazuh = await app.inject({ method: "POST", url: "/api/integrations/wazuh/sync", payload: { idempotencyKey: "task18-wazuh" } });
    assert.equal(wazuh.statusCode, 200);

    const rules = await app.inject({ method: "GET", url: "/api/security/rules" });
    assert.equal((rules.json() as { rules: unknown[] }).rules.length >= 12, true);
    const invalid = await app.inject({ method: "POST", url: "/api/security/rules/test", payload: { conditions: [{ field: "rawMessage", operator: "eval", value: "process.exit()" }] } });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await app.close();
  }
});
