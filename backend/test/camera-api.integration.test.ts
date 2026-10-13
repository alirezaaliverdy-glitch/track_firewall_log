import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

test("camera API enforces sessions, CSRF, workspace isolation, encrypted credentials, preview and one-use real execution", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js");
  const { buildApp } = await import("../src/app.js");
  const { createSession } = await import("../src/services/auth.service.js");
  const { parseCameraXml, nodes } = await import("../src/cameras/camera-onvif.js");
  const { decryptSecret } = await import("../src/services/credential-crypto.service.js");
  const host = Object.values(networkInterfaces()).flat().find((item) => item?.family === "IPv4" && !item.internal)?.address;
  assert.ok(host);
  const tag = `camera-fixture-${randomUUID()}`, secret = randomBytes(16).toString("hex");
  const users: string[] = [], actors: string[] = [];
  let port = 0, writes = 0;
  const soap = (action: string, body = "") => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:m="http://www.onvif.org/ver10/media/wsdl"><s:Body><d:${action}Response>${body}</d:${action}Response></s:Body></s:Envelope>`;
  const server = createServer(async (request, reply) => {
    if (request.url === "/snapshot") { reply.setHeader("Content-Type", "image/jpeg"); reply.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    const action = /action="[^\"]*\/([^\/"]+)"/.exec(String(request.headers["content-type"]))?.[1] ?? "";
    // The authentication digest itself is covered by the protocol fixture test.
    const root = parseCameraXml(body);
    assert.equal(body.includes(secret), false);
    const endpoint = `http://${host}:${port}`;
    reply.setHeader("Content-Type", "application/soap+xml");
    if (action === "GetDeviceInformation") reply.end(soap(action, "<d:Manufacturer>Fixture</d:Manufacturer><d:Model>Camera</d:Model>"));
    else if (action === "GetServices") reply.end(soap(action, `<d:Service><d:Namespace>http://www.onvif.org/ver10/media/wsdl</d:Namespace><d:XAddr>${endpoint}/media</d:XAddr></d:Service>`));
    else if (action === "GetProfiles") reply.end(soap(action, '<m:Profiles token="profile"><tt:Name>Main</tt:Name><tt:VideoSourceConfiguration><tt:SourceToken>channel1</tt:SourceToken></tt:VideoSourceConfiguration></m:Profiles>'));
    else if (action === "GetStreamUri") reply.end(soap(action, `<tt:Uri>rtsp://${host}:554/video</tt:Uri>`));
    else if (action === "GetSnapshotUri") reply.end(soap(action, `<tt:Uri>${endpoint}/snapshot</tt:Uri>`));
    else if (action === "SystemReboot") { assert.equal(nodes(root, "Username")[0]?.text, "fixture-camera"); writes++; reply.end(soap(action)); }
    else reply.end(soap(action));
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve)); port = (server.address() as { port: number }).port;
  const app = await buildApp();
  async function identity(role: "admin" | "viewer" | "operator", workspaceOwnerId?: string) {
    const username = `${tag}-${role}-${users.length}`;
    const user = await prisma.appUser.create({ data: { username, displayName: "Camera test", role, workspaceOwnerId, passwordHash: "fixture-not-a-login-password", allowedSections: ["assets", "actions"] } }); users.push(user.id); actors.push(username);
    const session = await createSession(user.id, {});
    const cookie = `firewall_session=${session.token}`;
    const csrf = await app.inject({ url: "/api/auth/csrf", headers: { cookie } }); assert.equal(csrf.statusCode, 200);
    return { id: user.id, headers: { cookie, "x-csrf-token": csrf.json().csrfToken } };
  }
  try {
    const owner = await identity("admin"), other = await identity("admin"), viewer = await identity("viewer", owner.id);
    assert.equal((await app.inject({ url: "/api/cameras" })).statusCode, 401);
    const input = { host, onvifPort: port, name: "Fixture camera", username: "fixture-camera", password: secret };
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: { cookie: owner.headers.cookie }, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: viewer.headers, payload: input })).statusCode, 403);
    const created = await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: input });
    assert.equal(created.statusCode, 201); const camera = created.json().camera;
    assert.equal(camera.status, "verified"); assert.equal(camera.profiles.length, 1);
    assert.equal(created.body.includes(secret), false); assert.equal(created.body.includes("rtsp://"), false); assert.equal(created.body.includes("connectionEncrypted"), false);
    const stored = await prisma.cameraDevice.findUniqueOrThrow({ where: { id: camera.id } });
    assert.equal(stored.connectionEncrypted?.includes(secret), false); assert.ok(decryptSecret(stored.connectionEncrypted)?.includes(secret));
    assert.equal((await app.inject({ url: "/api/cameras", headers: other.headers })).json().cameras.length, 0);
    assert.equal((await app.inject({ url: `/api/cameras/${camera.id}/snapshot?profile=profile`, headers: other.headers })).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/cameras/${camera.id}/snapshot?profile=profile`, headers: viewer.headers })).statusCode, 200);
    const planResponse = await app.inject({ method: "POST", url: `/api/cameras/${camera.id}/actions/preview`, headers: owner.headers, payload: { operation: "reboot" } });
    assert.equal(planResponse.statusCode, 200); const plan = planResponse.json(); assert.equal(writes, 0); assert.equal(plan.preview.connectorInvoked, false);
    const executeUrl = `/api/cameras/${camera.id}/actions/${plan.id}/execute`;
    assert.equal((await app.inject({ method: "POST", url: executeUrl, headers: owner.headers, payload: { intent: "preview", confirmed: true } })).statusCode, 400); assert.equal(writes, 0);
    const executions = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: executeUrl, headers: owner.headers, payload: { intent: "execute", confirmed: true } })));
    assert.deepEqual(executions.map((item) => item.statusCode).sort(), [200, 409]); assert.equal(writes, 1);
    const outcome = executions.find((item) => item.statusCode === 200)!.json(); assert.equal(outcome.connectorInvoked, true); assert.equal(outcome.accepted, true);
    const record = await prisma.cameraActionPlan.findUniqueOrThrow({ where: { id: plan.id } }); assert.equal(record.status, "succeeded");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: camera.id, action: "camera.action_result" } }); assert.equal(audit.dryRun, false); assert.equal(JSON.stringify(audit.metadata).includes(secret), false);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/cameras/${camera.id}`, headers: other.headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/cameras/${camera.id}`, headers: owner.headers })).statusCode, 200);
    assert.equal(await prisma.cameraActionPlan.count({ where: { cameraId: camera.id } }), 0);
  } finally {
    await app.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.auditLog.deleteMany({ where: { actor: { in: actors } } }); await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase();
  }
});
