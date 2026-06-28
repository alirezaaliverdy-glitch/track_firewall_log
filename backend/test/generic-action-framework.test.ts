import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiIntentType, AiRiskLevel } from "@prisma/client";
import { ACTION_CATALOG, getActionCatalogEntry, validateCatalogParameters } from "../src/actions/action-catalog.js";
import { normalizeActionType, normalizeIntent } from "../src/actions/intent-normalizer.js";
import { isValidIpv4, isValidIpv4Cidr, isValidPort, isValidPortRange, isValidProtocol } from "../src/actions/action-validators.js";
import { approvalInputError, approvalRequirements, withPlanIdentity } from "../src/services/action-plan.service.js";
import { approvalPreconditionError, mergeCorrectedParameters } from "../src/services/action-plan.service.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";
import { resolveDeviceFromCandidates } from "../src/services/ai-normalization.js";
import { validateFortiGateAction } from "../src/actions/fortigate-action-catalog.js";
import { validateMikroTikAction } from "../src/actions/mikrotik-action-catalog.js";
import { ActionPlanStatus } from "@prisma/client";
import { actionExecutionUiState } from "../../src/lib/actionApprovalState.js";
import { discoverMikroTikSshValues, suggestAllowedSource } from "../src/services/action-preflight.service.js";

test("canonical normalization maps vendor, action, and legacy fields", () => {
  const intent = normalizeIntent({
    vendor: "Fortinet",
    actionType: "create firewall policy",
    targetDeviceId: "fg-1",
    srcIP: "10.0.0.1",
    dstCidr: "192.168.0.0/24",
    srcintf: "lan",
    dstintf: "wan",
    log: true
  });
  assert.equal(intent.vendor, "fortigate");
  assert.equal(intent.actionType, ActionType.fortigate_create_policy);
  assert.equal(intent.deviceId, "fg-1");
  assert.equal(intent.sourceIp, "10.0.0.1");
  assert.equal(intent.destinationCidr, "192.168.0.0/24");
  assert.equal(intent.srcInterface, "lan");
  assert.equal(intent.dstInterface, "wan");
  assert.equal(intent.logTraffic, true);
  assert.equal(normalizeIntent({ vendor: "m" }).vendor, undefined);
  assert.equal(normalizeActionType("change service port", "mikrotik"), ActionType.mikrotik_change_service_port);
});

test("generic trusted source and source/destination aliases map by value shape", () => {
  const normalized = normalizeIntent({
    vendor: "mikrotik",
    actionType: "mikrotik_change_service_port",
    "trusted source": "192.168.1.0/24",
    source: "10.0.0.8",
    dst: "172.16.0.0/16",
    "new port": "22022",
    service: "SSH"
  });
  assert.equal(normalized.trustedSourceCidr, "192.168.1.0/24");
  assert.equal(normalized.sourceIp, "10.0.0.8");
  assert.equal(normalized.destinationCidr, "172.16.0.0/16");
  assert.equal(normalized.newPort, 22022);
  assert.equal(normalized.serviceName, "ssh");

  const policy = normalizeIntent({ vendor: "fortigate", actionType: "fortigate_create_policy", from: "LAN", destination: "WAN" });
  assert.equal(policy.srcInterface, "LAN");
  assert.equal(policy.dstInterface, "WAN");
});

test("shared network and port validators reject malformed input", () => {
  assert.equal(isValidIpv4("192.168.1.10"), true);
  assert.equal(isValidIpv4("192.168.1.999"), false);
  assert.equal(isValidIpv4Cidr("192.168.1.0/24"), true);
  assert.equal(isValidIpv4Cidr("10.0.0.0/8"), true);
  assert.equal(isValidIpv4Cidr("192.168.1.0/99"), false);
  assert.equal(isValidPort(22022), true);
  assert.equal(isValidPort(70000), false);
  assert.equal(isValidPortRange("80,443"), true);
  assert.equal(isValidPortRange("443-80"), false);
  assert.equal(isValidProtocol("tcp"), true);
  assert.equal(isValidProtocol("random"), false);
});

test("central catalog describes both vendors and management safeguards", () => {
  assert.ok(ACTION_CATALOG.some((entry) => entry.vendor === "mikrotik"));
  assert.ok(ACTION_CATALOG.some((entry) => entry.vendor === "fortigate"));
  assert.equal(getActionCatalogEntry(ActionType.fortigate_create_static_route, "fortigate")?.riskLevel, AiRiskLevel.high);
  assert.equal(getActionCatalogEntry(ActionType.fortigate_list_interfaces, "fortigate")?.requiresApproval, false);
  const ssh = getActionCatalogEntry(ActionType.mikrotik_change_service_port, "mikrotik");
  assert.ok(ssh);
  assert.equal(ssh.riskLevel, AiRiskLevel.high);
  assert.equal(ssh.supportsDryRun, true);
  assert.equal(ssh.supportsExecution, true);
  assert.deepEqual(ssh.preflightParameters.map((field) => field.name), ["oldPort", "trustedSourceCidr"]);
  assert.deepEqual(ssh.requiredFields, ["deviceId", "vendor", "actionType", "serviceName", "newPort"]);
  assert.deepEqual(ssh.preflightFields, ["oldPort", "trustedSourceCidr"]);
  const invalid = validateCatalogParameters(ssh, { serviceName: "ssh", newPort: 22022 });
  assert.equal(invalid.valid, true);
  assert.equal(invalid.fieldErrors.length, 0);
});

test("failed validation blocks approval and canonical field fixes can be revalidated", () => {
  const blocked = approvalPreconditionError({ actionType: ActionType.mikrotik_change_service_port, status: ActionPlanStatus.validation_failed, dryRunJson: null });
  assert.equal(blocked?.code, "DRY_RUN_REQUIRED");

  const broken = validateMikroTikAction({
    actionType: ActionType.mikrotik_change_service_port,
    riskLevel: AiRiskLevel.high,
    parametersJson: { serviceName: "ssh", newPort: 22022, trustedSourceCidr: "192.168.1.0/99" }
  });
  assert.equal(broken.valid, false);
  const corrected = mergeCorrectedParameters(ActionType.mikrotik_change_service_port, { serviceName: "ssh", newPort: 22022, trustedSourceCidr: "192.168.1.0/99" }, { trustedSourceCidr: "192.168.1.0/24" });
  const valid = validateMikroTikAction({ actionType: ActionType.mikrotik_change_service_port, riskLevel: AiRiskLevel.high, parametersJson: corrected });
  assert.equal(valid.valid, true);
  assert.match(valid.commandSpecs[0].command, /src-address="192\.168\.1\.0\/24"/);
  assert.match(valid.commandSpecs[1].command, /port=22022/);
});

test("MikroTik SSH preflight discovers current port and reuses the existing allowed source", () => {
  const found = discoverMikroTikSshValues({
    services: ["0 name=ssh port=222 address=0.0.0.0/0"],
    firewallFilterRules: ["0 chain=input action=accept protocol=tcp src-address=192.168.1.0/24 dst-port=222"]
  }, 22);
  assert.deepEqual(found, { currentPort: 222, trustedSourceCidr: "192.168.1.0/24" });

  const validation = validateMikroTikAction({
    actionType: ActionType.mikrotik_change_service_port,
    riskLevel: AiRiskLevel.high,
    parametersJson: { service: "ssh", newPort: 756, oldPort: found.currentPort, trustedSourceCidr: found.trustedSourceCidr }
  });
  assert.equal(validation.valid, true);
  assert.match(validation.commandSpecs[0].command, /dst-port=756/);
  assert.match(validation.commandSpecs[1].command, /port=756/);
  assert.match(validation.commandSpecs[2].command, /print where name=ssh/);
});

test("missing trusted source produces one Allowed source value with a device subnet suggestion", () => {
  const found = discoverMikroTikSshValues({ services: ["0 name=ssh port=222"], firewallFilterRules: [] }, 22);
  assert.equal(found.trustedSourceCidr, undefined);
  assert.equal(suggestAllowedSource("192.168.1.2"), "192.168.1.0/24");
  const ui = actionExecutionUiState({
    status: "validation_failed",
    validationJson: { valid: false, errors: ["Allowed source is required for SSH management changes."], missingFields: ["trustedSourceCidr"], userMessage: "Allowed source is required for SSH management changes." },
    dryRunJson: {}, parametersJson: {}
  } as never);
  assert.equal(ui.state, "needs_value");
  assert.equal(ui.missingField, "trustedSourceCidr");
});

test("FortiGate address objects accept CIDR through canonical fields", () => {
  const parameters = mergeCorrectedParameters(ActionType.fortigate_create_address_object, { name: "office_lan" }, { sourceCidr: "192.168.8.0/24" });
  const result = validateFortiGateAction({ actionType: ActionType.fortigate_create_address_object, riskLevel: AiRiskLevel.low, parametersJson: parameters });
  assert.equal(result.valid, true);
  assert.match(result.commandSpecs[0].command, /set subnet 192\.168\.8\.0 255\.255\.255\.0/);
});

test("FortiGate policy accepts zones, services, source IP, NAT, and logging", () => {
  const parameters = mergeCorrectedParameters(ActionType.fortigate_create_policy, { name: "office-web", disabled: true }, {
    srcZone: "LAN",
    dstZone: "WAN",
    sourceIp: "192.168.1.50",
    services: ["HTTP", "HTTPS"],
    schedule: "always",
    nat: true,
    logTraffic: true
  });
  const result = validateFortiGateAction({ actionType: ActionType.fortigate_create_policy, riskLevel: AiRiskLevel.high, parametersJson: parameters });
  assert.equal(result.valid, true);
  assert.match(result.commandSpecs[0].command, /config firewall address[\s\S]*config firewall policy/);
  assert.match(result.commandSpecs[0].command, /set srcintf "LAN"/);
  assert.match(result.commandSpecs[0].command, /set dstintf "WAN"/);
  assert.match(result.commandSpecs[0].command, /set service "HTTP" "HTTPS"/);
  assert.match(result.commandSpecs[0].command, /set nat enable/);
  assert.match(result.commandSpecs[0].command, /set logtraffic all/);
});

test("generic device resolution auto-selects one and requests a selector for many", () => {
  const devices = [
    { id: "mt-1", name: "core", vendor: "MikroTik", host: "10.0.0.1", type: "mikrotik" },
    { id: "mt-2", name: "branch", vendor: "RouterOS", host: "10.0.0.2", type: "mikrotik" },
    { id: "fg-1", name: "edge", vendor: "Fortinet", host: "10.0.0.3", type: "fortigate" }
  ];
  const one = resolveDeviceFromCandidates(devices, { vendor: "forti" });
  assert.equal(one.status, "resolved");
  if (one.status === "resolved") assert.equal(one.deviceId, "fg-1");
  const many = resolveDeviceFromCandidates(devices, { vendor: "mikrotik" });
  assert.equal(many.status, "selection_required");
  assert.equal(many.candidates.length, 2);
  const none = resolveDeviceFromCandidates([], { vendor: "mikrotik" });
  assert.equal(none.status, "not_found");
  assert.equal(none.message, "No device found. Add one in Device Registry.");
});

test("generic prompt parsing covers MikroTik and FortiGate action families", () => {
  const block = parseAiIntent("MikroTik: block 185.10.10.10 for 1 hour");
  assert.equal(block?.intentType, AiIntentType.mikrotik_block_ip_temporary);
  assert.equal(block?.parameters.timeout, "1h");
  assert.equal(parseAiIntent("MikroTik add firewall rule allow tcp port 443 in forward")?.intentType, AiIntentType.mikrotik_create_filter_rule);
  const allow = parseAiIntent("MikroTik: allow tcp 443 from 192.168.1.0/24");
  assert.equal(allow?.intentType, AiIntentType.mikrotik_create_filter_rule);
  assert.equal(allow?.parameters.sourceCidr, "192.168.1.0/24");
  assert.equal(allow?.parameters.port, 443);
  const allowValidation = validateMikroTikAction({ actionType: ActionType.mikrotik_create_filter_rule, riskLevel: AiRiskLevel.medium, parametersJson: allow?.parameters ?? {} });
  assert.equal(allowValidation.valid, true);
  assert.match(allowValidation.commandSpecs[0].command, /src-address="192\.168\.1\.0\/24"/);
  const address = parseAiIntent("FortiGate: create address object for 192.168.8.2");
  assert.equal(address?.intentType, AiIntentType.fortigate_create_address_object);
  assert.equal(address?.parameters.sourceIp, "192.168.8.2");
  const policy = parseAiIntent("FortiGate create firewall policy from lan to wan allow HTTPS");
  assert.equal(policy?.intentType, AiIntentType.fortigate_create_policy);
  assert.equal(policy?.parameters.srcintf, "lan");
  assert.equal(policy?.parameters.dstintf, "wan");
  const fullPolicy = parseAiIntent("FortiGate: create policy from LAN to WAN allow HTTP and HTTPS for 192.168.1.50 with NAT and logging");
  assert.equal(fullPolicy?.intentType, AiIntentType.fortigate_create_policy);
  assert.deepEqual(fullPolicy?.parameters.services, ["HTTP", "HTTPS"]);
  assert.equal(fullPolicy?.parameters.sourceIp, "192.168.1.50");
  assert.equal(fullPolicy?.parameters.nat, true);
  assert.equal(fullPolicy?.parameters.logTraffic, true);
  const vip = parseAiIntent("FortiGate create VIP 203.0.113.5 port 8443 to 10.0.0.8 port 443");
  assert.equal(vip?.intentType, AiIntentType.fortigate_create_vip);
  assert.equal(vip?.parameters.externalIp, "203.0.113.5");
  assert.equal(vip?.parameters.mappedIp, "10.0.0.8");
});

test("FortiGate VIP aliases normalize and validate after the missing external IP is supplied", () => {
  const parsed = parseAiIntent("FortiGate: create VIP for port 443 to internal IP 192.168.8.10");
  assert.equal(parsed?.intentType, AiIntentType.fortigate_create_vip);
  assert.deepEqual(parsed?.parameters.missingFields, []);
  const parameters = mergeCorrectedParameters(ActionType.fortigate_create_vip, parsed?.parameters ?? {}, { sourceIp: "203.0.113.10" });
  const result = validateFortiGateAction({ actionType: ActionType.fortigate_create_vip, riskLevel: AiRiskLevel.high, parametersJson: parameters });
  assert.equal(result.valid, true);
  assert.match(result.commandSpecs[0].command, /set extip 203\.0\.113\.10/);
  assert.match(result.commandSpecs[0].command, /set mappedip "192\.168\.8\.10"/);
});

test("approval rules support fast low/medium execution and typed high-risk approval", () => {
  assert.equal(approvalRequirements(AiRiskLevel.low).approveAndExecute, true);
  assert.equal(approvalRequirements(AiRiskLevel.medium).approveAndExecute, true);
  assert.match(approvalInputError(AiRiskLevel.high, {}) ?? "", /APPROVE/);
  assert.equal(approvalInputError(AiRiskLevel.high, { approvalConfirmation: "APPROVE" }), null);
  assert.match(approvalInputError(AiRiskLevel.critical, { approvalConfirmation: "APPROVE" }) ?? "", /break-glass/);
  assert.equal(approvalInputError(AiRiskLevel.critical, { approvalConfirmation: "APPROVE", breakGlass: true, reason: "Emergency recovery" }), null);
  assert.equal(approvalInputError(AiRiskLevel.high, {}, "lab_fast"), null);
  assert.match(approvalInputError(AiRiskLevel.high, {}, "safe") ?? "", /Safe mode requires APPROVE/);
  assert.equal(approvalRequirements(AiRiskLevel.high, "lab_fast").approveAndExecute, true);
});

test("ActionPlan identity and understood values are persisted in normalized parameters", () => {
  const parameters = withPlanIdentity(ActionType.mikrotik_change_service_port, {
    serviceName: "ssh", newPort: 756
  }, "mt-1", "mikrotik");
  assert.deepEqual(parameters, {
    serviceName: "ssh", newPort: 756, actionType: ActionType.mikrotik_change_service_port, deviceId: "mt-1", vendor: "mikrotik"
  });
  assert.equal("parameters" in parameters, false);
  assert.equal("sourceIp" in parameters, false);
  assert.equal("trustedSourceCidr" in parameters, false);
});

test("FortiGate complete actions use the same one-click ready state", () => {
  for (const actionType of [ActionType.fortigate_create_address_object, ActionType.fortigate_create_vip]) {
    const state = actionExecutionUiState({ status: "proposed", actionType, validationJson: {}, dryRunJson: {}, parametersJson: {} } as never);
    assert.equal(state.state, "ready");
    assert.equal(state.canApproveAndExecute, true);
  }
});

test("Action Center eligibility hides execution for invalid plans and enables valid fresh previews", () => {
  const invalid = actionExecutionUiState({ status: "validation_failed", validationJson: { valid: false, errors: ["sourceIp is required"] }, dryRunJson: {}, parametersJson: {} } as never);
  assert.equal(invalid.canApproveAndExecute, false);
  const parameters = { sourceIp: "185.10.10.10" };
  const valid = actionExecutionUiState({ status: "dry_run_ready", validationJson: { valid: true, errors: [], missingFields: [] }, dryRunJson: { status: "planned", executable: true, parameters }, parametersJson: parameters } as never);
  assert.equal(valid.canApproveAndExecute, true);
  const stale = actionExecutionUiState({ status: "dry_run_ready", validationJson: { valid: true, errors: [], missingFields: [] }, dryRunJson: { status: "planned", executable: true, parameters: { sourceIp: "1.1.1.1" } }, parametersJson: parameters } as never);
  assert.equal(stale.canApproveAndExecute, false);
  assert.match(stale.reason ?? "", /changed after its preview/);
});
