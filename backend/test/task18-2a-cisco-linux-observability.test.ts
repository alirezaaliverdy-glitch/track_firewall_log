import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CAPABILITY_REGISTRY } from "../src/vendors/capability.registry.js";
import { buildCiscoIosCollection, CISCO_IOS_CLASSIC_INVENTORY_COMMANDS } from "../src/connectors/cisco/ios-xe/cisco-iosxe.inventory.js";
import { detectCiscoPlatform, parseCiscoAccessLists, parseCiscoEtherChannels, parseCiscoInterfacesStatus, parseCiscoIpInterfaceBrief, parseCiscoSystemFacts, parseCiscoVlans } from "../src/connectors/cisco/ios-xe/cisco-iosxe.parsers.js";
import { detectCiscoPrompt, stripCiscoEchoAndPrompt } from "../src/connectors/cisco/ios-xe/cisco-iosxe.prompt.js";
import { parseLinuxHealthOutput } from "../src/monitoring/linux/linux-health.parser.js";
import { scoreLinuxHealth } from "../src/monitoring/linux/linux-health-score.js";

const fixture = (name: string) => readFileSync(join(process.cwd(), "src", name), "utf8");
const ciscoFixture = (name: string) => fixture(join("connectors", "cisco", "ios-xe", "fixtures", name));
const linuxFixture = (name: string) => fixture(join("monitoring", "linux", "fixtures", name));

test("Task 18.2A detects Cisco platform families conservatively", () => {
  const iosxe = detectCiscoPlatform(ciscoFixture("show-version-iosxe.txt"));
  assert.equal(iosxe.platform, "cisco-ios-xe");
  assert.equal(iosxe.supported, true);
  assert.ok(iosxe.confidence >= 80);
  const classic = detectCiscoPlatform(ciscoFixture("show-version-classic-ios.txt"));
  assert.equal(classic.platform, "cisco-ios-classic");
  assert.equal(classic.supported, true);
  const nxos = detectCiscoPlatform(ciscoFixture("show-version-nxos.txt"));
  assert.equal(nxos.platform, "cisco-nx-os");
  assert.equal(nxos.supported, false);
});

test("Task 18.2A parses Cisco read-only fixtures", () => {
  assert.equal(parseCiscoInterfacesStatus(ciscoFixture("show-interfaces-status-iosxe.txt")).length, 2);
  const classicFacts = parseCiscoSystemFacts(ciscoFixture("show-version-classic-ios.txt"));
  assert.equal(classicFacts.platform, "cisco-ios-classic");
  assert.equal(classicFacts.model, "WS-C3560CX-8PC-S");
  assert.equal(classicFacts.iosVersion, "15.2(7)E8");
  assert.equal(classicFacts.uptime, "1 year, 2 weeks");
  assert.equal(parseCiscoIpInterfaceBrief("Interface IP-Address OK? Method Status Protocol\nVlan1 192.168.7.12 YES manual up up")[0]?.name, "Vlan1");
  assert.equal(parseCiscoVlans(ciscoFixture("show-vlan-brief-iosxe.txt"))[1]?.vlanId, 120);
  assert.equal(parseCiscoEtherChannels(ciscoFixture("show-etherchannel-summary-iosxe.txt"))[0]?.protocol, "LACP");
  assert.equal(parseCiscoAccessLists(ciscoFixture("show-access-lists-iosxe.txt")).filter((line) => line.action === "deny").length, 1);
});

test("IOS Classic collection returns typed partial capability evidence", () => {
  const collection = buildCiscoIosCollection({
    platform: ciscoFixture("show-version-classic-ios.txt"),
    inventory: "NAME: \"1\", DESCR: \"WS-C3560CX\"\nPID: WS-C3560CX-8PC-S, VID: V01, SN: FOC1234X0YZ",
    runningConfigHostname: "hostname edge-switch-01",
    ipInterfaceBrief: "Interface IP-Address OK? Method Status Protocol\nVlan1 192.168.7.12 YES manual up up",
    vlanBrief: "% Invalid input detected at '^' marker.",
    route: "Gateway of last resort is not set\nC    192.168.7.0/24 is directly connected, Vlan1",
    cpu: "CPU utilization for five seconds: 5%/0%; one minute: 7%; five minutes: 8%",
    memory: "Processor 1000000 250000 750000",
    flash: "123456 bytes total (65432 bytes free)"
  });
  assert.equal(collection.platform, "cisco-ios-classic");
  assert.equal(collection.inventoryStatus, "collected");
  assert.equal(collection.system.hostname, "Switch");
  assert.equal(collection.system.model, "WS-C3560CX-8PC-S");
  assert.equal(collection.interfaces.summary.length, 1);
  assert.equal(collection.capabilityProfile.groups.System, "read_only");
  assert.equal(collection.capabilityProfile.groups.VLAN, "not_supported");
  assert.equal(collection.health.cpu?.fiveSeconds, 5);
});

test("IOS Classic inventory command set covers safe read-only capability groups", () => {
  for (const commandId of ["interfacesDetailed", "arp", "macAddressTable", "cdpNeighbors", "lldpNeighbors", "ospfNeighbors", "eigrpNeighbors", "bgpSummary", "nat", "dhcpPools", "aaa", "sshStatus", "snmp", "runningConfigMetadata", "startupConfigMetadata"]) {
    assert.ok(CISCO_IOS_CLASSIC_INVENTORY_COMMANDS.includes(commandId as never), `${commandId} should be collected as optional evidence`);
  }
});
test("Task 18.2A prompt parser and output cleanup stay read-only safe", () => {
  assert.equal(detectCiscoPrompt("Switch#").mode, "privileged");
  assert.equal(detectCiscoPrompt("Switch(config)#").mode, "config");
  assert.equal(stripCiscoEchoAndPrompt("show version\nCisco IOS XE Software\nSwitch#", "show version"), "Cisco IOS XE Software");
});

test("Task 18.2A capability registry marks only Cisco reads as implemented", () => {
  const implementedMutations = CAPABILITY_REGISTRY.filter((capability) => capability.vendorKey === "cisco" && capability.mode === "mutate" && capability.implementationState === "implemented");
  assert.equal(implementedMutations.length, 0);
  assert.ok(CAPABILITY_REGISTRY.some((capability) => capability.key === "cisco.system.version.read" && capability.implementationState === "implemented"));
});

test("Task 18.2A Linux metric parser keeps unknown/warnings non-critical by default", () => {
  const parsed = parseLinuxHealthOutput(linuxFixture("linux-health-sample.txt"));
  assert.ok(parsed.metrics.some((metric) => metric.metricKey === "cpu.usage_percent"));
  assert.ok(parsed.metrics.some((metric) => metric.metricKey === "memory.usage_percent"));
  const score = scoreLinuxHealth(parsed.metrics, parsed.warnings);
  assert.equal(score.state, "healthy");
  const unknown = scoreLinuxHealth([], []);
  assert.equal(unknown.state, "healthy");
});
