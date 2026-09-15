import assert from "node:assert/strict";
import test from "node:test";
import type { Device } from "@prisma/client";

process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test";

const { collectPortCandidates, collectServiceEndpoints } = await import("../src/assets/port-topology.service.js");
const { findCatalogItem } = await import("../src/commands/catalog/index.js");
const { getExecutionTemplate } = await import("../src/commands/execution/execution-template-registry.js");
const { sophosApiConnector, parseSophosDiscovery } = await import("../src/connectors/sophos-api.connector.js");
const { sophosPlanner } = await import("../src/connectors/vendors/sophos.planner.js");

test("Sophos XML parser extracts every nested entity and interface state", () => {
  const discovery = parseSophosDiscovery(`
    <Response APIVersion="2200.1"><Interface transactionid="x">
      <Interface><Name>LAN</Name><Hardware>Port1</Hardware><NetworkZone>LAN</NetworkZone><IPAddress>192.0.2.1</IPAddress><Netmask>255.255.255.0</Netmask><Status>Connected</Status><InterfaceStatus>ON</InterfaceStatus></Interface>
      <Interface><Name>WAN</Name><Hardware>Port2</Hardware><NetworkZone>WAN</NetworkZone><IPAddress>198.51.100.2</IPAddress><Status>Disconnected</Status><InterfaceStatus>OFF</InterfaceStatus></Interface>
    </Interface><FirewallRule transactionid="y">
      <FirewallRule><Name>Allow-Web</Name><Status>Enable</Status><Action>Accept</Action><SourceZones><Zone>LAN</Zone></SourceZones><DestinationZones><Zone>WAN</Zone></DestinationZones><Services><Service>HTTPS</Service></Services></FirewallRule>
    </FirewallRule></Response>`);

  assert.equal(discovery.interfaces.length, 2);
  assert.deepEqual(discovery.interfaces.map((item) => [item.hardware, item.operationalStatus, item.administrativeStatus]), [["Port1", "up", "up"], ["Port2", "down", "down"]]);
  assert.deepEqual(discovery.firewallRules[0].sourceZones, ["LAN"]);
  assert.deepEqual(discovery.firewallRules[0].destinationZones, ["WAN"]);
  assert.deepEqual(discovery.firewallRules[0].services, ["HTTPS"]);
});

test("Sophos topology consumes normalized inventory without phantom duplicate ports", () => {
  const device = {
    id: "sophos-1", name: "edge", vendor: "sophos", type: "generic_firewall", protocol: "api", host: "192.0.2.1", managementPort: 4444, status: "online",
    capabilities: { sophosStatus: { sophos: { interfaces: [
      { name: "LAN", hardware: "Port1", zone: "LAN", ipAddresses: ["192.0.2.1"], operationalStatus: "up", administrativeStatus: "up" },
      { name: "WAN", hardware: "Port2", zone: "WAN", ipAddresses: ["198.51.100.2"], operationalStatus: "down", administrativeStatus: "down" }
    ], services: [{ name: "Web", protocol: "TCP", ports: ["80", "443"] }] } } }
  } as Device;

  const ports = collectPortCandidates(device);
  assert.deepEqual(ports.map((item) => item.name), ["Port1", "Port2"]);
  assert.equal(ports[0].meta.operationalStatus, "up");
  assert.equal(ports[1].meta.administrativeStatus, "down");
  assert.deepEqual(collectServiceEndpoints(device).map((item) => item.port), [80, 443]);
});

test("Sophos catalog operations are backed by the API connector and planner", () => {
  const device = { id: "sophos-1", vendor: "sophos", type: "generic_firewall", protocol: "api" } as Device;
  assert.equal(sophosApiConnector.supports(device), true);
  assert.equal(sophosPlanner.supports(device), true);
  for (const id of ["sophos.inventory", "sophos.enable-interface", "sophos.disable-interface", "sophos.set-interface-ipv4", "sophos.enable-firewall-rule", "sophos.disable-firewall-rule"]) {
    const item = findCatalogItem(id);
    assert.equal(item?.supportState, "verified", id);
    assert.equal(getExecutionTemplate(item?.executionTemplateRef ?? null)?.connectorType, "sophos-api", id);
  }
});
