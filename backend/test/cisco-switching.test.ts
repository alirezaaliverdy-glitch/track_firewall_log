import assert from "node:assert/strict";
import test from "node:test";
import { buildChannel, buildTrunk, buildVlan, canonicalInterface, vlanSet, configuredAllowed, SWITCHING_ACTIONS } from "../src/cisco/cisco-switching.js";
import { findCiscoOperation } from "../src/cisco/cisco-operation-registry.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { findCatalogItem } from "../src/commands/catalog/index.js";
import { buildCatalogGuidedBlueprint } from "../src/guided-actions/catalog-guided-blueprint.js";
const header = "Group Port-channel Protocol Ports\n";
const full = header + "5 Po5(SU) LACP Gi1/0/1(P) Gi1/0/2(P)\n";
const p = { groupId: 5, interfaces: "Gi1/0/1,Gi1/0/2", accessVlanId: 10, allowedVlans: "10,20-21", nativeVlanId: 1, acknowledgeDisruption: true };
const cfg = (name: string, mode = "access", extra = "") => `interface ${canonicalInterface(name)}\n switchport mode ${mode}\n${mode === "access" ? " switchport access vlan 10\n" : " switchport trunk allowed vlan 10,20-21\n"}${extra}\n`;
const precheck = (specs: ReturnType<typeof buildChannel>, id: string) => { const spec = specs.find(s => s.commandId === id); assert.ok(spec?.validateOutput, id); return spec.validateOutput; };
const verify = (specs: ReturnType<typeof buildChannel>) => precheck(specs, "etherchannel.verify.summary");
test("every switching operation has a registered planner/template and Persian parameters", () => {
  for (const action of SWITCHING_ACTIONS) {
    const item = findCatalogItem("cisco." + action.slug);
    assert.equal(item?.implementationState, "implemented");
    assert.equal(getExecutionTemplate(item!.executionTemplateRef!)?.connectorType, "cisco-ios-xe-ssh");
    assert.equal(findCiscoOperation(item!.id)?.titleFa, action.title);
  }
  assert.equal(findCatalogItem("cisco.add-trunk-vlans")?.requiredParams.find(f => f.key === "allowedVlans")?.type, "string");
  const blueprint = buildCatalogGuidedBlueprint("catalog:cisco.add-etherchannel-members")!;
  const fields = blueprint.steps.flatMap(s => s.fields);
  assert.equal(fields.find(f => f.key === "portMode")?.type, "select");
  assert.deepEqual(fields.find(f => f.key === "nativeVlanId")?.dependsOn, { portMode: "trunk" });
  assert.equal(fields.find(f => f.key === "accessVlanId")?.required, true);
});
test("VLAN lists reject injection, out-of-range and malformed values without silent cleanup", () => {
  assert.deepEqual([...vlanSet("10,20-22")], [10,20,21,22]);
  for (const text of ["", "10;reload", "10-9", "0", "4095", "10,foo", "1,,2", "2-4095", "10\nend"]) assert.throws(() => vlanSet(text));
  assert.equal(vlanSet("all").size, 4094); assert.equal(vlanSet("none").size, 0);
  assert.deepEqual([...configuredAllowed(" switchport trunk allowed vlan 10,20\n switchport trunk allowed vlan add 30\n switchport trunk allowed vlan remove 10\n")], [20,30]);
  assert.throws(() => canonicalInterface("Gi1/0/1;shutdown"));
});
test("LACP creation checks all evidence before writing and rejects orphan/speed/security conflicts", () => {
  const specs = buildChannel("create-trunk", { ...p, enableMembers: true, lacpMode: "passive" });
  const firstWrite = specs.findIndex(s => s.write);
  assert.ok(firstWrite >= 6); assert.ok(specs.slice(0, firstWrite).every(s => s.strict && s.validateOutput));
  assert.ok(specs.some(s => s.command === "channel-group 5 mode passive"));
  assert.equal(specs.filter(s => s.command === "no shutdown").length, 2);
  assert.throws(() => precheck(specs, "etherchannel.precheck.summary")(full));
  assert.throws(() => precheck(specs, "etherchannel.precheck.orphan")("version 15.2\ninterface Port-channel5\nend\n"));
  assert.throws(() => precheck(specs, "etherchannel.precheck.port.0")(cfg("Gi1/0/1", "access", " channel-group 7 mode active")));
  assert.throws(() => precheck(specs, "etherchannel.precheck.port.0")(cfg("Gi1/0/1", "access", " authentication port-control auto")));
  assert.throws(() => precheck(specs, "etherchannel.precheck.links")("Port Name Status Vlan Duplex Speed Type\nGi1/0/1  connected 10 a-full a-1000 copper\nGi1/0/2  connected 10 a-full a-100 copper\n"));
});
test("EtherChannel succeeds only with LACP SU and every requested member P", () => {
  const specs = buildChannel("create-access", p);
  verify(specs)(full);
  for (const bad of [full.replace("SU", "SD"), full.replace("LACP", "PAgP"), full.replace("Gi1/0/2(P)", "Gi1/0/2(I)"), full.replace(" Gi1/0/2(P)", ""), ""]) assert.throws(() => verify(specs)(bad));
  precheck(specs, "etherchannel.verify.port.0")(cfg("Gi1/0/1", "access", " channel-group 5 mode active"));
  assert.throws(() => precheck(specs, "etherchannel.verify.port.0")(cfg("Gi1/0/1", "access", " channel-group 8 mode active")));
  assert.throws(() => buildChannel("create-trunk", { ...p, lacpMode: "on" }));
});
test("adding members preserves existing membership and requires matching group settings", () => {
  const specs = buildChannel("add-members", { ...p, interfaces: "Gi1/0/3", portMode: "access" });
  precheck(specs, "etherchannel.precheck.summary")(full);
  precheck(specs, "etherchannel.precheck.group")(cfg("Po5"));
  verify(specs)(full.trimEnd() + " Gi1/0/3(P)\n");
  assert.throws(() => verify(specs)(header + "5 Po5(SU) LACP Gi1/0/3(P)\n"));
  assert.throws(() => precheck(specs, "etherchannel.precheck.group")(cfg("Po5", "trunk")));
  const duplicate = buildChannel("add-members", { ...p, interfaces: "Gi1/0/1", portMode: "access" });
  assert.throws(() => precheck(duplicate, "etherchannel.precheck.summary")(full));
});
test("removing members shuts only detached ports and refuses removing the last member", () => {
  const specs = buildChannel("remove-members", { ...p, interfaces: "Gi1/0/2" });
  precheck(specs, "etherchannel.precheck.summary")(full);
  assert.ok(specs.some(s => s.command === "shutdown"));
  assert.ok(!specs.some(s => s.command === "no shutdown" || s.command === "default interface"));
  precheck(specs, "etherchannel.verify.port.0")(cfg("Gi1/0/2", "access", " shutdown"));
  verify(specs)(header + "5 Po5(SU) LACP Gi1/0/1(P)\n");
  assert.throws(() => precheck(buildChannel("remove-members", p), "etherchannel.precheck.summary")(full));
});
test("editing and deleting a group require its exact complete member list", () => {
  const edit = buildChannel("edit-trunk", p);
  precheck(edit, "etherchannel.precheck.summary")(full);
  assert.throws(() => precheck(edit, "etherchannel.precheck.summary")(full.trimEnd() + " Gi1/0/3(P)\n"));
  const del = buildChannel("delete", p);
  precheck(del, "etherchannel.precheck.summary")(full);
  assert.ok(del.some(s => s.command === "no interface Port-channel5"));
  assert.equal(del.filter(s => s.command === "shutdown").length, 2);
  verify(del)(header); assert.throws(() => verify(del)(full));
});
test("trunk add/remove verify the complete effective set and retain unrelated VLANs", () => {
  for (const action of ["add", "remove"] as const) {
    const specs = buildTrunk(action, { ...p, interfaceName: "Gi1/0/3", allowedVlans: "30" });
    const before = cfg("Gi1/0/3", "trunk").replace("10,20-21", action === "add" ? "10,20" : "10,20,30");
    precheck(specs, "trunk.precheck.interface")(before);
    assert.ok(specs.some(s => s.command === `switchport trunk allowed vlan ${action} 30`));
    const expected = before.replace(/allowed vlan [\d,]+/, `allowed vlan ${action === "add" ? "10,20,30" : "10,20"}`);
    precheck(specs, "trunk.verify.interface")(expected);
    assert.throws(() => precheck(specs, "trunk.verify.interface")(expected.replace("10,20", "10")));
    assert.throws(() => precheck(specs, "trunk.precheck.interface")(before + " channel-group 5 mode active\n"));
  }
});
test("VLAN create/rename/delete verify values and prevent VTP or dependent deletion", () => {
  const create = buildVlan("create", { vlanId: 10, name: "Office" });
  precheck(create, "vlan.precheck.vtp")("VTP Operating Mode : Transparent");
  assert.throws(() => precheck(create, "vlan.precheck.vtp")("VTP Operating Mode : Client"));
  precheck(create, "vlan.verify.database")("VLAN Name Status Ports\n10 Office active\n");
  assert.throws(() => precheck(create, "vlan.verify.database")("VLAN Name Status Ports\n10 Other active\n"));
  const del = buildVlan("delete", { vlanId: 10, acknowledgeDisruption: true });
  for (const body of ["interface Vlan10", "interface GigabitEthernet1/0/1\n switchport access vlan 10", "interface GigabitEthernet1/0/1\n switchport mode trunk"]) assert.throws(() => precheck(del, "vlan.precheck.references")(`version 15.2\n${body}\nend\n`));
  for (const id of [1, 1002, 1003, 1004, 1005]) assert.throws(() => buildVlan("delete", { vlanId: id, acknowledgeDisruption: true }));
  assert.throws(() => buildVlan("rename", { vlanId: 10, name: "Office\nend" }));
});
