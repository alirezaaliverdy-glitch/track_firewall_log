import { createServer, type IncomingMessage } from "node:http";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { lookup } from "node:dns/promises";
import { mkdir, chmod, chown, unlink, writeFile, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connect as tcpConnect } from "node:net";
import { fileURLToPath } from "node:url";
import { contains, overlaps, validateVpn, wireguardConfig, l2tpConfigs, ipv4, VpnError, type VpnConfig } from "./vpn-validation.js";

const execute = promisify(execFile);
export type VpnRuntime = { id: string; state: string; protocol: string; routes: string[]; address?: string; handshakeAt?: string; rxBytes?: number; txBytes?: number; code?: string };
export async function l2tpKernelReady() {
  try { if (!(await stat("/dev/ppp")).isCharacterDevice()) return false; } catch { return false; }
  const disciplines = await readFile("/proc/tty/ldiscs", "utf8").catch(() => "");
  if (/\bppp\s+3\b/i.test(disciplines)) return true;
  try { await stat("/proc/net/pppol2tp"); return true; } catch { return false; }
}
type Tunnel = { id: string; iface: string; config: VpnConfig; endpointIp: string; dir: string; processes: ChildProcess[]; failed?: string; controlSent?: boolean; diagnosticCodes: string[] };
export class VpnAgent {
  tunnels = new Map<string, Tunnel>();
  private guardedRoutes = new Map<string, string[]>();
  constructor(private root = "/run/vpn-state", private run = async (file: string, args: string[], timeout = 10000) => {
    try { return (await execute(file, args, { timeout, maxBuffer: 256 * 1024 })).stdout; } catch { throw new VpnError("VPN_COMMAND_FAILED", 502); }
  }) {}
  // iproute2 renders protocol186 as "bgp" without -N; numeric mode also renders unreachable as type7.
  async routes() { return JSON.parse(await this.run("ip", ["-j", "-N", "-4", "route", "show", "table", "main"])) as Array<{ dst?: string; dev?: string; protocol?: string; gateway?: string; type?: string; metric?: number }>; }
  async defaults() { return JSON.stringify((await this.routes()).filter(route => route.dst === "default")); }
  async preflight(config: VpnConfig, endpointIp: string, id?: string) {
    if (config.routes.some(route => contains(route, endpointIp))) throw new VpnError("VPN_ENDPOINT_IN_ROUTE");
    const current = await this.routes();
    if (config.address && current.some(route => route.dst && route.dst !== "default" && contains(route.dst.includes("/") ? route.dst : `${route.dst}/32`, config.address!.split("/")[0]))) throw new VpnError("VPN_NETWORK_CONFLICT", 409);
    if (config.routes.some(range => current.some(route => route.dst && route.dst !== "default" && route.dev && !route.dev.startsWith("fv") && overlaps(range, route.dst.includes("/") ? route.dst : `${route.dst}/32`)))) throw new VpnError("VPN_NETWORK_CONFLICT", 409);
    if ([...this.tunnels.values()].some(t => config.routes.some(range => t.config.routes.some(other => overlaps(range, other))))) throw new VpnError("VPN_ROUTE_OVERLAP", 409);
    if ([...this.guardedRoutes].some(([key, routes]) => key !== id && config.routes.some(range => routes.some(other => overlaps(range, other))))) throw new VpnError("VPN_ROUTE_OVERLAP", 409);
    if (config.address && [...this.tunnels.values()].some(t => t.config.address === config.address)) throw new VpnError("VPN_ADDRESS_CONFLICT", 409);
    if (this.tunnels.size >= 4 || config.protocol === "l2tp" && [...this.tunnels.values()].some(t => t.config.protocol === "l2tp")) throw new VpnError("VPN_CAPACITY", 409);
    if (!this.guardedRoutes.has(id ?? "") && this.guardedRoutes.size >= 4) throw new VpnError("VPN_CAPACITY", 409);
    if (config.protocol === "l2tp") { try { if (!(await stat("/dev/ppp")).isCharacterDevice()) throw new Error(); } catch { throw new VpnError("VPN_PPP_UNAVAILABLE", 503); }
      if (!await l2tpKernelReady()) throw new VpnError("VPN_PPP_KERNEL_REQUIRED", 503);
    }
  }
  async connect(id: string, raw: Record<string, unknown>, retainGuardsOnFailure = false) {
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new VpnError("VPN_ID_INVALID");
    if (this.tunnels.has(id)) return this.status(id);
    const config = validateVpn(raw);
    const endpointIp = (await lookup(config.endpoint, { family: 4 })).address;
    validateVpn({ ...config, endpoint: endpointIp });
    await this.preflight(config, endpointIp, id);
    const originalDefault = await this.defaults(), iface = `fv${createHash("sha256").update(id).digest("hex").slice(0, 10)}`;
    const tunnel: Tunnel = { id, iface, config, endpointIp, dir: `${this.root}/${iface}`, processes: [], diagnosticCodes: [] };
    await mkdir(tunnel.dir, { recursive: true, mode: 0o700 });
    this.tunnels.set(id, tunnel);
    this.guardedRoutes.set(id, config.routes);
    try {
      const current = await this.routes();
      for (const range of config.routes) if (!current.some(route => route.dst === range && String(route.protocol) === "186" && ["unreachable", "7"].includes(String(route.type)) && route.metric === 42760)) await this.run("ip", ["route", "add", "unreachable", range, "metric", "42760", "proto", "186"]);
      if (config.protocol === "wireguard") {
        await writeFile(`${tunnel.dir}/wg.conf`, wireguardConfig(config, endpointIp), { mode: 0o600 });
        try { await this.run("ip", ["link", "add", iface, "type", "wireguard"]); } catch { throw new VpnError("VPN_WIREGUARD_UNAVAILABLE", 503); }
        await this.run("wg", ["setconf", iface, `${tunnel.dir}/wg.conf`]);
        await unlink(`${tunnel.dir}/wg.conf`);
        await this.run("ip", ["address", "add", config.address!, "dev", iface, "noprefixroute"]);
        await this.run("ip", ["link", "set", "dev", iface, "mtu", String(config.mtu ?? 1420), "up"]);
      } else await this.startL2tp(tunnel);
      for (const range of config.routes) await this.run("ip", ["route", "add", range, "dev", iface, "metric", "50", "proto", "186"]);
      if (await this.defaults() !== originalDefault) throw new VpnError("VPN_DEFAULT_ROUTE_CHANGED", 500);
      return await this.status(id);
    } catch (error) {
      if (config.protocol === "l2tp" && error instanceof VpnError) {
        const rules = await this.run("iptables", ["-L", iface, "-v", "-x", "-n"]).catch(() => "");
        const protectedPackets = Number(/^\s*(\d+)\s+\d+\s+RETURN/m.exec(rules)?.[1] ?? 0), rejectedPackets = Number(/^\s*(\d+)\s+\d+\s+REJECT/m.exec(rules)?.[1] ?? 0);
        if (rejectedPackets > 0 && protectedPackets === 0) { error.code = "VPN_IPSEC_POLICY_CONFLICT"; error.message = error.code; }
        Object.assign(error, { diagnostics: { codes: tunnel.diagnosticCodes, controlSent: tunnel.controlSent ?? false, processes: tunnel.processes.map(child => ({ alive: child.exitCode === null, exitCode: child.exitCode })), protectedPackets, rejectedPackets } });
      }
      await this.disconnect(id, retainGuardsOnFailure); throw error;
    }
  }
  private daemon(t: Tunnel, file: string, args: string[]) {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
    const inspect = (chunk: Buffer) => {
      const message = String(chunk);
      if (/unrecognized option|unknown option/i.test(message)) t.failed = "VPN_PPP_CONFIG_FAILED";
      else if (/authentication failed|CHAP authentication failure/i.test(message)) t.failed = "VPN_PPP_AUTH_FAILED";
      else if (/couldn.t open.*\/dev\/ppp|couldn.t create (?:new )?ppp unit|couldn.t set tty.*PPP/i.test(message)) t.failed = "VPN_PPP_UNAVAILABLE";
      for (const [code, regex] of [["L2TP_TIMEOUT", /Maximum retries|Unable to establish|Connection refused/i], ["L2TP_CONNECTED", /Connection established/i], ["PPP_STARTED", /start_pppd|Using interface/i], ["CONTROL_ERROR", /control.*error|Unknown tunnel|No such tunnel/i]] as const) if (regex.test(message) && !t.diagnosticCodes.includes(code)) t.diagnosticCodes.push(code);
      // Discard all raw daemon output; never persist credentials or protocol logs.
    };
    child.stderr?.on("data", inspect); child.stdout?.on("data", inspect);
    child.on("error", () => { t.failed = "VPN_DAEMON_FAILED"; });
    t.processes.push(child); return child;
  }
  private async startL2tp(t: Tunnel) {
    const configs = l2tpConfigs(t.config, t.endpointIp, t.iface, t.dir);
    await writeFile("/etc/strongswan.conf", "charon { install_routes = no\n plugins { include strongswan.d/charon/*.conf }\n}\ninclude strongswan.d/*.conf\n", { mode: 0o600 });
    await writeFile(`${t.dir}/ipsec.conf`, configs.ipsec, { mode: 0o600 });
    await writeFile("/etc/ipsec.secrets", `include ${t.dir}/ipsec.secrets\n`, { mode: 0o600 });
    await writeFile(`${t.dir}/ipsec.secrets`, configs.ipsecSecrets, { mode: 0o600 });
    await writeFile(`${t.dir}/ppp.options`, configs.ppp, { mode: 0o600 });
    await writeFile(`${t.dir}/xl2tpd.conf`, configs.l2tp, { mode: 0o600 });
    // Never send plaintext L2TP if the IPsec SA disappears. Only this endpoint is affected.
    await this.run("iptables", ["-N", t.iface]);
    await this.run("iptables", ["-A", t.iface, "-m", "policy", "--dir", "out", "--pol", "ipsec", "-j", "RETURN"]);
    await this.run("iptables", ["-A", t.iface, "-j", "REJECT"]);
    await this.run("iptables", ["-I", "OUTPUT", "1", "-d", t.endpointIp, "-p", "udp", "--dport", "1701", "-j", t.iface]);
    this.daemon(t, "ipsec", ["start", "--nofork", "--conf", `${t.dir}/ipsec.conf`]);
    await new Promise(resolve => setTimeout(resolve, 1500));
    try { await this.run("ipsec", ["up", t.iface], 35000); } catch { throw new VpnError("VPN_IPSEC_FAILED", 502); }
    const sa = await this.run("ipsec", ["status", t.iface]);
    if (!sa.includes("INSTALLED") || !sa.includes("TRANSPORT")) throw new VpnError("VPN_IPSEC_FAILED", 502);
    this.daemon(t, "xl2tpd", ["-D", "-c", `${t.dir}/xl2tpd.conf`, "-C", `${t.dir}/control`, "-p", `${t.dir}/xl2tpd.pid`]);
    let requested = false;
    for (let i = 0; i < 30; i++) {
      if (t.failed) throw new VpnError(t.failed, 502);
      try { if (!requested && (await stat(`${t.dir}/control`)).isFIFO()) { await writeFile(`${t.dir}/control`, "c appvpn\n"); requested = true; t.controlSent = true; }
        const addresses = JSON.parse(await this.run("ip", ["-j", "-4", "address", "show", "dev", t.iface]));
        if (addresses[0]?.addr_info?.some((a: { local: string }) => a.local)) return;
      } catch { /* Wait for PPP negotiation, never infer a connected tunnel. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new VpnError(t.failed ?? "VPN_PPP_FAILED", 502);
  }
  async status(id: string): Promise<VpnRuntime> {
    const t = this.tunnels.get(id);
    if (!t) return { id, state: this.guardedRoutes.has(id) ? "error" : "disconnected", protocol: "", routes: this.guardedRoutes.get(id) ?? [], ...(this.guardedRoutes.has(id) ? { code: "VPN_RECONNECT_PENDING" } : {}) };
    let state = "waiting", handshakeAt: string | undefined, rxBytes = 0, txBytes = 0;
    try {
      if (t.config.protocol === "wireguard") {
        const seconds = Number((await this.run("wg", ["show", t.iface, "latest-handshakes"])).trim().split(/\s+/)[1]);
        if (seconds > 0) { handshakeAt = new Date(seconds * 1000).toISOString(); state = Date.now() - seconds * 1000 < 180000 ? "connected" : "stale"; }
        const transfer = (await this.run("wg", ["show", t.iface, "transfer"])).trim().split(/\s+/); rxBytes = Number(transfer[1]) || 0; txBytes = Number(transfer[2]) || 0;
      } else {
        const address = JSON.parse(await this.run("ip", ["-j", "-4", "address", "show", "dev", t.iface]));
        const sa = await this.run("ipsec", ["status", t.iface]);
        state = address[0]?.addr_info?.length && sa.includes("INSTALLED") ? "connected" : "error";
        // A status read must never tear down PPP/IPsec. The explicit recovery path owns restarts.
        for (const [key, filename] of [["rx", "rx_bytes"], ["tx", "tx_bytes"]]) { const n = Number(await readFile(`/sys/class/net/${t.iface}/statistics/${filename}`, "utf8").catch(() => "0")); if (key === "rx") rxBytes = n; else txBytes = n; }
      }
      if (t.failed) state = "error";
    } catch { state = "error"; }
    return { id, protocol: t.config.protocol, routes: t.config.routes, state, handshakeAt, rxBytes, txBytes, code: t.failed };
  }
  async recover(id: string, raw: Record<string, unknown>) {
    const config = validateVpn(raw), t = this.tunnels.get(id);
    if (!t) return this.connect(id, config as unknown as Record<string, unknown>, true);
    if (JSON.stringify(config) !== JSON.stringify(t.config)) throw new VpnError("VPN_PROFILE_CHANGED", 409);
    const status = await this.status(id); if (status.state === "connected") return status;
    if (status.code === "VPN_PPP_AUTH_FAILED") throw new VpnError(status.code, 401);
    if (config.protocol === "wireguard" && ["waiting", "stale"].includes(status.state)) {
      // WireGuard recovers transport loss itself. Refresh DNS without destroying the live interface/keys/routes.
      const endpointIp = (await lookup(config.endpoint, { family: 4 })).address;
      validateVpn({ ...config, endpoint: endpointIp });
      if (config.routes.some(range => contains(range, endpointIp))) throw new VpnError("VPN_ENDPOINT_IN_ROUTE");
      await this.run("wg", ["set", t.iface, "peer", config.publicKey!, "endpoint", `${endpointIp}:${config.endpointPort}`, "persistent-keepalive", "25"]);
      await this.run("ip", ["link", "set", "dev", t.iface, "up"]); t.endpointIp = endpointIp;
      return this.status(id);
    }
    // PPP exit / lost interface: keep owned blackhole routes throughout restart, never change the default route.
    await this.disconnect(id, true);
    return this.connect(id, config as unknown as Record<string, unknown>, true);
  }
  async disconnect(id: string, preserveGuards = false) {
    const t = this.tunnels.get(id);
    if (!t) {
      if (!preserveGuards) { for (const range of this.guardedRoutes.get(id) ?? []) await this.run("ip", ["route", "del", "unreachable", range, "metric", "42760", "proto", "186"]).catch(() => ""); this.guardedRoutes.delete(id); }
      return { id, state: "disconnected" };
    }
    for (const child of t.processes) child.kill("SIGTERM");
    if (t.config.protocol === "l2tp") {
      await this.run("ipsec", ["down", t.iface]).catch(() => "");
      await this.run("ipsec", ["stop"]).catch(() => "");
      // xl2tpd can spawn PPP children; terminate only this managed named link.
      await this.run("pkill", ["-f", `${t.dir}/ppp.options`]).catch(() => "");
      await this.run("iptables", ["-D", "OUTPUT", "-d", t.endpointIp, "-p", "udp", "--dport", "1701", "-j", t.iface]).catch(() => "");
      await this.run("iptables", ["-F", t.iface]).catch(() => "");
      await this.run("iptables", ["-X", t.iface]).catch(() => "");
      await writeFile("/etc/ipsec.secrets", "", { mode: 0o600 });
    }
    await this.run("ip", ["link", "delete", t.iface]).catch(() => "");
    for (const range of t.config.routes) {
      await this.run("ip", ["route", "del", range, "dev", t.iface, "metric", "50", "proto", "186"]).catch(() => "");
      if (!preserveGuards) await this.run("ip", ["route", "del", "unreachable", range, "metric", "42760", "proto", "186"]).catch(() => "");
    }
    await rm(t.dir, { recursive: true, force: true }); this.tunnels.delete(id); if (!preserveGuards) this.guardedRoutes.delete(id);
    return { id, state: "disconnected" };
  }
  async test(id: string, target: string, port: number) {
    const t = this.tunnels.get(id);
    if (!t || !t.config.routes.some(range => contains(range, target))) throw new VpnError("VPN_TEST_TARGET_INVALID");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new VpnError("VPN_PORT_INVALID");
    const route = JSON.parse(await this.run("ip", ["-j", "route", "get", target]));
    if (route[0]?.dev !== t.iface) throw new VpnError("VPN_ROUTE_NOT_ACTIVE", 409);
    const reachable = await new Promise<boolean>(resolve => { const socket = tcpConnect({ host: target, port }); const finish = (result: boolean) => { socket.destroy(); resolve(result); }; socket.setTimeout(4000); socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.once("timeout", () => finish(false)); });
    return { target, port, reachable, throughTunnel: true, checkedAt: new Date().toISOString() };
  }
  async routeTarget(target: string) {
    ipv4(target);
    let route: Array<{ dev?: string }>;
    try { route = JSON.parse(await this.run("ip", ["-j", "-4", "route", "get", target])); }
    catch { throw new VpnError("VPN_ROUTE_UNAVAILABLE", 409); }
    const tunnel = [...this.tunnels.values()].find(item => item.iface === route[0]?.dev);
    return { throughTunnel: Boolean(tunnel), profileId: tunnel?.id ?? null };
  }
}
async function body(request: IncomingMessage) {
  let input = ""; for await (const chunk of request) { input += chunk; if (input.length > 16384) throw new VpnError("VPN_REQUEST_TOO_LARGE"); }
  return JSON.parse(input || "{}");
}
export async function startVpnAgent() {
  const dir = process.env.VPN_SOCKET_DIR ?? "/run/firewall-vpn", socket = `${dir}/control.sock`, agent = new VpnAgent();
  await mkdir(dir, { recursive: true }); await chown(dir, 1000, 1000); await chmod(dir, 0o700); await unlink(socket).catch(() => undefined);
  const staleRoutes = await agent.routes();
  for (const route of staleRoutes) if (String(route.protocol) === "186" && route.dst && route.dst !== "default" &&
    (/^fv[0-9a-f]{10}$/.test(route.dev ?? "") || ["unreachable", "7"].includes(String(route.type)) && route.metric === 42760)) {
    await execute("ip", ["route", "del", ...(["unreachable", "7"].includes(String(route.type)) ? ["unreachable"] : []), route.dst, "proto", "186", ...(route.metric !== undefined ? ["metric", String(route.metric)] : []), ...(route.dev ? ["dev", route.dev] : [])]).catch(() => undefined);
  }
  const links = JSON.parse((await execute("ip", ["-j", "link", "show"])).stdout) as Array<{ ifname: string }>;
  for (const link of links) if (/^fv[0-9a-f]{10}$/.test(link.ifname)) await execute("ip", ["link", "delete", link.ifname]).catch(() => undefined);
  let queue: Promise<unknown> = Promise.resolve();
  const server = createServer(async (request, reply) => {
    const task = async () => {
      try {
        const data = await body(request); let result: unknown;
        if (request.url === "/health") result = { available: true, splitOnly: true, protocols: ["wireguard", "l2tp"], l2tpReady: await l2tpKernelReady() };
        else if (request.url === "/status") result = await agent.status(String(data.id));
        else if (request.url === "/connect") result = await agent.connect(String(data.id), data.config);
        else if (request.url === "/recover") result = await agent.recover(String(data.id), data.config);
        else if (request.url === "/disconnect") result = await agent.disconnect(String(data.id));
        else if (request.url === "/test") result = await agent.test(String(data.id), String(data.target), Number(data.port));
        else if (request.url === "/route") result = await agent.routeTarget(String(data.target));
        else throw new VpnError("VPN_REQUEST_INVALID");
        reply.setHeader("Content-Type", "application/json"); reply.end(JSON.stringify(result));
      } catch (error) { reply.statusCode = error instanceof VpnError ? error.statusCode : 502; reply.end(JSON.stringify({ code: error instanceof VpnError ? error.code : "VPN_RUNTIME_FAILED" })); }
    };
    // Keep health/status available during a long PPP negotiation; reads are now side-effect free.
    if (["/connect", "/recover", "/disconnect"].includes(request.url ?? "")) { queue = queue.then(task, task); await queue; }
    else await task();
  });
  server.requestTimeout = 5000;
  await new Promise<void>(resolve => server.listen(socket, resolve)); await chmod(socket, 0o600); await chown(socket, 1000, 1000);
  const monitor = setInterval(() => { queue = queue.then(async () => { for (const id of agent.tunnels.keys()) await agent.status(id); }).catch(() => undefined); }, 15000); monitor.unref();
  const stop = async () => { clearInterval(monitor); server.close(); await queue; for (const id of agent.tunnels.keys()) await agent.disconnect(id); await unlink(socket).catch(() => undefined); process.exit(0); };
  process.once("SIGTERM", () => void stop()); process.once("SIGINT", () => void stop());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) void startVpnAgent().catch(() => { process.stderr.write("VPN agent failed to start\n"); process.exit(1); });
