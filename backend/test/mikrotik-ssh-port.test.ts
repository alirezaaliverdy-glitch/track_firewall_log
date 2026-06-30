import assert from "node:assert/strict";
import test from "node:test";
import { ActionPlanStatus, ActionType, AiIntentType, AiRiskLevel } from "@prisma/client";
import { mikroTikSupportedActions, validateMikroTikAction } from "../src/actions/mikrotik-action-catalog.js";
import { approvalPreconditionError, executionApprovalError, requiresManualApprovalWorkflow } from "../src/services/action-plan.service.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";
import { evaluateMikroTikExpertPolicy } from "../src/services/mikrotik-policy-guard.service.js";
import { publishActionPlanCreated, subscribeToActionPlanCreated } from "../../src/lib/actionPlanHandoff.js";
import { normalizeIntentType, normalizeVendor, resolveDeviceIdFromCandidates } from "../src/services/ai-normalization.js";

function validate(parametersJson: Record<string, unknown>) {
  return validateMikroTikAction({
    actionType: ActionType.mikrotik_change_service_port,
    riskLevel: AiRiskLevel.high,
    parametersJson
  });
}

test("valid MikroTik SSH request maps to a controlled ActionPlan catalog action", () => {
  const intent = parseAiIntent("MikroTik change SSH port to 22022 trusted source 192.168.10.0/24");
  assert.ok(intent);
  assert.equal(intent.intentType, AiIntentType.mikrotik_change_service_port);
  assert.equal(intent.parameters.vendor, "mikrotik");
  assert.equal(intent.parameters.serviceName, "ssh");
  assert.equal(intent.parameters.newPort, 22022);
  assert.equal(intent.parameters.trustedSourceCidr, "192.168.10.0/24");
  assert.ok(mikroTikSupportedActions().includes(intent.intentType as ActionType));
});

test("SSH port intent without an allowed source is still plan-ready for automatic preflight", () => {
  const intent = parseAiIntent("MikroTik: change SSH port to 756");
  assert.equal(intent?.intentType, AiIntentType.mikrotik_change_service_port);
  assert.equal(intent?.parameters.newPort, 756);
  assert.deepEqual(intent?.parameters.missingFields, []);
  assert.deepEqual(intent?.parameters.clarificationQuestions, []);
});

test("MikroTik vendor and SSH action aliases normalize without one-letter fallbacks", () => {
  for (const alias of ["MikroTik", "Mikrotik", "RouterOS", "mt", "mkt", "mikrotik"]) {
    assert.equal(normalizeVendor(alias), "mikrotik");
  }
  assert.equal(normalizeVendor("m"), null);
  for (const alias of ["change_ssh_port", "mikrotik_change_ssh_port", "mikrotik_change_service_port"]) {
    assert.equal(normalizeIntentType(alias, "mikrotik"), AiIntentType.mikrotik_change_service_port);
  }
});

test("deviceId auto-fills only when exactly one MikroTik device exists", () => {
  const mikrotik = { id: "mt-1", name: "m", vendor: "MikroTik", host: "192.168.1.1", type: "mikrotik" };
  const linux = { id: "linux-1", name: "linux", vendor: "Linux", host: "192.168.1.2", type: "linux_edge" };
  assert.equal(resolveDeviceIdFromCandidates([mikrotik, linux], { vendor: "mikrotik", deviceHint: "mikrotik" }), "mt-1");
  assert.equal(resolveDeviceIdFromCandidates([mikrotik, { ...mikrotik, id: "mt-2", name: "branch" }], { vendor: "mikrotik" }), undefined);
  assert.equal(resolveDeviceIdFromCandidates([linux], { vendor: "mikrotik" }), undefined);
});

test("missing trusted source is blocked", () => {
  const result = validate({ service: "ssh", newPort: 22022, oldPort: 22 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Allowed source is required/i);
});

test("invalid and common service ports are blocked", () => {
  const privileged = validate({ service: "ssh", newPort: 443, trustedSourceIp: "192.168.10.5", oldPort: 22 });
  assert.equal(privileged.valid, false);
  assert.match(privileged.errors.join(" "), /reserved for a common/i);

  const requestedLabPort = validate({ service: "ssh", newPort: 756, trustedSourceIp: "192.168.10.5", oldPort: 222 });
  assert.equal(requestedLabPort.valid, true);

  const common = validate({ service: "ssh", newPort: 8080, trustedSourceIp: "192.168.10.5", oldPort: 22 });
  assert.equal(common.valid, false);
  assert.match(common.errors.join(" "), /reserved for a common/i);
});

test("PolicyGuard blocks a port already used by another discovered MikroTik service", () => {
  const plan = {
    id: "plan-test",
    actionType: ActionType.mikrotik_change_service_port,
    riskLevel: AiRiskLevel.high,
    parametersJson: { service: "ssh", newPort: 22022, trustedSourceIp: "192.168.10.5" }
  } as never;
  const device = {
    id: "device-test",
    name: "lab-router",
    managementPort: 22,
    capabilities: {
      mikrotikStatus: {
        mikrotik: { services: ["0 name=ssh port=22", "1 name=custom-admin port=22022"] }
      }
    }
  } as never;
  const policy = evaluateMikroTikExpertPolicy(plan, device);
  assert.equal(policy.valid, false);
  assert.match(policy.errors.join(" "), /already used by MikroTik service custom-admin/i);
  assert.equal(policy.detectedOldPort, 22);
});

test("dry-run commands allow the trusted source before changing SSH and then verify", () => {
  const result = validate({ service: "ssh", newPort: 22022, trustedSourceCidr: "192.168.10.0/24", oldPort: 22 });
  assert.equal(result.valid, true);
  assert.equal(result.commandSpecs.length, 3);
  assert.match(result.commandSpecs[0].command, /firewall filter add/);
  assert.match(result.commandSpecs[0].command, /src-address="192\.168\.10\.0\/24"/);
  assert.match(result.commandSpecs[1].command, /ip service set.*name="ssh".*port=22022/);
  assert.equal(result.commandSpecs[2].command, "/ip service print where name=ssh");
  assert.equal(result.rollbackJson.oldPort, 22);
});

test("execution and approval are blocked before their required states", () => {
  const executionError = executionApprovalError({
    actionType: ActionType.mikrotik_change_service_port,
    status: ActionPlanStatus.dry_run_ready
  }, "safe");
  assert.equal(executionError?.code, "ACTION_NOT_APPROVED");
  assert.equal(executionApprovalError({
    actionType: ActionType.mikrotik_change_service_port,
    status: ActionPlanStatus.approved
  }, "safe"), null);

  const approvalError = approvalPreconditionError({
    actionType: ActionType.mikrotik_change_service_port,
    status: ActionPlanStatus.proposed,
    dryRunJson: null
  });
  assert.equal(approvalError?.code, "DRY_RUN_REQUIRED");
  assert.equal(requiresManualApprovalWorkflow(ActionType.mikrotik_change_service_port), true);
});

test("raw AI commands never become executable intents", () => {
  const intent = parseAiIntent('/ip service set [find name="ssh"] port=22022');
  assert.ok(intent);
  assert.equal(intent.intentType, AiIntentType.unknown);
  assert.equal(intent.parameters.rawCommandRejected, true);

  const validation = validate({
    service: "ssh",
    newPort: 22022,
    trustedSourceIp: "192.168.10.5",
    command: "/ip service set ssh port=22022"
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /raw command/i);
});

test("AI ActionPlan handoff notifies the Action Center", () => {
  const target = new EventTarget();
  let received = "";
  const unsubscribe = subscribeToActionPlanCreated((id) => { received = id; }, target as never);
  publishActionPlanCreated("plan-from-ai", target as never);
  unsubscribe();
  assert.equal(received, "plan-from-ai");
});
