import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateVpn, contains, overlaps, wireguardConfig, l2tpConfigs, VpnError } from "../src/vpn/vpn-validation.js";
import { VpnAgent } from "../src/vpn/vpn-agent.js";
import { VpnRecoverySchedule } from "../src/vpn/vpn-recovery.js";
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

test("recovery pacing is bounded indefinitely, preserves auth safety and allows a manual reset", () => {
  const s = new VpnRecoverySchedule(); let now = 1000;
  assert.equal(s.due("fixture", now), true);
  for (let i = 0; i < 30; i++) { s.failed("fixture", "VPN_AGENT_UNAVAILABLE", now); assert.equal(s.due("fixture", now), false); const next = Date.parse(s.info("fixture").retryAt!); assert.ok(next - now <= 300000); now = next; assert.equal(s.due("fixture", now), true); }
  s.failed("fixture", "VPN_PPP_AUTH_FAILED", now); assert.equal(s.info("fixture").recoveryBlocked, true); assert.equal(s.due("fixture", now + 999999999), false);
  s.clear("fixture"); assert.equal(s.due("fixture", now), true);
});
test("reading L2TP status does not terminate the tunnel daemons during transient loss", async () => {
  let kills = 0;
  const agent = new VpnAgent("/unused-fixture", async (file, args) => file === "ip" && args.includes("address") ? "[]" : "");
  agent.tunnels.set("fixture-l2tp-read", { id: "fixture-l2tp-read", iface: "fv0000000000", endpointIp: "198.51.100.2", dir: "/unused-fixture", diagnosticCodes: [],
    config: validateVpn({ protocol: "l2tp", endpoint: "198.51.100.2", routes: ["192.168.99.0/24"], username: "fixture", password: randomBytes(12).toString("hex"), ipsecPsk: randomBytes(12).toString("hex") }),
    processes: [{ kill: () => { kills++; } } as unknown as import("node:child_process").ChildProcess] });
  assert.equal((await agent.status("fixture-l2tp-read")).state, "error"); assert.equal(kills, 0);
});
test("retained unreachable guards use numeric route identity and are not inserted twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpn-numeric-routes-")); let inserted = 0;
  const agent = new VpnAgent(root, async (file, args) => {
    if (file === "ip" && args.includes("main")) { assert.ok(args.includes("-N")); return JSON.stringify([{ dst: "default", dev: "eth0" }, { dst: "192.168.18.0/24", protocol: "186", type: "7", metric: 42760 }]); }
    if (file === "ip" && args[0] === "route" && args[1] === "add" && args.includes("unreachable")) { inserted++; throw new Error("duplicate guard"); }
    if (file === "wg" && args.includes("latest-handshakes")) return `fixture\t${Math.floor(Date.now() / 1000)}`;
    return "";
  });
  try { assert.equal((await agent.recover("numeric-fixture", wg())).state, "connected"); assert.equal(inserted, 0); await agent.disconnect("numeric-fixture"); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test("stale WireGuard refreshes the endpoint without destroying interface/default route/DNS; missing link is recovered", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpn-recover-fixture-")), calls: Array<[string, string[]]> = [];
  let state = "fresh"; const config = wg();
  const agent = new VpnAgent(root, async (file, args) => { calls.push([file, args]);
    if (args.includes("main")) return JSON.stringify([{ dst: "default", dev: "eth0", gateway: "172.28.0.1" }]);
    if (file === "wg" && args.includes("latest-handshakes")) { if (state === "missing") { state = "fresh"; throw new Error(); } return `fixture\t${Math.floor(Date.now() / 1000) - (state === "stale" ? 400 : 0)}`; }
    if (file === "wg" && args.includes("transfer")) return "fixture\t12\t24";
    return "";
  });
  try {
    await agent.connect("recovery-fixture", config); state = "stale"; const before = calls.length;
    assert.equal((await agent.recover("recovery-fixture", config)).state, "stale");
    assert.ok(calls.slice(before).some(([f, a]) => f === "wg" && a.includes("persistent-keepalive")));
    assert.equal(calls.slice(before).some(([, a]) => a.includes("delete")), false);
    state = "missing"; assert.equal((await agent.recover("recovery-fixture", config)).state, "connected");
    assert.ok(calls.some(([, a]) => a.join(" ").startsWith("link delete fv")));
    assert.equal(calls.some(([, a]) => a.includes("default") || a.includes("0.0.0.0/0")), false);
    await agent.disconnect("recovery-fixture"); assert.equal((await agent.status("recovery-fixture")).state, "disconnected");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a retained host /32 guard rendered without prefix is not inserted twice during recovery",async()=>{
 const root=await mkdtemp(join(tmpdir(),"vpn-host-guard-"));let guards=0;
 const agent=new VpnAgent(root,async(file,args)=>{
  if(args.includes("main"))return JSON.stringify([{dst:"192.168.18.50",protocol:186,type:7,metric:42760}]);
  if(file==="ip"&&args[0]==="route"&&args[1]==="add"&&args.includes("unreachable")){guards++;throw new Error("duplicate guard");}
  if(file==="wg"&&args.includes("latest-handshakes"))return `fixture\t${Math.floor(Date.now()/1000)}`;return "";
 });
 try{assert.equal((await agent.recover("host-guard-fixture",{...wg(),routes:["192.168.18.50/32"]})).state,"connected");assert.equal(guards,0);await agent.disconnect("host-guard-fixture");}finally{await rm(root,{recursive:true,force:true});}
});
