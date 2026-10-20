import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

test("camera-only operator registers unknown NVR without a protocol; failed detection preserves inventory and deletion releases IP", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js");
  const { buildApp } = await import("../src/app.js");
  const { createSession } = await import("../src/services/auth.service.js");
  const app = await buildApp(), tag = `auto-nvr-${randomUUID()}`, users: string[] = [], actors: string[] = [];
  const calls: string[] = [];
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    calls.push(`${req.method} ${req.url}`); res.statusCode = 404; res.end("No supported service");
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve));
  const host = Object.values(networkInterfaces()).flat().find(v => v?.family === "IPv4" && !v.internal)!.address;
  const port = (server.address() as { port: number }).port;
  async function actor(role: "admin" | "operator" | "viewer", workspaceOwnerId?: string) {
    const username = `${tag}-${users.length}`;
    const user = await prisma.appUser.create({ data: { username, displayName: "Fixture", role, workspaceOwnerId, passwordHash: "not-a-login", allowedSections: ["page:assets.cameras"] } });
    users.push(user.id); actors.push(username);
    const session = await createSession(user.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = await app.inject({ url: "/api/auth/csrf", headers: { cookie } });
    return { id: user.id, headers: { cookie, "x-csrf-token": csrf.json().csrfToken } };
  }
  try {
    const owner = await actor("admin"), operator = await actor("operator", owner.id), viewer = await actor("viewer", owner.id);
    const company = await prisma.company.create({ data: { name: tag, code: tag, ownerId: owner.id } });
    const secret = randomBytes(24).toString("hex");
    const payload = { companyId: company.id, host, onvifPort: port, kind: "nvr", username: "fixture", password: secret };
    const post = (headers = operator.headers) => app.inject({ method: "POST", url: "/api/cameras", headers, payload });
    assert.equal((await post(viewer.headers)).statusCode, 403);
    const first = await post(); assert.equal(first.statusCode, 201); assert.equal(first.body.includes(secret), false);
    const camera = first.json().camera;
    assert.equal(camera.connectionMode, "auto"); assert.equal(camera.status, "error"); assert.equal(camera.lastErrorCode, "NVR_AUTO_DETECT_UNAVAILABLE");
    assert.ok(await prisma.asset.findUnique({ where: { id: `nvr-${camera.id}` } }));
    assert.deepEqual(calls, ["GET /doc/script/common.js", "GET /onvif/device_service"]);
    assert.equal((await post()).statusCode, 409); assert.equal(calls.length, 2, "duplicate registration never retries credentials");
    assert.equal((await app.inject({ method: "DELETE", url: `/api/cameras/${camera.id}`, headers: viewer.headers })).statusCode, 403);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/cameras/${camera.id}`, headers: operator.headers })).statusCode, 200);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: `nvr-${camera.id}` } })).managementIp, null);
    assert.equal((await post()).statusCode, 201);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await app.close();
    await prisma.auditLog.deleteMany({ where: { actor: { in: actors } } });
    await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
