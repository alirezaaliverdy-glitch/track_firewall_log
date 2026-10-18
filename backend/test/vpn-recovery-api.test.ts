import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("durable VPN intent restores lost helpers, paces failures, preserves manual disconnect and rejects unsafe recovery", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const dir = await mkdtemp(join(tmpdir(), "vpn-recovery-api-")); process.env.VPN_CONTROL_SOCKET = join(dir, "control.sock");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js"), { encryptSecret, decryptSecret } = await import("../src/services/credential-crypto.service.js");
  const service = await import("../src/vpn/vpn.service.js");
  const tag = `vpn-recovery-${randomUUID()}`, user = await prisma.appUser.create({ data: { username: tag, displayName: "Fixture", role: "admin", passwordHash: "fixture-only" } });
  const actor = { id: user.id, username: tag, role: "admin" }, states = new Map<string, string>();
  let available = true, mode = "ok", connects = 0, disconnects = 0, duringRecovery: (() => Promise<void>) | undefined;
  const agent = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk; const input = JSON.parse(body || "{}");
    if (!available) { response.writeHead(503); response.end(JSON.stringify({ code: "VPN_AGENT_UNAVAILABLE" })); return; }
    let data: unknown = { id: input.id, state: states.get(input.id) ?? "disconnected" };
    if (request.url === "/health") data = { available: true };
    if (request.url === "/recover") {
      connects++;
      assert.equal(input.config.connectionIntent, undefined, "server-only intent is never supplied as helper configuration");
      if (mode === "fail") { response.writeHead(502); response.end(JSON.stringify({ code: "VPN_RUNTIME_FAILED" })); return; }
      if (duringRecovery) { const callback = duringRecovery; duringRecovery = undefined; await callback(); }
      states.set(input.id, "connected"); data = { id: input.id, state: "connected", routes: input.config.routes, protocol: input.config.protocol };
    }
    if (request.url === "/disconnect") { disconnects++; states.delete(input.id); data = { id: input.id, state: "disconnected" }; }
    response.end(JSON.stringify(data));
  });
  await new Promise<void>(resolve => agent.listen(process.env.VPN_CONTROL_SOCKET, resolve));
  const input = { name: "Persistent fixture", protocol: "wireguard", endpoint: "198.51.100.5", address: "10.70.0.2/32", privateKey: randomBytes(32).toString("base64"), publicKey: randomBytes(32).toString("base64"), routes: ["192.168.99.0/24"] };
  const get = async (id: string) => (await service.listVpn(actor)).profiles.find(p => p.id === id)!;
  const execute = (revision: string) => ({ intent: "execute", confirmed: true, revision });
  try {
    const profile = await service.saveVpn({ ...input, connectionIntent: "connected" }, actor);
    assert.equal(profile.desiredConnected, false, "creation cannot smuggle an auto-connect flag");
    await service.reconcileVpnConnections(); assert.equal(connects, 0);
    await service.operateVpn(profile.id, "connect", execute(profile.revision), actor); assert.equal((await get(profile.id)).desiredConnected, true); assert.equal(connects, 1);
    const persisted = await prisma.vpnConnection.findUniqueOrThrow({ where: { id: profile.id } }); assert.equal(JSON.parse(decryptSecret(persisted.configEncrypted)!).connectionIntent, "connected");
    states.clear(); await service.reconcileVpnConnections(); assert.equal(connects, 2, "a lost helper is rebuilt from encrypted persisted config");
    const before = await get(profile.id); await prisma.vpnConnection.update({ where: { id: profile.id }, data: { lastErrorCode: "VPN_RUNTIME_FAILED" } });
    assert.equal((await get(profile.id)).revision, before.revision, "background status must not invalidate manual disconnect");
    mode = "fail"; states.clear(); const now = Date.now(); await service.reconcileVpnConnections(now); const failedCount = connects;
    await service.reconcileVpnConnections(now + 1); assert.equal(connects, failedCount, "transient failure is paced, not retried every poll"); assert.equal((await get(profile.id)).desiredConnected, true);
    mode = "ok"; await service.reconcileVpnConnections(now + 6000); assert.equal((await get(profile.id)).runtime.state, "connected");
    const active = await get(profile.id); available = false;
    const result = await service.operateVpn(profile.id, "disconnect", execute(active.revision), actor); assert.equal(result.state, "unavailable");
    const stoppedRow = await prisma.vpnConnection.findUniqueOrThrow({ where: { id: profile.id } });
    assert.equal(JSON.parse(decryptSecret(stoppedRow.configEncrypted)!).connectionIntent, "disconnected");
    available = true; const countBeforeStop = connects; await service.reconcileVpnConnections(); assert.ok(disconnects > 0); assert.equal(connects, countBeforeStop); states.clear(); await service.reconcileVpnConnections(); assert.equal(connects, countBeforeStop, "manual disconnect survives helper loss");
    await service.operateVpn(profile.id, "connect", execute((await get(profile.id)).revision), actor);
    states.clear(); duringRecovery = async () => { await service.operateVpn(profile.id, "disconnect", execute((await get(profile.id)).revision), actor); };
    await service.reconcileVpnConnections(now + 999999); assert.equal((await get(profile.id)).desiredConnected, false); assert.equal(states.has(profile.id), false, "manual stop wins even while recovery was already in flight");
    // An existing encrypted intent also survives a fresh worker registry / application startup.
    const second = await service.saveVpn({ ...input, name: "Restart fixture", address: "10.71.0.2/32", routes: ["192.168.98.0/24"] }, actor);
    const row = await prisma.vpnConnection.findUniqueOrThrow({ where: { id: second.id } });
    await prisma.vpnConnection.update({ where: { id: second.id }, data: { configEncrypted: encryptSecret(JSON.stringify({ ...JSON.parse(decryptSecret(row.configEncrypted)!), connectionIntent: "connected" })) } });
    await service.reconcileVpnConnections(now + 999999); assert.equal((await get(second.id)).runtime.state, "connected");
    assert.equal((await get(profile.id)).runtime.state, "disconnected");
    const company = await prisma.company.create({ data: { ownerId: user.id, name: tag, code: tag } });
    await prisma.cameraDevice.create({ data: { ownerId: user.id, companyId: company.id, name: "Direct fixture", host: "192.168.98.50", connectionMode: "rtsp" } });
    states.delete(second.id); const beforeConflict = connects;
    await service.reconcileVpnConnections(now + 1999999); assert.equal(connects, beforeConflict, "automatic restoration revalidates direct-asset routing conflicts");
    assert.equal((await get(second.id)).lastErrorCode, "VPN_ASSET_ROUTE_CONFLICT"); assert.equal((await get(second.id)).desiredConnected, true);
    const blocked = await service.saveVpn({ name: "Auth fixture", protocol: "l2tp", endpoint: "198.51.100.6", routes: ["192.168.97.0/24"], username: "fixture", password: randomBytes(12).toString("hex"), ipsecPsk: randomBytes(12).toString("hex") }, actor);
    const blockedRow = await prisma.vpnConnection.findUniqueOrThrow({ where: { id: blocked.id } });
    await prisma.vpnConnection.update({ where: { id: blocked.id }, data: { configEncrypted: encryptSecret(JSON.stringify({ ...JSON.parse(decryptSecret(blockedRow.configEncrypted)!), connectionIntent: "connected" })), lastErrorCode: "VPN_PPP_AUTH_FAILED" } });
    const beforeBlocked = connects; await service.reconcileVpnConnections(now + 2999999); assert.equal(connects, beforeBlocked, "persisted authentication failure is not hammered after a worker restart"); assert.equal((await get(blocked.id)).recoveryBlocked, true);
    const audits = await prisma.auditLog.findMany({ where: { targetId: { in: [profile.id, second.id] } } }); assert.equal(JSON.stringify(audits).includes(input.privateKey), false);
  } finally { await new Promise<void>(resolve => agent.close(() => resolve())); await prisma.auditLog.deleteMany({ where: { OR: [{ actor: tag }, { actor: "system:vpn-recovery", metadata: { path: ["ownerId"], equals: user.id } }] } }); await prisma.appUser.delete({ where: { id: user.id } }); await shutdownDatabase(); await rm(dir, { recursive: true, force: true }); }
});
