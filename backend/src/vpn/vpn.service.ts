import { request } from "node:http";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Prisma, VpnConnection } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { encryptSecret, decryptSecret } from "../services/credential-crypto.service.js";
import { validateVpn, contains, VpnError, type VpnConfig } from "./vpn-validation.js";
import type { VpnRuntime } from "./vpn-agent.js";
import type { FastifyBaseLogger } from "fastify";
import { VpnRecoverySchedule } from "./vpn-recovery.js";

export type VpnActor = { id: string; username: string; role: string; scopeOwnerId?: string | null };
const owner = (actor: VpnActor) => actor.scopeOwnerId ?? actor.id;
const admin = (actor: VpnActor) => { if (actor.role !== "admin") throw new VpnError("VPN_ADMIN_REQUIRED", 403); };
export function vpnAgentCall<T>(path: string, payload: unknown = {}, socket = process.env.VPN_CONTROL_SOCKET ?? "/run/firewall-vpn/control.sock"): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = request({ socketPath: socket, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, timeout: path === "/health" ? 1500 : ["/status", "/route"].includes(path) ? 5000 : 85000 }, res => {
      let response = "";
      res.on("data", chunk => { response += chunk; if (response.length > 65536) req.destroy(); });
      res.on("end", () => {
        try { const value = JSON.parse(response); if ((res.statusCode ?? 500) >= 400) reject(new VpnError(/^VPN_[A-Z_]+$/.test(value.code) ? value.code : "VPN_RUNTIME_FAILED", res.statusCode)); else resolve(value); }
        catch { reject(new VpnError("VPN_AGENT_UNAVAILABLE", 503)); }
      });
    });
    req.once("timeout", () => req.destroy()); req.once("error", () => reject(new VpnError("VPN_AGENT_UNAVAILABLE", 503))); req.end(data);
  });
}
const metadata = (input: unknown) => input as Prisma.InputJsonValue;
async function audit(actor: VpnActor, action: string, targetId: string, data: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { actor: actor.username, action, targetType: "vpn", targetId, dryRun: false, approvalStatus: "approved", metadata: metadata({ ownerId: owner(actor), ...data }) } });
}
async function owned(id: string, actor: VpnActor) {
  const profile = await prisma.vpnConnection.findFirst({ where: { id, ownerId: owner(actor) } });
  if (!profile) throw new VpnError("VPN_NOT_FOUND", 404); return profile;
}
type StoredConfig = Record<string, unknown> & { connectionIntent?: "connected" | "disconnected" };
function stored(profile: VpnConnection): StoredConfig { try { return JSON.parse(decryptSecret(profile.configEncrypted) ?? "{}"); } catch { throw new VpnError("VPN_CREDENTIAL_UNAVAILABLE", 422); } }
const recovery = new VpnRecoverySchedule();
function safe(profile: VpnConnection) {
  const { configEncrypted, ...publicData } = profile; let desiredConnected = false;
  try { desiredConnected = stored(profile).connectionIntent === "connected"; } catch { /* Credentials stay private. */ }
  // Background health/retry timestamps must not invalidate a pending manual disconnect confirmation.
  return { ...publicData, desiredConnected, ...recovery.info(profile.id), revision: createHash("sha256").update(`${profile.id}:${configEncrypted}`).digest("hex") };
}
async function setIntent(profile: VpnConnection, connected: boolean) {
  const config = stored(profile), intent = connected ? "connected" : "disconnected";
  if (config.connectionIntent === intent) return profile;
  return prisma.vpnConnection.update({ where: { id: profile.id }, data: { configEncrypted: encryptSecret(JSON.stringify({ ...config, connectionIntent: intent })) } });
}
const activeOperations = new Set<string>();
const automaticOperations = new Set<string>();
async function assertAssetRoutes(profileId: string, routes: string[]) {
  const [cameras, devices, bindings] = await Promise.all([
    prisma.cameraDevice.findMany({ select: { host: true, vpnConnectionId: true } }),
    prisma.device.findMany({ where: { deletedAt: null }, select: { id: true, host: true } }),
    prisma.vpnDeviceBinding.findMany({ select: { deviceId: true, vpnConnectionId: true } })
  ]);
  const assigned = new Map(bindings.map(item => [item.deviceId, item.vpnConnectionId]));
  const conflicts = [...cameras.map(item => ({ host: item.host, assigned: item.vpnConnectionId })), ...devices.map(item => ({ host: item.host, assigned: assigned.get(item.id) ?? null }))];
  if (conflicts.some(item => item.assigned !== profileId && routes.some(route => { try { return contains(route, item.host); } catch { return false; } }))) throw new VpnError("VPN_ASSET_ROUTE_CONFLICT", 409);
}
export async function listVpn(actor: VpnActor) {
  const profiles = await prisma.vpnConnection.findMany({ where: { ownerId: owner(actor) }, orderBy: { createdAt: "desc" }, take: 32 });
  let available = false, l2tpReady: boolean | undefined, openvpnReady: boolean | undefined;
  try { const health = await vpnAgentCall<{ available: boolean; l2tpReady?: boolean; openvpnReady?: boolean }>("/health"); available = health.available; l2tpReady = health.l2tpReady; openvpnReady = health.openvpnReady; } catch { /* No privileged agent is a visible setup state, not a working VPN. */ }
  const items = await Promise.all(profiles.map(async profile => ({ ...safe(profile), runtime: available ? await vpnAgentCall<VpnRuntime>("/status", { id: profile.id }).catch(() => ({ id: profile.id, state: "unknown" })) : { id: profile.id, state: "unavailable" } })));
  return { available, splitOnly: true, l2tpReady, openvpnReady, profiles: items };
}
export async function saveVpn(input: Record<string, unknown>, actor: VpnActor, id?: string) {
  admin(actor);
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  if (!name) throw new VpnError("VPN_NAME_REQUIRED");
  const previous = id ? await owned(id, actor) : null;
  if (id && activeOperations.has(id)) throw new VpnError("VPN_OPERATION_BUSY", 409);
  if (id) activeOperations.add(id);
  try {
  if (previous) {
    if (stored(previous).connectionIntent === "connected") throw new VpnError("VPN_DISCONNECT_FIRST", 409);
    const runtime = await vpnAgentCall<VpnRuntime>("/status", { id });
    if (runtime.state !== "disconnected") throw new VpnError("VPN_DISCONNECT_FIRST", 409);
  } else if (await prisma.vpnConnection.count({ where: { ownerId: owner(actor) } }) >= 32) throw new VpnError("VPN_PROFILE_LIMIT", 409);
  let old: Record<string, unknown> = {};
  if (previous) { try { old = JSON.parse(decryptSecret(previous.configEncrypted) ?? "{}"); } catch { throw new VpnError("VPN_CREDENTIAL_UNAVAILABLE", 422); } }
  const merged = { ...old, ...input };
  for (const field of ["privateKey", "presharedKey", "password", "ipsecPsk", "openvpnProfile", "keyPassphrase"]) if (previous && input[field] === "") merged[field] = old[field];
  const config = validateVpn(merged);
  if (previous) {
    const bindings = await prisma.vpnDeviceBinding.findMany({ where: { vpnConnectionId: previous.id }, select: { deviceId: true } });
    const [devices, cameras] = await Promise.all([
      prisma.device.findMany({ where: { id: { in: bindings.map(binding => binding.deviceId) }, deletedAt: null }, select: { host: true } }),
      prisma.cameraDevice.findMany({ where: { vpnConnectionId: previous.id }, select: { host: true } })
    ]);
    if ([...devices, ...cameras].some(item => !config.routes.some(range => contains(range, item.host)))) throw new VpnError("VPN_BOUND_TARGET_OUTSIDE_ROUTES", 409);
  }
  const data = { name, protocol: config.protocol, endpoint: config.endpoint, endpointPort: config.endpointPort, routesJson: metadata(config.routes), configEncrypted: encryptSecret(JSON.stringify({ ...config, connectionIntent: "disconnected" })), lastErrorCode: null };
  const profile = previous ? await prisma.vpnConnection.update({ where: { id }, data }) : await prisma.vpnConnection.create({ data: { ...data, ownerId: owner(actor) } });
  await audit(actor, "vpn.profile_saved", profile.id, { protocol: config.protocol, routes: config.routes });
  return safe(profile);
  } finally { if (id) activeOperations.delete(id); }
}
export async function operateVpn(id: string, operation: "connect" | "disconnect", input: Record<string, unknown>, actor: VpnActor) {
  admin(actor); const profile = await owned(id, actor);
  if (input.intent !== "execute" || input.confirmed !== true) throw new VpnError("VPN_CONFIRM_REQUIRED");
  if (input.revision !== safe(profile).revision) throw new VpnError("VPN_PROFILE_CHANGED", 409);
  if (operation === "disconnect" && automaticOperations.has(id)) {
    await setIntent(profile, false); recovery.clear(id);
    await audit(actor, "vpn.disconnect_pending", id, { connectorInvoked: false, desiredConnected: false });
    return { id, state: "disconnecting", protocol: profile.protocol, routes: profile.routesJson as string[] };
  }
  if (activeOperations.has(id)) throw new VpnError("VPN_OPERATION_BUSY", 409);
  activeOperations.add(id);
  try {
    await audit(actor, `vpn.${operation}_requested`, id, { protocol: profile.protocol, routes: profile.routesJson, policyGuard: "split_routes_only" });
    let config: VpnConfig | undefined;
    if (operation === "connect") { try { config = validateVpn(JSON.parse(decryptSecret(profile.configEncrypted) ?? "{}")); } catch (error) { throw error instanceof VpnError ? error : new VpnError("VPN_CREDENTIAL_UNAVAILABLE", 422); } await assertAssetRoutes(id, config.routes); }
    // Commit user intent before touching the helper. It survives process/host restarts and failed disconnect RPCs.
    await setIntent(profile, operation === "connect"); recovery.clear(id);
    let runtime: VpnRuntime;
    try { runtime = await vpnAgentCall<VpnRuntime>(operation === "connect" ? "/recover" : "/disconnect", { id, ...(config ? { config } : {}) }); }
    catch (error) {
      if (operation !== "disconnect" || !(error instanceof VpnError) || error.code !== "VPN_AGENT_UNAVAILABLE") throw error;
      await audit(actor, "vpn.disconnect_pending", id, { connectorInvoked: false, desiredConnected: false });
      return { id, state: "unavailable", protocol: profile.protocol, routes: profile.routesJson as string[], code: error.code };
    }
    await prisma.vpnConnection.update({ where: { id }, data: { lastErrorCode: null, lastOperationAt: new Date() } });
    await audit(actor, `vpn.${operation}_result`, id, { connectorInvoked: true, state: runtime.state });
    return runtime;
  } catch (error) {
    const code = error instanceof VpnError ? error.code : "VPN_RUNTIME_FAILED";
    if (operation === "connect") recovery.failed(id, code);
    await prisma.vpnConnection.update({ where: { id }, data: { lastErrorCode: code, lastOperationAt: new Date() } });
    await audit(actor, `vpn.${operation}_failed`, id, { code }); throw error;
  } finally { activeOperations.delete(id); }
}
export async function testVpn(id: string, input: Record<string, unknown>, actor: VpnActor) {
  const profile = await owned(id, actor), target = String(input.target ?? "");
  if (!(profile.routesJson as string[]).some(route => contains(route, target))) throw new VpnError("VPN_TEST_TARGET_INVALID");
  const result = await vpnAgentCall("/test", { id, target, port: Number(input.port ?? 80) });
  await audit(actor, "vpn.target_tested", id, { target, port: input.port ?? 80 }); return result;
}
export async function assertVpnTarget(profileId: unknown, host: string, ownerId?: string, requireConnected = false) {
  if (profileId === undefined || profileId === null || profileId === "") {
    if (isIP(host) === 4) {
      const route = await vpnAgentCall<{ throughTunnel: boolean }>("/route", { target: host }).catch(() => null);
      if (route?.throughTunnel) throw new VpnError("VPN_TARGET_USES_TUNNEL", 409);
    }
    return null;
  }
  if (typeof profileId !== "string" || !ownerId) throw new VpnError("VPN_NOT_FOUND", 404);
  const profile = await prisma.vpnConnection.findFirst({ where: { id: profileId, ownerId }, select: { id: true, routesJson: true } });
  if (!profile) throw new VpnError("VPN_NOT_FOUND", 404);
  if (!(profile.routesJson as string[]).some(route => { try { return contains(route, host); } catch { return false; } })) throw new VpnError("VPN_TARGET_OUTSIDE_ROUTES", 400);
  const route = await vpnAgentCall<{ throughTunnel: boolean; profileId: string | null }>("/route", { target: host }).catch(() => null);
  if (route?.throughTunnel && route.profileId !== profile.id) throw new VpnError("VPN_ROUTE_MISMATCH", 409);
  if (requireConnected) {
    const runtime = await vpnAgentCall<VpnRuntime>("/status", { id: profile.id });
    if (runtime.state !== "connected") throw new VpnError("VPN_CONNECT_FIRST", 409);
    if (route?.profileId !== profile.id) throw new VpnError("VPN_ROUTE_NOT_ACTIVE", 409);
  }
  return profile.id;
}
export async function deleteVpn(id: string, actor: VpnActor) {
  admin(actor); const profile = await owned(id, actor);
  if (stored(profile).connectionIntent === "connected") throw new VpnError("VPN_DISCONNECT_FIRST", 409);
  if (activeOperations.has(id)) throw new VpnError("VPN_OPERATION_BUSY", 409);
  activeOperations.add(id);
  try {
  const runtime = await vpnAgentCall<VpnRuntime>("/status", { id });
  if (runtime.state !== "disconnected") throw new VpnError("VPN_DISCONNECT_FIRST", 409);
  const bindings = await prisma.vpnDeviceBinding.findMany({ where: { vpnConnectionId: id }, select: { deviceId: true } });
  const linked = await prisma.device.count({ where: { id: { in: bindings.map(binding => binding.deviceId) }, deletedAt: null } }) + await prisma.cameraDevice.count({ where: { vpnConnectionId: id } });
  if (linked) throw new VpnError("VPN_ASSETS_BOUND", 409);
  await prisma.vpnConnection.delete({ where: { id } }); recovery.clear(id); await audit(actor, "vpn.profile_removed", id, {}); return { deleted: true };
  } finally { activeOperations.delete(id); }
}

let supervisorTimer: ReturnType<typeof setInterval> | undefined, supervisorRun: Promise<unknown> | undefined, cursor: string | undefined;
/** Re-read encrypted persisted intent on every cycle; no browser tab or volatile helper map is authoritative. */
export async function reconcileVpnConnections(now = Date.now()) {
  const health = await vpnAgentCall<{ available: boolean }>("/health").catch(() => null);
  if (!health?.available) return;
  const profiles = await prisma.vpnConnection.findMany({ where: { owner: { isActive: true } }, orderBy: { id: "asc" }, take: 64,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  cursor = profiles.length === 64 ? profiles.at(-1)!.id : undefined;
  // A bounded scan makes progress across workspaces without retaining keys/configs in a retry registry.
  for (const profile of profiles) {
    if (activeOperations.has(profile.id)) continue;
    activeOperations.add(profile.id); automaticOperations.add(profile.id);
    const actor = { id: profile.ownerId, username: "system:vpn-recovery", role: "admin" };
    try {
      const raw = stored(profile), runtime = await vpnAgentCall<VpnRuntime>("/status", { id: profile.id });
      if (raw.connectionIntent === undefined) {
        // Upgrade only proven pre-existing managed tunnels; never activate saved/disconnected profiles.
        if (["connected", "waiting", "stale"].includes(runtime.state)) await setIntent(profile, true);
        continue;
      }
      if (raw.connectionIntent !== "connected") {
        recovery.clear(profile.id);
        if (runtime.state !== "disconnected") { await vpnAgentCall("/disconnect", { id: profile.id }); await audit(actor, "vpn.manual_disconnect_completed", profile.id, { connectorInvoked: true }); }
        if (profile.lastErrorCode) await prisma.vpnConnection.update({ where: { id: profile.id }, data: { lastErrorCode: null } });
        continue;
      }
      if (runtime.state === "connected") {
        recovery.clear(profile.id);
        if (profile.lastErrorCode) { await prisma.vpnConnection.update({ where: { id: profile.id }, data: { lastErrorCode: null } }); await audit(actor, "vpn.recovered", profile.id, { connectorInvoked: true }); }
        continue;
      }
      if (!recovery.due(profile.id, now)) continue;
      const authFailure = [runtime.code, profile.lastErrorCode].find(code=>["VPN_PPP_AUTH_FAILED","VPN_OPENVPN_AUTH_FAILED"].includes(code??""));
      if (authFailure) throw new VpnError(authFailure,401);
      const config = validateVpn(raw); await assertAssetRoutes(profile.id, config.routes);
      const current = await prisma.vpnConnection.findUnique({ where: { id: profile.id } });
      if (!current || stored(current).connectionIntent !== "connected") continue;
      const result = await vpnAgentCall<VpnRuntime>("/recover", { id: profile.id, config });
      const after = await prisma.vpnConnection.findUnique({ where: { id: profile.id } });
      if (after && stored(after).connectionIntent !== "connected") { await vpnAgentCall("/disconnect", { id: profile.id }); await audit(actor, "vpn.manual_disconnect_completed", profile.id, { connectorInvoked: true }); continue; }
      if (result.state === "connected") recovery.clear(profile.id); else recovery.failed(profile.id, result.code, now);
      if (profile.lastErrorCode !== (result.code ?? null) || runtime.state === "disconnected") {
        await prisma.vpnConnection.update({ where: { id: profile.id }, data: { lastErrorCode: result.code ?? null } });
        await audit(actor, "vpn.reconnect_result", profile.id, { connectorInvoked: true, state: result.state });
      }
    } catch (error) {
      const code = error instanceof VpnError ? error.code : "VPN_RUNTIME_FAILED";
      recovery.failed(profile.id, code, now);
      if (profile.lastErrorCode !== code) { await prisma.vpnConnection.update({ where: { id: profile.id }, data: { lastErrorCode: code } }); await audit(actor, "vpn.reconnect_delayed", profile.id, { code }); }
    } finally { activeOperations.delete(profile.id); automaticOperations.delete(profile.id); }
  }
}
export function startVpnSupervisor(logger: FastifyBaseLogger) {
  if (supervisorTimer) return;
  const tick = () => { if (!supervisorRun) supervisorRun = reconcileVpnConnections().catch(() => logger.warn({ code: "VPN_RECOVERY_UNAVAILABLE" }, "VPN recovery deferred")).finally(() => { supervisorRun = undefined; }); };
  tick(); supervisorTimer = setInterval(tick, 15000); supervisorTimer.unref();
}
export async function stopVpnSupervisor() { clearInterval(supervisorTimer); supervisorTimer = undefined; await supervisorRun; }
