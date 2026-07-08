import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { compileFortiGateAction } from "../src/services/fortigate-command-compiler.js";
import { buildDailyCheckResult } from "../src/daily-check/daily-check-engine.js";
import { getVendorDailyCheckProfile } from "../src/daily-check/vendor-daily-check-profiles.js";
import { resolveAiTemplate } from "../src/ai/ai-template-resolver.js";

const expected = [
  "get system status", "get system performance status", "diagnose sys top-summary", "show system interface",
  "get router info routing-table all", "get system dns", "show system fortiguard", "show system admin"
];

test("FortiGate Daily Check compiles only the approved read-only discovery commands", () => {
  const compiled = compileFortiGateAction({ actionType: ActionType.fortigate_daily_check, parameters: {}, riskLevel: AiRiskLevel.low });
  assert.deepEqual(compiled.commandSpecs.map((item) => item.command), expected);
  assert.ok(compiled.commandSpecs.every((item) => item.write === false));
  assert.equal(compiled.requiresBackup, false);
});

test("FortiGate profile is connector-backed and returns Persian structured sections", () => {
  const profile = getVendorDailyCheckProfile("FortiGate");
  assert.equal(profile?.requiredConnector, "fortigate-ssh");
  assert.equal(profile?.implementationState, "implemented");
  const result = buildDailyCheckResult({ deviceId: "fg-1", vendor: "fortigate", outputs: expected.map((command) => ({ template: `fortigate daily check: ${command}`, stdout: command === "show system fortiguard" ? "License status: expired" : "status: ok", exitCode: 0 })) });
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
    [ActionType.fortigate_show_interfaces, ["show system interface", "get system interface"]],
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
