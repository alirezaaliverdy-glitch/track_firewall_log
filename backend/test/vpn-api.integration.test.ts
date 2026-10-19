import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("VPN API encrypts credentials, permits selected operators, enforces CSRF/workspace scope and requires confirmation", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const dir = await mkdtemp(join(tmpdir(), "vpn-api-fixture-")); process.env.VPN_CONTROL_SOCKET = join(dir, "control.sock");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js"), { buildApp } = await import("../src/app.js"), { createSession } = await import("../src/services/auth.service.js");
  const { decryptSecret } = await import("../src/services/credential-crypto.service.js");
  const states = new Map<string, string>(), users: string[] = [], actors: string[] = []; let writes = 0;
  const secret = randomBytes(32).toString("base64"), tag = randomUUID();
  const agent = createServer(async (request, reply) => {
    let body = ""; for await (const chunk of request) body += chunk; const input = JSON.parse(body || "{}");
    let value: unknown = { id: input.id, state: states.get(input.id) ?? "disconnected" };
    if (request.url === "/health") value = { available: true };
    if (request.url === "/route") value = { throughTunnel: states.size > 0, profileId: states.size ? [...states.keys()][0] : null };
    if (request.url === "/connect" || request.url === "/recover") { assert.equal(input.config.privateKey, secret); writes++; await new Promise(resolve => setTimeout(resolve, 50)); states.set(input.id, "connected"); value = { id: input.id, state: "connected", protocol: "wireguard", routes: input.config.routes }; }
    if (request.url === "/disconnect") { states.delete(input.id); value = { id: input.id, state: "disconnected" }; }
    reply.end(JSON.stringify(value));
  });
  await new Promise<void>(resolve => agent.listen(process.env.VPN_CONTROL_SOCKET, resolve)); const app = await buildApp();
  async function identity(role: "admin" | "viewer" | "operator", workspaceOwnerId?: string) {
    const username = `vpn-fixture-${tag}-${users.length}`;
    const user = await prisma.appUser.create({ data: { username, displayName: "VPN test", role, workspaceOwnerId, passwordHash: "fixture-not-a-login-password", allowedSections: ["assets", "actions"] } }); users.push(user.id); actors.push(username);
    const session = await createSession(user.id, {}), cookie = `firewall_session=${session.token}`;
    const response = await app.inject({ url: "/api/auth/csrf", headers: { cookie } });
    return { id: user.id, headers: { cookie, "x-csrf-token": response.json().csrfToken } };
  }
  try {
    const owner = await identity("admin"), other = await identity("admin"), viewer = await identity("viewer", owner.id), operator = await identity("operator", owner.id);
    assert.equal((await app.inject({ url: "/api/vpn" })).statusCode, 401);
    const input = { name: "Fixture VPN", protocol: "wireguard", endpoint: "198.51.100.5", address: "10.70.0.2/32", privateKey: secret, publicKey: randomBytes(32).toString("base64"), routes: ["192.168.18.0/24"] };
    assert.equal((await app.inject({ method: "POST", url: "/api/vpn", headers: { cookie: owner.headers.cookie }, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/vpn", headers: viewer.headers, payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/vpn", headers: owner.headers, payload: { ...input, routes: ["0.0.0.0/0"] } })).statusCode, 400);
    await prisma.appUser.update({ where: { id: operator.id }, data: { allowedSections: ["page:assets.cameras", "page:tools.vpn"] } });
    const response = await app.inject({ method: "POST", url: "/api/vpn", headers: operator.headers, payload: input }); assert.equal(response.statusCode, 201); assert.ok(!response.body.includes(secret)); const profile = response.json();
    const second = await app.inject({ method: "POST", url: "/api/vpn", headers: owner.headers, payload: { ...input, name: "Second site", address: "10.71.0.2/32", routes: ["192.168.20.0/24"] } });
    assert.equal(second.statusCode, 201); assert.equal((await app.inject({ url: "/api/vpn", headers: owner.headers })).json().profiles.length, 2);
    const company = await prisma.company.create({ data: { ownerId: owner.id, name: "VPN fixture", code: `vpn-${tag}` } });
    const deviceInput = { companyId: company.id, name: "Private router", vendor: "linux", type: "linux_edge", protocol: "ssh", host: "192.168.18.60", managementPort: 22, environment: "lab", vpnConnectionId: profile.id };
    assert.equal((await app.inject({ method: "POST", url: "/api/devices", headers: owner.headers, payload: { ...deviceInput, host: "192.168.19.60" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/devices", headers: owner.headers, payload: { ...deviceInput, vpnConnectionId: "other-workspace" } })).statusCode, 400);
    const deviceResult = await app.inject({ method: "POST", url: "/api/devices", headers: owner.headers, payload: deviceInput });
    assert.equal(deviceResult.statusCode, 201); const device = deviceResult.json(); assert.equal(device.vpnConnectionId, profile.id);
    assert.equal((await prisma.vpnDeviceBinding.findUnique({ where: { deviceId: device.id } }))?.vpnConnectionId, profile.id);
    const cameraInput = { companyId: company.id, host: "192.168.18.50", name: "VPN camera", kind: "camera", connectionMode: "rtsp", rtspUrl: "rtsp://192.168.18.50:554/stream", vpnConnectionId: profile.id };
    assert.equal((await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: { ...cameraInput, host: "192.168.19.50", rtspUrl: "rtsp://192.168.19.50:554/stream" } })).statusCode, 400);
    const cameraResult = await app.inject({ method: "POST", url: "/api/cameras", headers: owner.headers, payload: cameraInput });
    assert.equal(cameraResult.statusCode, 201); const camera = cameraResult.json().camera; assert.equal(camera.vpnConnectionId, profile.id);
    assert.equal((await app.inject({ url: "/api/cameras", headers: owner.headers })).json().cameras.find((item: { id: string }) => item.id === camera.id)?.vpnConnectionId, profile.id);
    const stored = await prisma.vpnConnection.findUniqueOrThrow({ where: { id: profile.id } }); assert.ok(!stored.configEncrypted.includes(secret)); assert.ok(decryptSecret(stored.configEncrypted)?.includes(secret));
    assert.equal((await app.inject({ url: "/api/vpn", headers: other.headers })).json().profiles.length, 0);
    assert.equal((await app.inject({ method: "POST", url: `/api/vpn/${profile.id}/connect`, headers: other.headers, payload: { intent: "execute", confirmed: true } })).statusCode, 404);
    const url = `/api/vpn/${profile.id}/connect`;
    assert.equal((await app.inject({ method: "POST", url, headers: owner.headers, payload: { intent: "preview", confirmed: true } })).statusCode, 400); assert.equal(writes, 0);
    assert.equal((await app.inject({ method: "POST", url, headers: owner.headers, payload: { intent: "execute", confirmed: true, revision: "stale" } })).statusCode, 409); assert.equal(writes, 0);
    const results = await Promise.all([1,2].map(() => app.inject({ method: "POST", url, headers: owner.headers, payload: { intent: "execute", confirmed: true, revision: profile.revision } })));
    assert.deepEqual(results.map(result => result.statusCode).sort(), [200,409]); assert.equal(writes, 1);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/vpn/${profile.id}`, headers: owner.headers })).statusCode, 409);
    const refreshed = (await app.inject({ url: "/api/vpn", headers: owner.headers })).json().profiles.find((item: { id: string }) => item.id === profile.id);
    assert.equal((await app.inject({ method: "POST", url: `/api/vpn/${profile.id}/disconnect`, headers: owner.headers, payload: { intent: "execute", confirmed: true, revision: refreshed.revision } })).statusCode, 200);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/vpn/${profile.id}`, headers: owner.headers })).statusCode, 409);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/cameras/${camera.id}`, headers: owner.headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/devices/${device.id}`, headers: owner.headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/vpn/${profile.id}`, headers: owner.headers })).statusCode, 200);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/vpn/${second.json().id}`, headers: owner.headers })).statusCode, 200);
    const openvpnProfile="client\ndev tun\nproto tcp-client\nremote vpn.example.test 443\nauth-user-pass\n<ca>\n-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n</ca>\n";
    const importPath="/api/vpn/import/openvpn",importData={openvpnProfile};
    assert.equal((await app.inject({method:"POST",url:importPath,payload:importData})).statusCode,401);
    assert.equal((await app.inject({method:"POST",url:importPath,headers:viewer.headers,payload:importData})).statusCode,403);
    assert.equal((await app.inject({method:"POST",url:importPath,headers:operator.headers,payload:importData})).statusCode,200);
    assert.equal((await app.inject({method:"POST",url:importPath,headers:{cookie:owner.headers.cookie},payload:importData})).statusCode,403);
    const imported=await app.inject({method:"POST",url:importPath,headers:owner.headers,payload:importData});assert.equal(imported.statusCode,200);assert.equal(imported.json().transport,"tcp4-client");assert.ok(!imported.body.includes("ZmFrZQ"));
    assert.equal((await app.inject({method:"POST",url:importPath,headers:owner.headers,payload:{openvpnProfile:openvpnProfile+"up /bin/sh\n"}})).statusCode,400);
    const created=await app.inject({method:"POST",url:"/api/vpn",headers:owner.headers,payload:{name:"OpenVPN fixture",protocol:"openvpn",openvpnProfile,routes:["192.168.111.0/24"],username:"fixture",password:secret}});assert.equal(created.statusCode,201);const ovpn=created.json();assert.equal(ovpn.protocol,"openvpn");assert.equal(ovpn.endpointPort,443);assert.ok(!created.body.includes(openvpnProfile));assert.ok(!created.body.includes(secret));
    const encrypted=await prisma.vpnConnection.findUniqueOrThrow({where:{id:ovpn.id}});assert.ok(decryptSecret(encrypted.configEncrypted)?.includes("BEGIN CERTIFICATE"));assert.ok(!encrypted.configEncrypted.includes("BEGIN CERTIFICATE"));
    const edit=await app.inject({method:"PATCH",url:`/api/vpn/${ovpn.id}`,headers:owner.headers,payload:{name:"Edited OpenVPN",protocol:"openvpn",routes:ovpn.routesJson,openvpnProfile:"",password:"",keyPassphrase:""}});assert.equal(edit.statusCode,200);assert.ok(!edit.body.includes(secret));
    assert.equal((await app.inject({method:"DELETE",url:`/api/vpn/${ovpn.id}`,headers:owner.headers})).statusCode,200);
    const audit = await prisma.auditLog.findMany({ where: { actor: { in: actors } } }); assert.ok(!JSON.stringify(audit).includes(secret)); assert.ok(audit.some(item => item.action === "vpn.connect_result"));
  } finally { await app.close(); await new Promise<void>(resolve => agent.close(() => resolve())); await prisma.auditLog.deleteMany({ where: { actor: { in: actors } } }); await prisma.appUser.deleteMany({ where: { id: { in: users } } }); await shutdownDatabase(); await rm(dir, { recursive: true, force: true }); }
});
