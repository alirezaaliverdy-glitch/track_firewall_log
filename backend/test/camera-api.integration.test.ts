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
    if (request.url?.startsWith("/ISAPI/")) { reply.writeHead(403); reply.end(); return; }
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
    for (const [path, payload] of [["/api/cameras/fixture/playback/export", { recordingToken: "fixture", start: "2026-01-01T00:00:00Z", duration: 5 }], ["/api/cameras/fixture/nvr/diagnostics", {}], ["/api/cameras/fixture/actions/preview", { operation: "nvr_overwrite", value: "StopRecord" }]] as const) assert.equal((await app.inject({ method: "POST", url: path, headers: viewer.headers, payload })).statusCode, 403, "viewer cannot export footage or change NVR settings");
    assert.equal((await app.inject({ url: "/api/cameras" })).statusCode, 401);
    const company = await prisma.company.create({ data: { ownerId: owner.id, name: "Fixture company", code: tag } });
    const input = { companyId: company.id, kind: "nvr", host, onvifPort: port, name: "Fixture camera", username: "fixture-camera", password: secret };
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: { cookie: owner.headers.cookie }, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: viewer.headers, payload: input })).statusCode, 403);
    const created = await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: input });
    assert.equal(created.statusCode, 201); const camera = created.json().camera;
    assert.equal(camera.status, "verified"); assert.equal(camera.profiles.length, 1);
    const companyTwo = await prisma.company.create({ data: { ownerId: owner.id, name: "Second fixture", code: `${tag}-two` } });
    const duplicateIp = await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: { ...input, companyId: companyTwo.id } });
    assert.equal(duplicateIp.statusCode, 201, 'same private IP can belong to different customer routes');
    assert.equal((await app.inject({ url: `/api/cameras?companyId=${company.id}`, headers: owner.headers })).json().cameras.length, 1);
    assert.equal((await app.inject({ url: `/api/cameras?companyId=${company.id}`, headers: other.headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: { ...input, companyId: "foreign" } })).statusCode, 404);
    const directory = (await app.inject({ url: "/api/cameras/companies", headers: viewer.headers })).json();
    assert.equal(directory.companies.length, 2); assert.equal(directory.companies[0].nvrCount, 1);
    const monitorUrl = `/api/cameras/${camera.id}/monitor`;
    assert.equal((await app.inject({ method: "POST", url: monitorUrl + "/refresh", headers: viewer.headers })).statusCode, 403);
    assert.equal((await app.inject({ url: monitorUrl, headers: other.headers })).statusCode, 404);
    await prisma.cameraDevice.update({ where: { id: camera.id }, data: { monitorHistoryJson: Array.from({ length: 48 }, () => ({ checkedAt: new Date().toISOString(), reachable: true, warningCount: 0 })) } });
    const monitoring = await app.inject({ method: "POST", url: monitorUrl + "/refresh", headers: owner.headers });
    assert.equal(monitoring.statusCode, 200); assert.equal(monitoring.json().report.reachable, true); assert.equal(monitoring.json().history.length, 48); assert.equal(monitoring.json().report.coverage.diskHealth, "unsupported");
    assert.equal(monitoring.json().history.at(-1).readings.connection, 1); assert.equal(monitoring.json().history.at(-1).readings.cpu, undefined);
    assert.equal(monitoring.json().sensors.find((sensor: { id: string }) => sensor.id === "cpu").status, "unknown");
    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: new Date() } });
    assert.equal((await app.inject({ url: monitorUrl, headers: owner.headers })).statusCode, 404, 'archived company blocks media and monitoring too');
    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: null } });
    const storageSetting = await app.inject({ method: "PATCH", url: `/api/cameras/${camera.id}`, headers: owner.headers, payload: { monitoringEnabled: true, storageSettings: { adapter: "hikvision", port, https: false, useDeviceCredentials: false, username: "storage-fixture", password: secret } } });
    assert.equal(storageSetting.statusCode, 200); assert.equal(storageSetting.body.includes(secret), false); assert.equal(storageSetting.body.includes("storage-fixture"), false);
    assert.equal(storageSetting.json().camera.status, "verified", 'disk-only settings do not invalidate video connection');
    assert.equal(storageSetting.json().camera.monitorReportJson, null, 'previous disk report is invalidated');
    const deniedMonitor = await app.inject({ method: "POST", url: monitorUrl + "/refresh", headers: owner.headers });
    assert.equal(deniedMonitor.statusCode, 200); assert.equal(deniedMonitor.json().report.storage.status, "denied"); assert.equal(deniedMonitor.json().monitoringEnabled, false, 'credential errors stop scheduled retries');
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
