import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { COMMAND_CATALOG } from "../src/commands/catalog/index.js";
import { validateFortiGateAction } from "../src/actions/fortigate-action-catalog.js";
import { assertNoFortiGateCliFailure, verifyFortiGateGuidedVpn } from "../src/fortigate/execution-verifier.js";
import { validateFortiGateGuidedVpnParameters } from "../src/services/fortigate-guided-vpn.schema.js";

const vpnParams = {
  vendor: "fortigate",
  vpnType: "ipsec_site_to_site",
  vpnName: "task17-7-vpn",
  phase1Name: "task17-7-vpn",
  phase2Name: "task17-7-vpn-p2",
  wanInterface: "wan1",
  lanInterface: "internal1",
  remoteGateway: "203.0.113.77",
  localSubnet: "192.168.77.0/24",
  remoteSubnet: "10.77.0.0/24",
  pskSecretRef: "secret-ref",
  proposal: "aes256-sha256",
  dhGroup: "14",
  ikeVersion: "2",
  createFirewallPolicy: true,
  createStaticRoute: true,
  natEnabled: false,
  logTraffic: true,
};

function command(template: string, stdout: string) {
  return { template, stdout, stderr: "", exitCode: 0 };
}

function verifiedVpnOutputs(overrides: Partial<typeof vpnParams> = {}) {
  const params = { ...vpnParams, ...overrides };
  return [
    command("verify show vpn ipsec phase1-interface", [
      `edit "${params.phase1Name}"`,
      `set interface "${params.wanInterface}"`,
      `set proposal ${params.proposal}`,
      `set remote-gw ${params.remoteGateway}`,
    ].join("\n")),
    command("verify show vpn ipsec phase2-interface", [
      `edit "${params.phase2Name}"`,
      `set phase1name "${params.phase1Name}"`,
      `set proposal ${params.proposal}`,
      "set src-subnet 192.168.77.0 255.255.255.0",
      "set dst-subnet 10.77.0.0 255.255.255.0",
    ].join("\n")),
    command("verify show firewall policy", [
      `set name "${params.vpnName}-lan-to-vpn"`,
      `set srcintf "${params.lanInterface}"`,
      `set dstintf "${params.phase1Name}"`,
      "set action accept",
      'set schedule "always"',
      'set service "ALL"',
      "set nat disable",
      "set logtraffic all",
      `set name "${params.vpnName}-vpn-to-lan"`,
      `set srcintf "${params.phase1Name}"`,
      `set dstintf "${params.lanInterface}"`,
      "set action accept",
      'set schedule "always"',
      'set service "ALL"',
      "set nat disable",
      "set logtraffic all",
    ].join("\n")),
    command("verify get router info routing-table all", `S 10.77.0.0/24 [10/0] is directly connected, ${params.phase1Name}`),
    command("verify get vpn ipsec tunnel summary", `${params.phase1Name} selectors(total,up): 1/0 rx/tx`),
  ];
}

test("FortiGate guided VPN preserves AES256-SHA256 and never emits DES/MD5/SHA1 defaults", () => {
  const validation = validateFortiGateAction({ actionType: ActionType.fortigate_guided_vpn_setup, riskLevel: AiRiskLevel.high, parametersJson: vpnParams });
  assert.equal(validation.valid, true, validation.errors.join(", "));
  const commands = validation.commandSpecs.map((spec) => spec.command).join("\n").toLowerCase();
  assert.match(commands, /set proposal aes256-sha256/);
  assert.doesNotMatch(commands, /des-md5|des-sha1|\bmd5\b|set proposal\s+(?:des|3des)/);
  assert.match(commands, /show vpn ipsec phase1-interface task17-7-vpn/);
  assert.match(commands, /show vpn ipsec phase2-interface task17-7-vpn-p2/);
  assert.match(commands, /show firewall policy \| grep -f task17-7-vpn/);
  assert.match(commands, /get router info routing-table all \| grep 10\.77\.0\.0\/24/);
});

test("FortiGate guided VPN rejects weak proposals unless explicitly allowed", () => {
  for (const proposal of ["des-md5", "des-sha1", "aes256-md5", "aes128-sha1"]) {
    const result = validateFortiGateGuidedVpnParameters({ ...vpnParams, proposal });
    assert.ok(result.issues.some((issue) => issue.field === "proposal"), proposal);
    const validation = validateFortiGateAction({ actionType: ActionType.fortigate_guided_vpn_setup, riskLevel: AiRiskLevel.high, parametersJson: { ...vpnParams, proposal } });
    assert.equal(validation.valid, false, proposal);
  }
});

test("FortiGate guided VPN semantic verification fails when route or policies are missing", () => {
  const missingRoute = verifyFortiGateGuidedVpn(vpnParams, verifiedVpnOutputs().filter((item) => !item.template.includes("routing-table")));
  assert.equal(missingRoute.ok, false);
  assert.equal(missingRoute.checks.find((check) => check.id === "static_route")?.ok, false);

  const missingPolicies = verifyFortiGateGuidedVpn(vpnParams, verifiedVpnOutputs().filter((item) => !item.template.includes("firewall policy")));
  assert.equal(missingPolicies.ok, false);
  assert.equal(missingPolicies.checks.find((check) => check.id === "lan_to_vpn_policy")?.ok, false);
  assert.equal(missingPolicies.checks.find((check) => check.id === "vpn_to_lan_policy")?.ok, false);
});

test("FortiGate guided VPN semantic verification passes with expected phase, route, policy, and tunnel evidence", () => {
  const verification = verifyFortiGateGuidedVpn(vpnParams, verifiedVpnOutputs());
  assert.equal(verification.ok, true);
  assert.equal(verification.checks.every((check) => check.ok), true);
});

test("FortiGate CLI failure detector rejects FortiOS stdout errors even with zero exit code", () => {
  assert.throws(() => assertNoFortiGateCliFailure(command("config firewall address", "Command parse error before 'set'")));
  assert.throws(() => assertNoFortiGateCliFailure(command("config firewall policy", "node_check_object fail! for srcaddr")));
  assert.doesNotThrow(() => assertNoFortiGateCliFailure(command("show system status", "Version: FortiGate-VM64")));
});

test("FortiGate Action Library inventory keeps unsupported write actions out of executable state", () => {
  const fortigateItems = COMMAND_CATALOG.filter((item) => item.vendor === "fortigate");
  assert.ok(fortigateItems.length > 20);
  for (const item of fortigateItems) {
    if (item.supportState !== "verified") {
      assert.equal(item.uiHints.executable, false, item.id);
      continue;
    }
    assert.equal(item.executionSupport, "connector", item.id);
    assert.ok(item.executionTemplateRef, item.id);
    assert.ok(item.connectorType === "fortigate-ssh", item.id);
    assert.ok(item.prechecks.length > 0, item.id);
    assert.ok(item.verification.length > 0, item.id);
    assert.ok(Object.values(item.validationRules).flat().length > 0 || item.requiredParams.length === 0, item.id);
  }
});
