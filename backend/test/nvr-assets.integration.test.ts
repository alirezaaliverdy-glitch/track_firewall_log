import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";

test("NVR inventory and batch company moves are durable, atomic, tenant-scoped and do not create SSH devices", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js"), { buildApp } = await import("../src/app.js"), { createSession } = await import("../src/services/auth.service.js");
  const { cameraRevision } = await import("../src/cameras/camera-policy.js");
  const tag = `nvr-assets-${randomUUID()}`, userIds: string[] = [], actors: string[] = [], app = await buildApp();
  async function identity(role: "admin" | "viewer", workspaceOwnerId?: string) {
    const username = `${tag}-${userIds.length}`;
    const user = await prisma.appUser.create({ data: { username, displayName: "Fixture", role, workspaceOwnerId, passwordHash: "not-a-login", allowedSections: ["assets", "actions"] } });
    userIds.push(user.id); actors.push(username);
    const session = await createSession(user.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = await app.inject({ url: "/api/auth/csrf", headers: { cookie } });
    return { id: user.id, headers: { cookie, "x-csrf-token": csrf.json().csrfToken } };
  }
  try {
    const owner = await identity("admin"), other = await identity("admin"), viewer = await identity("viewer", owner.id);
    const company = await prisma.company.create({ data: { ownerId: owner.id, name: tag, code: tag } });
    const target = await prisma.company.create({ data: { ownerId: owner.id, name: tag + "-target", code: tag + "-target" } });
    const foreign = await prisma.company.create({ data: { ownerId: other.id, name: tag + "-foreign", code: tag + "-foreign" } });
    const secret = randomBytes(24).toString("hex");
    const create = async (host: string, kind = "nvr", companyId = company.id) => {
      const result = await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: { companyId, kind, host, name: `${kind}-${host}`, connectionMode: "rtsp", rtspUrl: `rtsp://${host}:554/video`, username: "fixture", password: secret } });
      assert.equal(result.statusCode, 201); assert.equal(result.body.includes(secret), false); return result.json().camera;
    };
    const nvr = await create("192.168.210.50"), camera = await create("192.168.210.4", "camera");
    const stored = await prisma.cameraDevice.findUniqueOrThrow({ where: { id: nvr.id } }), assetId = `nvr-${nvr.id}`;
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).companyId, company.id);
    assert.equal(await prisma.device.count({ where: { companyId: company.id } }), 0);
    const inventory = await app.inject({ url: `/api/assets?companyId=${company.id}`, headers: viewer.headers });
    assert.equal(inventory.statusCode, 200); const projected = inventory.json().assets.find((a: { id: string }) => a.id === assetId);
    assert.equal(projected.nvrCameraId, nvr.id); assert.equal(projected.device, null); assert.equal(projected.openPath, `/assets/devices/${assetId}`);
    const unchangedAt = (await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).updatedAt.getTime();
    await app.inject({ url: `/api/assets?companyId=${company.id}`, headers: owner.headers });
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).updatedAt.getTime(), unchangedAt, "polling unchanged NVR inventory must not write it again");
    const detail = await app.inject({ url: `/api/cameras/${nvr.id}`, headers: viewer.headers }); assert.equal(detail.statusCode, 200); assert.equal(detail.json().camera.company.name, company.name); assert.equal(detail.body.includes("connectionEncrypted"), false);
    assert.equal((await app.inject({ url: `/api/cameras/${nvr.id}`, headers: other.headers })).statusCode, 404);
    const move = (ids: string[], companyId: string, headers = owner.headers) => app.inject({ method: "POST", url: "/api/cameras/transfer", headers, payload: { ids, companyId } });
    assert.equal((await move([nvr.id], target.id, viewer.headers)).statusCode, 403);
    assert.equal((await move([nvr.id], company.id)).json().error.code, "CAMERA_TRANSFER_SAME_COMPANY");
    assert.equal((await move([nvr.id], target.id, { ...owner.headers, "x-csrf-token": "invalid" })).statusCode, 403);
    assert.equal((await move([nvr.id], foreign.id)).statusCode, 404);
    assert.equal((await move([nvr.id, "missing"], target.id)).statusCode, 404);
    await create(camera.host, "camera", target.id);
    assert.equal((await move([nvr.id, camera.id], target.id)).statusCode, 409);
    assert.equal((await prisma.cameraDevice.findUniqueOrThrow({ where: { id: nvr.id } })).companyId, company.id, "partial batch is rolled back");
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).companyId, company.id);
    const generic = await prisma.asset.create({ data: { companyId: target.id, name: "Reserved generic asset", managementIp: nvr.host } });
    assert.equal((await move([nvr.id], target.id)).json().error.code, "NVR_ASSET_IP_CONFLICT");
    await prisma.asset.delete({ where: { id: generic.id } });
    // Legacy unassigned cameras can be moved without losing the protected connection.
    await prisma.cameraDevice.update({ where: { id: nvr.id }, data: { companyId: null } });
    assert.equal((await move([nvr.id], target.id)).statusCode, 200);
    const updated = await prisma.cameraDevice.findUniqueOrThrow({ where: { id: nvr.id } });
    assert.equal(updated.companyId, target.id); assert.equal(updated.connectionEncrypted, stored.connectionEncrypted); assert.equal(updated.vpnConnectionId, stored.vpnConnectionId);
    assert.notEqual(cameraRevision(updated), cameraRevision(stored), "moving invalidates a control preview");
    assert.equal(updated.monitorReportJson, null); assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).companyId, target.id);
    assert.equal(await prisma.auditLog.count({ where: { action: "camera.company_transferred", actor: actors[0] } }), 1, "failed batches do not produce success audit");
    const imported = await app.inject({ method: "POST", url: "/api/assets/import/apply", headers: owner.headers, payload: { companyId: target.id, sourceType: "manual", assets: [{ name: "Overwrite attempt", managementIp: nvr.host }] } });
    assert.equal(imported.statusCode, 400); assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).name, nvr.name);
    const sensorResult = await app.inject({ url: `/api/cameras/${nvr.id}/monitor`, headers: viewer.headers });
    assert.equal(sensorResult.statusCode, 200); assert.equal(sensorResult.json().sensors.length, 13); assert.ok(sensorResult.json().sensors.every((s: { value: number | null }) => s.value === null));
    await prisma.company.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    assert.equal((await move([camera.id], target.id)).statusCode, 404); assert.equal((await app.inject({ url: `/api/cameras/${nvr.id}`, headers: owner.headers })).statusCode, 404);
    await prisma.company.update({ where: { id: target.id }, data: { deletedAt: null } });
    assert.equal((await app.inject({ method: "DELETE", url: `/api/assets/${assetId}`, headers: other.headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/assets/${assetId}`, headers: owner.headers })).statusCode, 200);
    assert.equal(await prisma.cameraDevice.count({ where: { id: nvr.id } }), 0); assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).managedState, "archived");
    await app.inject({ url: `/api/assets?companyId=${target.id}`, headers: owner.headers });
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).managedState, "archived", "listing does not resurrect a deleted NVR");
    assert.equal((await prisma.asset.findUniqueOrThrow({where:{id:assetId}})).managementIp,null,"deleted NVR releases its unique IP reservation");
    // Pre-fix archives retained the IP even after CameraDevice was deleted.
    await prisma.asset.update({where:{id:assetId},data:{managementIp:nvr.host}});
    const replacement=await create(nvr.host,"nvr",target.id);
    assert.notEqual(replacement.id,nvr.id);
    assert.equal((await prisma.asset.findUniqueOrThrow({where:{id:assetId}})).managementIp,null,"only a verified legacy orphan NVR reservation is released");
    assert.equal((await prisma.asset.findUniqueOrThrow({where:{id:assetId}})).managedState,"archived");
    assert.equal((await app.inject({method:"DELETE",url:`/api/cameras/${replacement.id}`,headers:owner.headers})).statusCode,200);
    const third=await create(nvr.host,"nvr",target.id);assert.ok(third.id);
  } finally { await app.close(); await prisma.auditLog.deleteMany({ where: { actor: { in: actors } } }); await prisma.appUser.deleteMany({ where: { id: { in: userIds } } }); await shutdownDatabase(); }
});
