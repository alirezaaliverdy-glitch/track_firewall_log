import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { compileFortiGateAction } from "../src/services/fortigate-command-compiler.js";
import { buildFortiGateDailyCheck, parseFortiGateReadOnlyResult } from "../src/fortigate/readonly-result-parser.js";
import { buildDailyCheckResult } from "../src/daily-check/daily-check-engine.js";
import { getVendorDailyCheckProfile } from "../src/daily-check/vendor-daily-check-profiles.js";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";

const expected = ["get system status", "get system performance status", "show system interface", "get system interface physical", "get router info routing-table all", "get system dns", "show system dns", "show system admin", "show firewall policy", "show firewall address", "show firewall vip", "show firewall ippool", "get vpn ipsec tunnel summary", "diagnose vpn tunnel list", "get vpn ssl monitor", "show vpn ipsec phase1-interface", "show vpn ipsec phase2-interface", "show vpn ssl settings", "get system ha status", "show system ha", "show system vdom", "show system zone"];

test("FortiGate Daily Check compiles only the approved read-only discovery commands", () => {
  const compiled = compileFortiGateAction({ actionType: ActionType.fortigate_daily_check, parameters: {}, riskLevel: AiRiskLevel.low });
  assert.deepEqual(compiled.commandSpecs.map((item) => item.command), expected);
  assert.ok(compiled.commandSpecs.every((item) => item.write === false));
  assert.equal(compiled.requiresBackup, false);
});

test("FortiGate interface parser emits the required evidence/findings/tables contract", () => {
  const result = parseFortiGateReadOnlyResult("fortigate_show_interfaces", [
    { template: "show system interface", stdout: 'config system interface\n edit "wan1"\n set ip 203.0.113.2 255.255.255.0\n set role wan\n set allowaccess ping https ssh\n next\nend', exitCode: 0 },
    { template: "get system interface physical", stdout: "==[wan1]\nstatus: up", exitCode: 0 },
  ]);
  assert.equal(result.rawOutputRef, true);
  assert.equal(result.status, "needs_review");
  assert.equal(result.tables[0]?.rows[0]?.name, "wan1");
  assert.ok(result.findings.some((item) => item.severity === "high"));
});

test("FortiGate daily check has eight evidence-based sections and treats invalid lab license as review", () => {
  const result = buildFortiGateDailyCheck("fg-1", [
    { template: "fortigate daily check: get system status", stdout: "Hostname: lab-fg\nVersion: FortiGate-VM64 v7.4.3,build2573\nLicense Status: Invalid", exitCode: 0 },
    { template: "fortigate daily check: get system performance status", stdout: "CPU states: 3% user\nMemory: 44%", exitCode: 0 },
  ]);
  assert.equal(result.sections.length, 8);
  assert.equal(result.sections.find((item) => item.key === "license")?.status, "needs_review");
  assert.notEqual(result.sections.find((item) => item.key === "vpn")?.status, "critical");
});

test("FortiGate profile is connector-backed and returns Persian structured sections", () => {
  const profile = getVendorDailyCheckProfile("FortiGate");
  assert.equal(profile?.requiredConnector, "fortigate-ssh");
  assert.equal(profile?.implementationState, "implemented");
  const result = buildFortiGateDailyCheck("fg-1", expected.map((command) => ({ template: `fortigate daily check: ${command}`, stdout: command === "get system status" ? "Hostname: fg\nLicense Status: Invalid" : "status: ok", exitCode: 0 })));
  assert.equal(result.sections.find((section) => section.key === "license")?.status, "needs_review");
  assert.ok(result.sections.every((section) => /[\u0600-\u06ff]/.test(section.titleFa)));
});

test("central AI resolver maps Persian FortiGate operational requests to executable templates", () => {
  const device = { id: "fg-1", vendor: "Fortinet", type: "fortigate", protocol: "ssh" };
  const cases = [
    ["وضعیت پورت های فایروال رو نشون بده", "fortigate_show_interfaces"],
    ["وضعیت اینترفیس ها رو نشون بده", "fortigate_show_interfaces"],
    ["route و dns رو چک کن", "fortigate_route_dns_check"],
    ["وضعیت لایسنس و FortiGuard", "fortigate_license_status"],
    ["کاربران ادمین", "fortigate_admin_users"],
    ["چک روزانه FortiGate", "fortigate_daily_check"],
  ] as const;
  for (const [userText, actionType] of cases) {
    const resolution = resolveAiTemplate({ userText, selectedDevice: device });
    assert.equal(resolution.canonicalActionType, actionType);
    assert.equal(resolution.connectorType, "fortigate-ssh");
    assert.equal(resolution.executionSupport, "connector");
    assert.equal(resolution.implementationState, "implemented");
  }
});

test("FortiGate supported checks compile only fixed read-only commands", () => {
  const expectedByAction = new Map([
    [ActionType.fortigate_show_interfaces, ["show system interface", "get system interface physical"]],
    [ActionType.fortigate_route_dns_check, ["get router info routing-table all", "get system dns"]],
    [ActionType.fortigate_license_status, ["get system status", "show system fortiguard"]],
    [ActionType.fortigate_admin_users, ["show system admin"]],
  ]);
  for (const [actionType, commands] of expectedByAction) {
    const compiled = compileFortiGateAction({ actionType, parameters: {}, riskLevel: AiRiskLevel.low });
    assert.deepEqual(compiled.commandSpecs.map((item) => item.command), commands);
    assert.ok(compiled.commandSpecs.every((item) => item.write === false));
  }
});
