import assert from "node:assert/strict";
import test from "node:test";
import { ActionPlanStatus, ActionType, AiRiskLevel, type ActionPlan, type Device } from "@prisma/client";
import { routeCatalogIntent } from "../src/actions/intent-router.js";
import { compileRouterOsAction } from "../src/services/routeros-command-compiler.js";
import { preflightActionPlan, resolveTrustedManagementSource } from "../src/services/action-preflight.service.js";
import { approvalInputError, executionApprovalError } from "../src/services/action-plan.service.js";

const quick = { quickControlled: true, requireManagementSource: false, defaultTrustedSource: "auto", allowLabUnrestrictedManagement: true };

test("quick mode infers management CIDR from the MikroTik host", () => {
  const resolved = resolveTrustedManagementSource({}, { host: "192.168.7.1", capabilities: {} }, quick);
  assert.deepEqual(resolved, { value: "192.168.7.0/24", autoResolved: true, unrestricted: false, source: "device_host" });
});

test("quick mode uses unrestricted lab fallback as a warning-compatible value", () => {
  const resolved = resolveTrustedManagementSource({}, { host: "router.lab", capabilities: {} }, quick);
  assert.equal(resolved?.value, "0.0.0.0/0");
  assert.equal(resolved?.autoResolved, true);
  assert.equal(resolved?.unrestricted, true);
});

test("MikroTik SSH preflight without trustedSource becomes ready in quick mode", async () => {
  const device = {
    id: "mt-1", host: "192.168.7.1", managementPort: 4432,
    capabilities: { mikrotikStatus: { mikrotik: { services: ["name=ssh port=4432"], firewallFilterRules: ["chain=input action=drop"] } } }
  } as Device;
  const plan = { actionType: ActionType.mikrotik_change_service_port, parametersJson: { serviceName: "ssh", newPort: 653 } } as ActionPlan;
  const result = await preflightActionPlan(plan, device);
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.parameters.oldPort, 4432);
  assert.equal(result.parameters.trustedSource, "192.168.7.0/24");
  assert.equal(result.parameters.trustedSourceAutoResolved, true);
  assert.match(result.warnings?.[0] ?? "", /auto-resolved or unrestricted/);
});

test("quick controlled confirmation needs no typed approval and fixed compiler templates remain in use", () => {
  assert.equal(approvalInputError(AiRiskLevel.high, {}, "quick_controlled"), null);
  assert.equal(executionApprovalError({ actionType: ActionType.mikrotik_change_service_port, status: ActionPlanStatus.dry_run_ready }, "quick_controlled"), null);
  const compiled = compileRouterOsAction({
    actionType: ActionType.mikrotik_change_service_port,
    parameters: { service: "ssh", serviceName: "ssh", oldPort: 4432, newPort: 653, trustedSource: "0.0.0.0/0", trustedSourceAutoResolved: true },
    riskLevel: AiRiskLevel.high
  });
  assert.ok(compiled.commandSpecs.length > 0);
  assert.ok(compiled.commandSpecs.every((spec) => !String(spec.command).includes("curl")));
});

test("raw AI command remains blocked outside the controlled catalog", () => {
  assert.notEqual(routeCatalogIntent("MikroTik execute raw command /system reset-configuration").status, "matched");
});
