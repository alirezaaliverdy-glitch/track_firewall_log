import assert from "node:assert/strict";
import test from "node:test";
import { networkInventoryScanInternalsForTest as scan } from "../src/services/network-inventory-scan.service.js";

test("network inventory accepts only bounded RFC1918 CIDRs", () => {
  assert.equal(scan.normalizePrivateCidr("192.168.40.77/24"), "192.168.40.0/24");
  assert.equal(scan.normalizePrivateCidr("10.2.3.4/28"), "10.2.3.0/28");
  assert.equal(scan.cidrAddresses("192.168.1.0/30").join(","), "192.168.1.1,192.168.1.2");
  assert.equal(scan.cidrContains("172.16.4.0/24", "172.16.4.200"), true);
  assert.equal(scan.cidrContains("172.16.4.0/24", "172.16.5.1"), false);
  assert.throws(() => scan.normalizePrivateCidr("8.8.8.0/24"), /SCAN_PRIVATE_RANGE_REQUIRED/);
  assert.throws(() => scan.normalizePrivateCidr("10.0.0.0/16"), /SCAN_RANGE_TOO_LARGE/);
  assert.throws(() => scan.normalizePrivateCidr("not-an-ip"), /SCAN_CIDR_INVALID/);
});

test("Nmap XML exposes IP, MAC vendor, latency, hostname and open service evidence", () => {
  const [host] = scan.parseNmapXml(`<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="192.168.1.20" addrtype="ipv4"/><address addr="AA:BB:CC:DD:EE:FF" addrtype="mac" vendor="Example Devices"/><hostnames><hostname name="printer.local"/></hostnames><ports><port protocol="tcp" portid="80"><state state="open"/><service name="http" product="Embedded Web" version="2.1"/></port></ports><times srtt="21500"/></host></nmaprun>`);
  assert.deepEqual(host, {
    ip: "192.168.1.20",
    mac: "AA:BB:CC:DD:EE:FF",
    manufacturer: "Example Devices",
    hostname: "printer.local",
    latencyMs: 21.5,
    ports: [{ protocol: "tcp", port: 80, state: "open", service: "http", product: "Embedded Web", version: "2.1" }]
  });
});

test("vendor ARP and MAC rows merge without inventing missing identity", () => {
  const arp = scan.parseNeighborText("Internet 192.168.10.44 2 aabb.ccdd.eeff ARPA Vlan10", "cisco:arp");
  const mac = scan.parseNeighborText("10 aabb.ccdd.eeff DYNAMIC Gi1/0/8", "cisco:mac");
  const [neighbor] = scan.mergeVendorNeighbors([...arp, ...mac]);
  assert.equal(neighbor.ip, "192.168.10.44");
  assert.equal(neighbor.mac, "AA:BB:CC:DD:EE:FF");
  assert.equal(neighbor.interfaceName, "Vlan10");
  assert.deepEqual(neighbor.evidence.sort(), ["cisco:arp", "cisco:mac"]);
});

test("host table retains every address and grades evidence confidence", () => {
  const hosts = scan.buildHosts("192.168.1.0/30", [{ ip: "192.168.1.1", mac: null, manufacturer: null, hostname: "gw", latencyMs: 1.4, ports: [] }], [{ ip: "192.168.1.1", mac: "AA:BB:CC:DD:EE:FF", hostname: null, interfaceName: "bridge", vlan: null, evidence: ["mikrotik:arp"] }]);
  assert.equal(hosts.length, 2);
  assert.equal(hosts[0].state, "up");
  assert.equal(hosts[0].confidence, "high");
  assert.equal(hosts[1].state, "down");
  assert.equal(scan.scanSummary(hosts).addressCount, 2);
});
