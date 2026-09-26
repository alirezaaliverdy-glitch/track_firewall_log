import assert from "node:assert/strict";
import test from "node:test";
import { buildCiscoAccessEtherChannelSpecs, findCiscoOperation } from "../src/cisco/cisco-operation-registry.js";

const params = { groupId: 5, interfaces: "Gi1/0/1, Gi1/0/2", accessVlanId: 10, acknowledgeDisruption: true };

test("EtherChannel appears as a controlled, critical Cisco action", () => {
  const operation = findCiscoOperation("cisco.create-access-etherchannel");
  assert.equal(operation?.state, "implemented");
  assert.equal(operation?.risk, "critical");
  assert.deepEqual(operation?.requiredParams, ["groupId", "interfaces", "accessVlanId", "acknowledgeDisruption"]);
});

test("EtherChannel plan verifies ports before writing and uses LACP active", () => {
  const specs = buildCiscoAccessEtherChannelSpecs(params);
  const firstWrite = specs.findIndex((spec) => spec.write);
  assert.equal(firstWrite, 4);
  assert.ok(specs.slice(0, firstWrite).every((spec) => spec.strict && spec.validateOutput));
  assert.ok(specs.some((spec) => spec.command === "channel-group 5 mode active"));
  assert.ok(specs.some((spec) => spec.command === "interface GigabitEthernet1/0/1"));
  assert.equal(specs.at(-1)?.command, "show etherchannel 5 summary");
  assert.throws(() => specs[0].validateOutput?.("5 Po5(SU) LACP Gi1/0/1(P)"), /already exists/);
  assert.throws(() => specs[1].validateOutput?.("VLAN Name Status\n5 default suspended"), /not active/);
  assert.throws(() => specs[2].validateOutput?.("interface GigabitEthernet1/0/1\n channel-group 3 mode active"), /incompatible/);
});

test("EtherChannel input rejects unsafe or ambiguous values", () => {
  assert.throws(() => buildCiscoAccessEtherChannelSpecs({ ...params, acknowledgeDisruption: false }), /Confirm/);
  assert.throws(() => buildCiscoAccessEtherChannelSpecs({ ...params, groupId: 25 }), /between 1 and 24/);
  assert.throws(() => buildCiscoAccessEtherChannelSpecs({ ...params, interfaces: "Gi1/0/1, GigabitEthernet1/0/1" }), /unique/);
  assert.throws(() => buildCiscoAccessEtherChannelSpecs({ ...params, interfaces: "Gi1/0/1; reload, Gi1/0/2" }), /2 to 8/);
  assert.throws(() => buildCiscoAccessEtherChannelSpecs({ ...params, interfaces: "Gi1/0/1, Fa1/0/2" }), /same Ethernet type/);
});
