// Explicit operator-supplied file only. Outputs booleans/fixed codes, never config or credentials.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { VpnAgent } from "../dist/vpn/vpn-agent.js";
const file = process.env.VPN_SAMPLE_CONF_PATH;
if (!file) throw new Error("VPN_SAMPLE_PATH_REQUIRED");
const values = {}; let section = "", peers = 0;
for (const raw of (await readFile(file, "utf8")).split(/\r?\n/)) {
  const line = raw.trim(); if (!line || line.startsWith("#")) continue;
  if (line.startsWith("[")) { section = line.toLowerCase(); if (section === "[peer]") peers++; continue; }
  const separator = line.indexOf("="); if (separator > 0) values[`${section}.${line.slice(0, separator).trim().toLowerCase()}`] = line.slice(separator + 1).trim();
}
if (peers !== 1) throw new Error("VPN_SINGLE_PEER_REQUIRED");
const endpoint = /^([^:]+):(\d+)$/.exec(values["[peer].endpoint"] ?? "");
if (!endpoint) throw new Error("VPN_ENDPOINT_INVALID");
const route = process.env.VPN_SAMPLE_PRIVATE_RANGE ?? "192.168.18.0/24";
const defaults = () => execFileSync("ip", ["-j", "-4", "route", "show", "default"], { encoding: "utf8" });
const original = defaults(), dns = await readFile("/etc/resolv.conf", "utf8"), agent = new VpnAgent();
let result = { configAccepted: false, handshake: false, targetReachable: false, defaultUnchanged: false, dnsUnchanged: false, publicUsesNormalRoute: false };
try {
  await agent.connect("operator-sample-check", { protocol: "wireguard", endpoint: endpoint[1], endpointPort: Number(endpoint[2]),
    address: values["[interface].address"].split(",").find(value => value.includes("."))?.trim(),
    privateKey: values["[interface].privatekey"], publicKey: values["[peer].publickey"], presharedKey: values["[peer].presharedkey"], mtu: Number(values["[interface].mtu"] ?? 1420), routes: [route] });
  result.configAccepted = true;
  // A real destination probe initiates the handshake; waiting alone may only see the keepalive timer.
  result.targetReachable = (await agent.test("operator-sample-check", "192.168.18.50", 80)).reachable;
  for (let i = 0; i < 25; i++) { if ((await agent.status("operator-sample-check")).state === "connected") { result.handshake = true; break; } await new Promise(resolve => setTimeout(resolve, 1000)); }
  if (result.handshake) result.targetReachable = (await agent.test("operator-sample-check", "192.168.18.50", 80)).reachable;
  result.publicUsesNormalRoute = !(await agent.routeTarget("1.1.1.1")).throughTunnel;
} catch (error) { result.code = /^VPN_[A-Z_]+$/.test(error.code ?? "") ? error.code : "VPN_SAMPLE_CHECK_FAILED"; }
finally { result.defaultUnchanged = defaults() === original; result.dnsUnchanged = await readFile("/etc/resolv.conf", "utf8") === dns; await agent.disconnect("operator-sample-check"); }
process.stdout.write(JSON.stringify(result));
if (!result.defaultUnchanged || !result.dnsUnchanged) process.exitCode = 1;
