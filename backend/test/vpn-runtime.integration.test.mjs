import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { VpnAgent, l2tpKernelReady } from "../dist/vpn/vpn-agent.js";
const endpoint = process.env.VPN_FIXTURE_IP;
assert.ok(endpoint, "Run only against the disposable local VPN server fixture.");
if (process.env.VPN_FIXTURE_BRIDGE_IP) execFileSync("ip", ["route", "add", `${endpoint}/32`, "via", process.env.VPN_FIXTURE_BRIDGE_IP, "dev", "eth0"]);
const agent = new VpnAgent();
const originalDefault = () => execFileSync("ip", ["-j", "route", "show", "default"], { encoding: "utf8" });
const configure = async (path, data) => { const response = await fetch(`http://${endpoint}:8055/${path}`, { method: "POST", body: JSON.stringify(data) }); assert.equal(response.status, 200); };
test("real WireGuard handshake and private TCP access preserve API default route and DNS", async () => {
  const defaults = originalDefault(), dns = await readFile("/etc/resolv.conf", "utf8");
  const privateKey = execFileSync("wg", ["genkey"], { encoding: "utf8" }).trim();
  const publicKey = execFileSync("wg", ["pubkey"], { input: privateKey, encoding: "utf8" }).trim();
  const serverKey = (await (await fetch(`http://${endpoint}:8055/keys`)).json()).publicKey;
  await configure("wg", { publicKey });
  try {
    await agent.connect("fixture-wireguard", { protocol: "wireguard", endpoint, endpointPort: 51820, address: "10.70.0.2/32", privateKey, publicKey: serverKey, routes: ["192.168.77.0/24"] });
    assert.equal((await agent.test("fixture-wireguard", "192.168.77.1", 8055)).reachable, true);
    assert.equal((await agent.status("fixture-wireguard")).state, "connected");
    // Simulate a lost local link; recover using the same key/profile without touching the API default route or DNS.
    execFileSync("ip", ["link", "delete", agent.tunnels.get("fixture-wireguard").iface]);
    await agent.recover("fixture-wireguard", { protocol: "wireguard", endpoint, endpointPort: 51820, address: "10.70.0.2/32", privateKey, publicKey: serverKey, routes: ["192.168.77.0/24"] });
    assert.equal((await agent.test("fixture-wireguard", "192.168.77.1", 8055)).reachable, true);
    assert.equal((await agent.status("fixture-wireguard")).state, "connected");
    assert.equal(originalDefault(), defaults); assert.equal(await readFile("/etc/resolv.conf", "utf8"), dns);
    const secondKey = execFileSync("wg", ["genkey"], { encoding: "utf8" }).trim();
    const secondPublic = execFileSync("wg", ["pubkey"], { input: secondKey, encoding: "utf8" }).trim();
    await configure("wg-peer", { publicKey: secondPublic });
    await agent.connect("fixture-second-wg", { protocol: "wireguard", endpoint, endpointPort: 51820, address: "10.71.0.2/32", privateKey: secondKey, publicKey: serverKey, routes: ["192.168.88.0/24"] });
    try {
      assert.equal((await agent.test("fixture-second-wg", "192.168.88.1", 8055)).reachable, true);
      assert.equal((await agent.status("fixture-second-wg")).state, "connected");
      assert.equal((await agent.test("fixture-wireguard", "192.168.77.1", 8055)).reachable, true);
      assert.equal((await agent.routeTarget("192.168.88.1")).profileId, "fixture-second-wg");
    } finally { await agent.disconnect("fixture-second-wg"); }
    assert.equal(originalDefault(), defaults); assert.equal(await readFile("/etc/resolv.conf", "utf8"), dns);
    await assert.rejects(agent.test("fixture-wireguard", "8.8.8.8", 53), /VPN_TEST_TARGET_INVALID/);
  } finally { await agent.disconnect("fixture-wireguard"); }
  assert.equal(originalDefault(), defaults);
});
test("real L2TP/IPsec PSK and MSCHAPv2 reach the private host without a default route or peer DNS", async context => {
  if (!await l2tpKernelReady()) { context.skip("Docker host PPP async/L2TP drivers are not active; kernel changes are not authorized by this fixture."); return; }
  const defaults = originalDefault(), dns = await readFile("/etc/resolv.conf", "utf8"), psk = randomBytes(24).toString("hex"), password = randomBytes(12).toString("hex"), username = "fixture-client";
  await configure("l2tp", { psk, password, username });
  try {
    const result = await agent.connect("fixture-l2tp", { protocol: "l2tp", endpoint, routes: ["192.168.88.0/24"], username, password, ipsecPsk: psk });
    assert.equal(result.state, "connected"); assert.equal((await agent.test("fixture-l2tp", "192.168.88.1", 8055)).reachable, true);
    assert.equal(originalDefault(), defaults); assert.equal(await readFile("/etc/resolv.conf", "utf8"), dns);
  } catch (error) {
    const t = agent.tunnels.get("fixture-l2tp");
    console.log(JSON.stringify({ fixtureDiagnostics: await (await fetch(`http://${endpoint}:8055/diagnostics`)).json(), managed: error.diagnostics, managedProcesses: t?.processes.map(child => ({ alive: child.exitCode === null, exitCode: child.exitCode })) }));
    throw error;
  } finally { await agent.disconnect("fixture-l2tp"); }
  assert.equal(originalDefault(), defaults);
});
