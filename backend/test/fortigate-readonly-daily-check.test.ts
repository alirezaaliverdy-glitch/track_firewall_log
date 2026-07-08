import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { compileFortiGateAction } from "../src/services/fortigate-command-compiler.js";
import { buildDailyCheckResult } from "../src/daily-check/daily-check-engine.js";
import { getVendorDailyCheckProfile } from "../src/daily-check/vendor-daily-check-profiles.js";

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
  assert.equal(result.overallStatus, "critical");
  assert.ok(result.sections.every((section) => /[\u0600-\u06ff]/.test(section.titleFa)));
});
