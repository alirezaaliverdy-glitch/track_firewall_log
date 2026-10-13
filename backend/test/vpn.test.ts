import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateVpn, contains, overlaps, wireguardConfig, l2tpConfigs, VpnError } from "../src/vpn/vpn-validation.js";
import { VpnAgent } from "../src/vpn/vpn-agent.js";
const wg = () => ({ protocol: "wireguard", endpoint: "198.51.100.2", endpointPort: 51820, address: "10.70.0.2/24", privateKey: randomBytes(32).toString("base64"), publicKey: randomBytes(32).toString("base64"), routes: ["192.168.18.0/24"] });
test("VPN permits private split routes only and rejects public/default, malformed keys and route hijacking", () => {
  const config = validateVpn(wg()); assert.equal(config.address, "10.70.0.2/32");
  assert.equal(validateVpn({ ...wg(), mtu: 1380 }).mtu, 1380);
  assert.throws(() => validateVpn({ ...wg(), mtu: 9000 }), /VPN_MTU_INVALID/);
  for (const range of ["0.0.0.0/0", "::/0", "8.8.8.0/24", "10.0.0.0/8", "192.168.0.0/15", "192.168.18.256/32"]) assert.throws(() => validateVpn({ ...wg(), routes: [range] }), VpnError);
  assert.throws(() => validateVpn({ ...wg(), routes: ["192.168.18.0/24", "192.168.18.50/32"] }), /VPN_ROUTE_OVERLAP/);
  assert.throws(() => validateVpn({ ...wg(), endpoint: "192.168.18.50" }), /VPN_ENDPOINT_IN_ROUTE/);
  assert.throws(() => validateVpn({ ...wg(), privateKey: "command\nPostUp=anything" }), /VPN_KEY_INVALID/);
  assert.equal(contains("192.168.18.0/24", "192.168.18.50"), true); assert.equal(overlaps("192.168.18.0/24", "192.168.19.0/24"), false);
});
test("generated VPN configuration never installs a default route, DNS or user hooks; L2TP requires IPsec", () => {
  const config = validateVpn(wg()), text = wireguardConfig(config, config.endpoint);
  assert.ok(!/PostUp|PreUp|DNS|0\.0\.0\.0\/0/.test(text)); assert.match(text, /AllowedIPs = 192\.168\.18\.0\/24/);
  const l2tp = validateVpn({ protocol: "l2tp", endpoint: "vpn.example.com", routes: config.routes, username: 'test"user', password: randomBytes(8).toString("hex"), ipsecPsk: randomBytes(16).toString("hex") });
  const parts = l2tpConfigs(l2tp, "198.51.100.2", "fv0123456789", "/run/vpn-state/fv0123456789");
  assert.match(parts.ppp, /\nnodefaultroute\n/); assert.ok(!parts.ppp.includes("usepeerdns")); assert.match(parts.ipsec, /type=transport/); assert.match(parts.ipsec, /authby=secret/);
  assert.throws(() => validateVpn({ ...l2tp, ipsecPsk: "" }), /VPN_CREDENTIAL_INVALID/);
});
test("agent preserves the actual default route, uses only exact split routes, detects conflicts and removes owned routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpn-agent-fixture-")); const calls: Array<[string, string[]]> = [];
  const run = async (file: string, args: string[]) => { calls.push([file, args]);
    if (file === "ip" && args.includes("main")) return JSON.stringify([{ dst: "default", gateway: "172.28.0.1", dev: "eth0" }, { dst: "172.28.0.0/16", dev: "eth0" }]);
    if (file === "wg" && args.includes("latest-handshakes")) return `fixture\t${Math.floor(Date.now() / 1000)}\n`;
    if (file === "wg" && args.includes("transfer")) return "fixture\t1024\t2048\n";
    return "";
  };
  const agent = new VpnAgent(root, run);
  try {
    const result = await agent.connect("fixture-profile", wg()); assert.equal(result.state, "connected"); assert.equal(result.rxBytes, 1024);
    assert.ok(calls.some(([file, args]) => file === "ip" && args.join(" ").includes("route add 192.168.18.0/24 dev fv")));
    assert.ok(!calls.some(([file, args]) => file === "ip" && args.includes("default") || args.includes("0.0.0.0/0")));
    await assert.rejects(agent.connect("conflict-profile", { ...wg(), routes: ["172.28.5.0/24"] }), /VPN_NETWORK_CONFLICT/);
    await assert.rejects(agent.connect("overlap-profile", wg()), /VPN_ROUTE_OVERLAP/);
    await agent.disconnect("fixture-profile"); assert.equal((await agent.status("fixture-profile")).state, "disconnected");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("failed interface creation rolls back only the owned routes and reports no successful connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpn-failure-fixture-")), removed: string[] = [];
  const agent = new VpnAgent(root, async (file, args) => { if (args.includes("main")) return "[]"; if (file === "ip" && args.includes("wireguard")) throw new Error("not supported"); if (args.includes("del")) removed.push(args.join(" ")); return ""; });
  try { await assert.rejects(agent.connect("failed-profile", wg()), /VPN_WIREGUARD_UNAVAILABLE/); assert.equal(agent.tunnels.size, 0); assert.ok(removed.some(route => route.includes("unreachable 192.168.18.0/24"))); }
  finally { await rm(root, { recursive: true, force: true }); }
});
