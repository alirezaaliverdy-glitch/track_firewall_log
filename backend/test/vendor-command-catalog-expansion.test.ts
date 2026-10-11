import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { findCiscoOperation } from "../src/cisco/cisco-operation-registry.js";
import { findCatalogItem } from "../src/commands/catalog/index.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { validateMikroTikAction } from "../src/actions/mikrotik-action-catalog.js";

const expandedMikroTikCatalogIds = [
  "mikrotik.interfaces", "mikrotik.routes", "mikrotik.address-lists", "mikrotik.dns-settings",
  "mikrotik.dhcp-servers", "mikrotik.dhcp-leases", "mikrotik.resources", "mikrotik.logs",
  "mikrotik.create-filter-rule", "mikrotik.enable-filter-rule", "mikrotik.disable-filter-rule",
  "mikrotik.create-port-forward", "mikrotik.create-masquerade", "mikrotik.enable-nat-rule",
  "mikrotik.disable-nat-rule", "mikrotik.add-static-route", "mikrotik.set-dns-servers",
  "mikrotik.add-static-dhcp-lease", "mikrotik.restrict-management", "mikrotik.change-ssh-port",
  "mikrotik.set-identity", "mikrotik.sanitized-export"
] as const;

test("expanded MikroTik catalog entries are verified and registered", () => {
  for (const id of expandedMikroTikCatalogIds) {
    const item = findCatalogItem(id);
    assert.ok(item, `${id} must exist`);
    assert.equal(item.supportState, "verified", `${id} must be executable`);
    const template = getExecutionTemplate(item.executionTemplateRef);
    assert.equal(template?.actionType, item.actionType);
    assert.equal(template?.connectorType, "mikrotik-ssh");
  }
});

test("MikroTik write operations compile bounded commands with post verification", () => {
  const cases: Array<[ActionType, Record<string, unknown>, RegExp]> = [
    [ActionType.mikrotik_create_filter_rule, { chain: "forward", action: "drop", protocol: "tcp", dstPort: 443, sourceCidr: "192.168.10.0/24" }, /managed filter verification/],
    [ActionType.mikrotik_create_dstnat_rule, { dstPort: 443, toAddress: "192.168.10.20", toPort: 8443, protocol: "tcp" }, /managed dstnat verification/],
    [ActionType.mikrotik_create_srcnat_masquerade_rule, { outInterface: "ether1", srcAddress: "192.168.10.0/24" }, /managed masquerade verification/],
    [ActionType.mikrotik_add_static_route, { dstAddress: "10.20.0.0/16", gateway: "192.168.10.1" }, /static route verification/],
    [ActionType.mikrotik_set_dns_servers, { servers: "1.1.1.1,8.8.8.8" }, /dns verification/],
    [ActionType.mikrotik_add_static_dhcp_lease, { macAddress: "00:11:22:33:44:55", address: "192.168.10.50" }, /dhcp lease verification/],
    [ActionType.mikrotik_restrict_service_by_address, { service: "winbox", address: "192.168.10.0/24" }, /service verification/],
    [ActionType.mikrotik_set_identity, { name: "branch-router-01" }, /identity verification/]
  ];
  for (const [actionType, parametersJson, expectedVerification] of cases) {
    const result = validateMikroTikAction({ actionType, riskLevel: AiRiskLevel.high, parametersJson });
    assert.equal(result.valid, true, `${actionType}: ${result.errors.join(" ")}`);
    assert.ok(result.commandSpecs.some((spec) => spec.write));
    assert.match(result.commandSpecs.at(-1)?.command ?? "", expectedVerification);
    assert.equal(result.commandSpecs.at(-1)?.write, false);
  }
});

test("MikroTik firewall rule input is restricted to supported semantics", () => {
  for (const parametersJson of [
    { chain: "output", action: "drop" },
    { chain: "forward", action: "jump" },
    { chain: "forward", action: "drop", protocol: "gre", dstPort: 443 }
  ]) {
    const result = validateMikroTikAction({ actionType: ActionType.mikrotik_create_filter_rule, riskLevel: AiRiskLevel.high, parametersJson });
    assert.equal(result.valid, false);
  }
});

test("Cisco ACL catalog operations compile exact IOS workflows", () => {
  const create = findCiscoOperation("cisco.create-standard-acl");
  const createCommands = create?.buildCommandSpecs?.({ aclName: "MGMT_ONLY", sequence: 10, action: "permit", sourceCidr: "192.168.10.0/24" }).map((spec) => spec.command) ?? [];
  assert.deepEqual(createCommands, ["configure terminal", "ip access-list standard MGMT_ONLY", "10 permit 192.168.10.0 0.0.0.255", "end", "show ip access-lists MGMT_ONLY"]);

  const apply = findCiscoOperation("cisco.apply-acl-interface");
  const applyCommands = apply?.buildCommandSpecs?.({ interfaceName: "Gi1/0/1", aclName: "MGMT_ONLY", direction: "in" }).map((spec) => spec.command) ?? [];
  assert.ok(applyCommands.includes("ip access-group MGMT_ONLY in"));
  assert.equal(findCatalogItem("cisco.create-standard-acl")?.supportState, "verified");
  assert.equal(findCatalogItem("cisco.remove-standard-acl-entry")?.supportState, "verified");
  assert.equal(findCatalogItem("cisco.apply-acl-interface")?.supportState, "verified");
  assert.equal(findCatalogItem("cisco.remove-acl-interface")?.supportState, "verified");
});
