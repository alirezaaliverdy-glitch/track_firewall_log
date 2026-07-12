import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CAPABILITY_REGISTRY } from "../src/vendors/capability.registry.js";
import { detectCiscoPlatform, parseCiscoAccessLists, parseCiscoEtherChannels, parseCiscoInterfacesStatus, parseCiscoVlans } from "../src/connectors/cisco/ios-xe/cisco-iosxe.parsers.js";
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
  assert.equal(classic.supported, false);
  const nxos = detectCiscoPlatform(ciscoFixture("show-version-nxos.txt"));
  assert.equal(nxos.platform, "cisco-nx-os");
  assert.equal(nxos.supported, false);
});

test("Task 18.2A parses Cisco read-only fixtures", () => {
  assert.equal(parseCiscoInterfacesStatus(ciscoFixture("show-interfaces-status-iosxe.txt")).length, 2);
  assert.equal(parseCiscoVlans(ciscoFixture("show-vlan-brief-iosxe.txt"))[1]?.vlanId, 120);
  assert.equal(parseCiscoEtherChannels(ciscoFixture("show-etherchannel-summary-iosxe.txt"))[0]?.protocol, "LACP");
  assert.equal(parseCiscoAccessLists(ciscoFixture("show-access-lists-iosxe.txt")).filter((line) => line.action === "deny").length, 1);
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
