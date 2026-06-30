import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ActionPlanStatus, ActionType, AiRiskLevel } from "@prisma/client";
import {
  FORTIGATE_COMMAND_CATALOG,
  LINUX_COMMAND_CATALOG,
  MIKROTIK_COMMAND_CATALOG,
  PFSENSE_COMMAND_CATALOG,
  VENDOR_COMMAND_CATALOG
} from "../src/actions/catalog/index.js";
import { routeCatalogIntent } from "../src/actions/intent-router.js";
import { approvalRequirements, executionApprovalError } from "../src/services/action-plan.service.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";

test("vendor catalogs expose complete controlled-action metadata", () => {
  assert.ok(MIKROTIK_COMMAND_CATALOG.length >= 25);
  assert.ok(FORTIGATE_COMMAND_CATALOG.length >= 20);
  assert.ok(LINUX_COMMAND_CATALOG.length >= 12);
  assert.ok(PFSENSE_COMMAND_CATALOG.length >= 10);
  for (const entry of VENDOR_COMMAND_CATALOG) {
    assert.ok(entry.id && entry.vendor && entry.title && entry.category && entry.actionType);
    assert.ok(Array.isArray(entry.aliases) && entry.aliases.length > 0);
    assert.ok(Array.isArray(entry.examples) && entry.examples.length > 0);
    assert.ok(Array.isArray(entry.requiredParams));
    assert.ok(Array.isArray(entry.optionalParams));
    assert.ok(entry.plannerHandler && entry.executorHandler && entry.auditLabel);
    assert.equal(typeof entry.readOnly, "boolean");
    assert.equal(typeof entry.rollback.available, "boolean");
  }
});

test("catalog routing handles common MikroTik prompts before AI", () => {
  const summary = routeCatalogIntent("MikroTik: show firewall summary");
  assert.equal(summary.catalogEntry?.id, "mikrotik.read_firewall_summary");
  assert.equal(summary.aiRequired, false);

  const block = routeCatalogIntent("MikroTik: block 185.10.10.10");
  assert.equal(block.parsedIntent?.intentType, ActionType.mikrotik_block_ip_temporary);
  assert.equal(block.parsedIntent?.parameters.sourceIp, "185.10.10.10");

  const ssh = routeCatalogIntent("میکروتیک: پورت SSH را به ۷۵۶ تغییر بده");
  assert.equal(ssh.catalogEntry?.id, "mikrotik.change_service_port");
  assert.equal(ssh.parsedIntent?.parameters.newPort, 756);

  const forward = routeCatalogIntent("MikroTik: add port forward 443 to 192.168.1.10");
  assert.equal(forward.catalogEntry?.id, "mikrotik.add_port_forward");
  assert.equal(forward.parsedIntent?.parameters.toAddress, "192.168.1.10");
  assert.equal(forward.parsedIntent?.parameters.dstPort, 443);
});

test("catalog routing handles common FortiGate prompts before AI", () => {
  const address = routeCatalogIntent("FortiGate: create address object for 192.168.8.2");
  assert.equal(address.parsedIntent?.intentType, ActionType.fortigate_create_address_object);
  assert.equal(address.parsedIntent?.parameters.sourceIp, "192.168.8.2");

  const vip = routeCatalogIntent("FortiGate: create VIP for port 443 to internal IP 192.168.8.10");
  assert.equal(vip.parsedIntent?.intentType, ActionType.fortigate_create_vip);
  assert.equal(vip.parsedIntent?.parameters.mappedIp, "192.168.8.10");
  assert.equal(vip.parsedIntent?.parameters.externalPort, 443);

  const policy = routeCatalogIntent("FortiGate: create policy from LAN to WAN allow HTTP and HTTPS for 192.168.1.50 with NAT and logging");
  assert.equal(policy.parsedIntent?.intentType, ActionType.fortigate_create_policy);
  assert.equal(policy.parsedIntent?.parameters.srcInterface, "lan");
  assert.equal(policy.parsedIntent?.parameters.dstInterface, "wan");
  assert.deepEqual(policy.parsedIntent?.parameters.services, ["HTTP", "HTTPS"]);
  assert.equal(policy.aiRequired, false);
});

test("direct controlled mode skips approval only for catalog actions", () => {
  assert.deepEqual(approvalRequirements(AiRiskLevel.high, "direct_controlled"), {
    typedApprove: false,
    breakGlass: false,
    reason: false,
    approveAndExecute: true,
    executionMode: "direct_controlled"
  });
  assert.equal(executionApprovalError({ actionType: ActionType.mikrotik_change_service_port, status: ActionPlanStatus.dry_run_ready }, "direct_controlled"), null);
  assert.equal(executionApprovalError({ actionType: ActionType.create_egress_policy, status: ActionPlanStatus.proposed }, "direct_controlled")?.code, "ACTION_NOT_APPROVED");
});

test("raw commands do not become executable catalog actions", () => {
  const routed = routeCatalogIntent("MikroTik execute raw command /user add name=hacker");
  assert.notEqual(routed.status, "matched");
  assert.equal(parseAiIntent("MikroTik execute raw command /user add name=hacker")?.intentType, "unknown");
});

test("Action Center exposes Execute and hides manual preview/approval UX", () => {
  const source = readFileSync(new URL("../../src/components/actions/ActionCenterPanel.tsx", import.meta.url), "utf8");
  assert.match(source, />\s*Execute\s*</);
  assert.doesNotMatch(source, /Approve\s*&(?:amp;)?\s*Execute/i);
  assert.doesNotMatch(source, /Run Dry-run|Dry-run only|Type APPROVE/i);
});

test("controlled execution records command-plan and result audit events", () => {
  const source = readFileSync(new URL("../src/services/action-plan.service.ts", import.meta.url), "utf8");
  assert.match(source, /command_plan_generated/);
  assert.match(source, /execution_succeeded/);
  assert.match(source, /controlled_execution_blocked/);
  assert.match(source, /connector\.execute/);
});

