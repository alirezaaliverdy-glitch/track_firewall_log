import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Device } from "@prisma/client";
import { getProductNavigation, PRODUCT_FEATURES, validateProductState } from "../src/product-state/product-state.registry.js";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { collectFreshServiceEndpoints, collectPortCandidates, collectServiceEndpoints } = await import("../src/assets/port-topology.service.js");
const { ActionType, AiRiskLevel } = await import("@prisma/client");
const { findCatalogItem } = await import("../src/commands/catalog/index.js");
const { getExecutionTemplate } = await import("../src/commands/execution/execution-template-registry.js");
const { compileRouterOsAction } = await import("../src/services/routeros-command-compiler.js");
const { compileFortiGateAction } = await import("../src/services/fortigate-command-compiler.js");
const { verifyFortiGateExecution } = await import("../src/fortigate/execution-verifier.js");

const root = join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function device(capabilities: Record<string, unknown>, vendor = "mikrotik") {
  return { id: "device-1", name: "edge", vendor, type: vendor === "linux" ? "linux_edge" : vendor, host: "192.0.2.10", status: "online", capabilities } as Device;
}

test("inventory inference extracts real interface names without loopback noise", () => {
  const ports = collectPortCandidates(device({ mikrotikStatus: { mikrotik: { interfaces: [
    "0 R name=ether1 type=ether mtu=1500", "1 X name=ether2 type=ether mtu=1500", "lo"
  ] } } }));
  assert.deepEqual(ports.map((port) => port.name), ["ether1", "ether2"]);
  assert.equal(ports[0].type, "ethernet");
  assert.equal(ports[0].meta.operationalStatus, "up");
  assert.equal(ports[1].meta.operationalStatus, "down");
});

test("neighbor discovery data becomes an editable peer suggestion", () => {
  const ports = collectPortCandidates(device({ neighbors: [{ localInterface: "ether1", identity: "access-sw-2", address: "192.0.2.20", portId: "Gi0/24" }] }));
  assert.equal(ports[0].name, "ether1");
  assert.equal(ports[0].meta.peerName, "access-sw-2");
  assert.equal(ports[0].meta.peerPort, "Gi0/24");
  assert.equal(ports[0].meta.sourceProtocol, "neighbor-discovery");
});

test("interface discovery preserves valid assigned addresses", () => {
  const ports = collectPortCandidates(device({ interfaces: "eth0 UP 192.168.20.15/24 fe80::1/64\nlo UNKNOWN 127.0.0.1/8" }, "linux"));
  assert.equal(ports[0].name, "eth0");
  assert.deepEqual(ports[0].meta.ipAddresses, ["192.168.20.15/24", "fe80::1/64"]);
});

test("Cisco interface inventory is canonical, deduplicated, and keeps admin and link state", () => {
  const ports = collectPortCandidates(device({ cisco: { collection: { interfaces: {
    summary: [
      { name: "GigabitEthernet1/0/1", ipAddress: null, administrativeStatus: "up", operationalStatus: "down" },
      { name: "GigabitEthernet1/0/3", ipAddress: "192.0.2.3", administrativeStatus: "up", operationalStatus: "up" },
      { name: "GigabitEthernet1/0/4", ipAddress: null, administrativeStatus: "down", operationalStatus: "down" },
      { name: "GigabitEthernet1/0/5", ipAddress: null, administrativeStatus: "administratively down", operationalStatus: "down" }
    ],
    switchports: [
      { name: "Gi1/0/1", status: "notconnect", operationalStatus: "down", vlan: "10", speed: "auto", description: "Office" },
      { name: "Gi1/0/3", status: "connected", operationalStatus: "up", vlan: "20", speed: "a-1000" }
    ]
  } }, outputs: { interfacesStatus: "do not recursively parse this as a port" } }, refreshedAt: "2026-09-08T10:00:00Z" }, "cisco"));

  assert.deepEqual(ports.map((port) => port.name), ["GigabitEthernet1/0/1", "GigabitEthernet1/0/3", "GigabitEthernet1/0/4", "GigabitEthernet1/0/5"]);
  assert.equal(ports[0].meta.operationalStatus, "down");
  assert.equal(ports[0].meta.administrativeStatus, "up");
  assert.equal(ports[0].meta.vlan, "10");
  assert.equal(ports[0].meta.description, "Office");
  assert.equal(ports[1].meta.operationalStatus, "up");
  assert.deepEqual(ports[1].meta.ipAddresses, ["192.0.2.3"]);
  assert.equal(ports[2].meta.administrativeStatus, "up");
  assert.equal(ports[3].meta.administrativeStatus, "down");
});

test("empty inventory gets one honest low-assumption management interface", () => {
  const ports = collectPortCandidates(device({}, "linux"));
  assert.equal(ports.length, 1);
  assert.equal(ports[0].name, "eth0");
  assert.match(ports[0].meta.description ?? "", /inferred/);
});

test("Linux listeners preserve bind address, protocol, port, and process", () => {
  const endpoints = collectServiceEndpoints(device({ linuxStatus: { listeningPorts: [
    'tcp LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=42,fd=18))',
    'tcp LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=7,fd=5))'
  ].join("\n") } }, "linux"));
  assert.equal(endpoints.length, 2);
  assert.partialDeepStrictEqual(endpoints[0], { protocol: "tcp", address: "0.0.0.0", port: 8080, process: "node", exposure: "all_interfaces", state: "listening" });
  assert.equal(endpoints[1].exposure, "loopback");
});

test("Linux firewall allow rules are shown beside listeners without duplicate cards", () => {
  const endpoints = collectServiceEndpoints(device({ linuxStatus: {
    listeningPorts: "tcp LISTEN 0 128 127.0.0.1:8080 0.0.0.0:*",
    firewallPorts: [
      "__UFW__",
      "Status: active",
      "8080/tcp ALLOW Anywhere",
      "9090/tcp ALLOW Anywhere",
      "9090/tcp (v6) ALLOW Anywhere (v6)"
    ].join("\n")
  } }, "linux"));

  assert.equal(endpoints.filter((item) => item.key === "tcp:8080").length, 1);
  assert.equal(endpoints.filter((item) => item.key === "tcp:9090").length, 1);
  assert.partialDeepStrictEqual(endpoints.find((item) => item.key === "tcp:9090"), {
    address: "firewall",
    state: "allowed",
    exposure: "policy",
    source: "linux-ufw"
  });
});

test("fresh Linux listener data replaces stale snapshots instead of merging closed ports", () => {
  const liveCheckedAt = "2026-09-06T11:00:00.000Z";
  const current = device({ linuxStatus: {
    connected: true,
    listeningPortsCollected: true,
    listeningPortsCheckedAt: liveCheckedAt,
    listeningPorts: "tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*"
  } }, "linux");
  const result = collectFreshServiceEndpoints(current, {
    collectedAt: new Date("2026-09-06T10:59:00.000Z"),
    dataJson: { network: { listeningPorts: [
      "tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*",
      "tcp LISTEN 0 128 127.0.0.1:8080 0.0.0.0:*"
    ] } }
  });
  assert.equal(result.source, "live");
  assert.deepEqual(result.endpoints.map((item) => item.port), [22]);
});

test("newer Linux security snapshots replace older live inventories", () => {
  const current = device({ linuxStatus: {
    connected: true,
    listeningPortsCollected: true,
    listeningPortsCheckedAt: "2026-09-06T10:00:00.000Z",
    listeningPorts: "tcp LISTEN 0 128 0.0.0.0:8080 0.0.0.0:*"
  } }, "linux");
  const result = collectFreshServiceEndpoints(current, {
    collectedAt: new Date("2026-09-06T10:01:00.000Z"),
    dataJson: { network: { listeningPorts: ["tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*"] } }
  });
  assert.equal(result.source, "snapshot");
  assert.deepEqual(result.endpoints.map((item) => item.port), [22]);
});

test("IPv4 and IPv6 binds collapse into one card without losing binding details", () => {
  const endpoints = collectServiceEndpoints(device({ linuxStatus: { listeningPorts: [
    'tcp LISTEN 0 4096 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=42,fd=8))',
    'tcp LISTEN 0 4096 [::]:80 [::]:* users:(("nginx",pid=42,fd=9))',
    'udp UNCONN 0 0 0.0.0.0:53 0.0.0.0:* users:(("dns",pid=7,fd=3))',
    'tcp LISTEN 0 128 127.0.0.1:53 0.0.0.0:* users:(("dns-admin",pid=8,fd=4))'
  ].join("\n") } }, "linux"));

  assert.equal(endpoints.length, 3);
  const http = endpoints.find((item) => item.protocol === "tcp" && item.port === 80);
  assert.ok(http);
  assert.equal(http.key, "tcp:80");
  assert.deepEqual(http.bindings?.map((binding) => binding.address), ["0.0.0.0", "[::]"]);
  assert.ok(endpoints.some((item) => item.protocol === "udp" && item.port === 53));
  assert.ok(endpoints.some((item) => item.protocol === "tcp" && item.port === 53));
});

test("vendor service inventories stay semantically distinct", () => {
  const mikrotik = collectServiceEndpoints(device({ mikrotikStatus: { mikrotik: { services: ["0 name=ssh port=22 address=0.0.0.0/0 disabled=false"] } } }));
  assert.equal(mikrotik[0].source, "mikrotik-ip-service");
  assert.equal(mikrotik[0].port, 22);
  const fortigate = collectServiceEndpoints(device({ fortigateStatus: { fortigate: { raw: { "show firewall service custom": 'edit "APP-8080"\n set tcp-portrange 8080\nnext' } } } }, "fortigate"));
  assert.equal(fortigate[0].source, "fortigate-service-object");
  assert.equal(fortigate[0].exposure, "policy");
  const pfsense = collectServiceEndpoints(device({ openPorts: [443] }, "pfsense"));
  assert.equal(pfsense[0].port, 443);
  assert.equal(pfsense[0].exposure, "policy");
});

test("service discovery is bounded for large inventories", () => {
  const payload = Array.from({ length: 1_000 }, (_, index) => `tcp LISTEN 0 128 0.0.0.0:${1_000 + index} 0.0.0.0:*`).join("\n");
  const started = performance.now();
  const endpoints = collectServiceEndpoints(device({ linuxStatus: { listeningPorts: payload } }, "linux"));
  assert.equal(endpoints.length, 256);
  assert.ok(performance.now() - started < 250);
});

test("port topology is an implemented Assets navigation route", () => {
  assert.equal(validateProductState(), true);
  const feature = PRODUCT_FEATURES.find((item) => item.key === "assets.topology");
  assert.equal(feature?.state, "implemented");
  assert.equal(feature?.navigationVisible, true);
  assert.ok(getProductNavigation().find((group) => group.key === "assets")?.items.some((item) => item.route === "/assets/topology"));
});

test("manual changes are permission-gated and discovery preserves overrides", () => {
  const authorization = read("backend/src/security/authorization.ts");
  const service = read("backend/src/assets/port-topology.service.ts");
  assert.match(authorization, /port-topology\/discover[^\n]+devices\.manage/);
  assert.match(authorization, /port-topology\/listeners\/refresh[^\n]+devices\.manage/);
  assert.match(authorization, /port-topology\/:deviceId\/ports\/:portName[^\n]+devices\.manage/);
  assert.match(authorization, /port-topology\/:deviceId\/services\/:endpointKey[^\n]+devices\.manage/);
  assert.match(service, /previous\.manualOverride \? \{ \.\.\.entry\.meta, \.\.\.previous/);
  assert.match(service, /action: "asset\.port_topology\.override_saved"/);
  assert.match(service, /connectionErrorCode/);
});

test("faceplate is code-native, responsive, and motion-safe", () => {
  const page = read("src/features/assets/pages/PortTopologyPage.tsx");
  const css = read("src/features/assets/pages/PortTopologyPage.css");
  assert.match(page, /port-device__face/);
  assert.match(page, /profiles: Record/);
  assert.match(page, /service-port-rail/);
  assert.match(page, /service-editor__bindings/);
  assert.match(page, /InlineActionReview/);
  assert.match(page, /quickExecuteAction\(pending\.plan\.id, \{ intent: "execute"/);
  assert.match(page, /cisco\.configure-interface-ipv4/);
  assert.match(page, /fortigate\.update-interface-ip/);
  assert.match(page, /mikrotik\.enable-interface/);
  assert.doesNotMatch(page, /navigate\(["'`]\/actions/);
  assert.match(page, /45_000/);
  assert.match(page, /60_000/);
  assert.match(page, /void refreshLiveListeners\(\)/);
  assert.match(page, /refreshLinuxServicePorts\(liveLinuxDeviceId\)/);
  assert.match(read("backend/src/connectors/linux-ssh.connector.ts"), /ss -H -lntup/);
  assert.doesNotMatch(page, /<img|data:image|https?:\/\//);
  assert.match(css, /perspective:1100px/);
  assert.match(css, /transform-style:preserve-3d/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(read("nginx.firewall-web.conf"), /location = \/firewall\/assets\/topology/);
});

test("MikroTik topology controls resolve to registered controlled templates", () => {
  for (const id of ["mikrotik.enable-interface", "mikrotik.disable-interface", "mikrotik.set-interface-comment", "mikrotik.enable-service", "mikrotik.disable-service"]) {
    const item = findCatalogItem(id);
    assert.equal(item?.supportState, "verified", id);
    assert.ok(getExecutionTemplate(item?.executionTemplateRef ?? null), id);
  }
  const compiled = compileRouterOsAction({ actionType: ActionType.mikrotik_disable_interface, parameters: { interfaceName: "ether5" }, riskLevel: AiRiskLevel.critical });
  assert.equal(compiled.commandSpecs[0].command, '/interface disable [find where name="ether5"]');
  assert.equal(compiled.requiresBreakGlass, true);
});

test("Cisco, FortiGate, and Linux topology controls are executable catalog actions", () => {
  for (const id of ["cisco.enable-interface", "cisco.disable-interface", "cisco.configure-interface-ipv4", "cisco.update-interface-description", "fortigate.enable-interface", "fortigate.disable-interface", "fortigate.update-interface-ip", "fortigate.set-interface-alias", "linux.open-port", "linux.close-port"]) {
    assert.equal(findCatalogItem(id)?.supportState, "verified", id);
  }
});

test("FortiGate interface changes include a semantic read-back verification", () => {
  const compiled = compileFortiGateAction({ actionType: ActionType.fortigate_update_interface_ip, parameters: { name: "port2", ip: "192.168.20.1/24" }, riskLevel: AiRiskLevel.high });
  assert.equal(compiled.commandSpecs.at(-1)?.command, "show full-configuration system interface port2");
  const verified = verifyFortiGateExecution(ActionType.fortigate_update_interface_ip, compiled.normalizedParameters, [
    { template: compiled.commandSpecs[0].template, stdout: "", stderr: "", exitCode: 0 },
    { template: "verify interface full configuration", stdout: 'config system interface\n edit "port2"\n  set ip 192.168.20.1 255.255.255.0\n next\nend', stderr: "", exitCode: 0 }
  ]);
  assert.equal(verified.ok, true);
});
