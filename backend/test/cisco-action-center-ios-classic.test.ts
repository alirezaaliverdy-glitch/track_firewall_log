import assert from "node:assert/strict";
import test from "node:test";
import { ActionType, AiRiskLevel } from "@prisma/client";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { findCiscoOperation, executableCiscoOperations } from "../src/cisco/cisco-operation-registry.js";
import { ciscoIosXeConnector } from "../src/connectors/cisco-ios-xe.connector.js";
import { ciscoIosXePlanner } from "../src/connectors/vendors/cisco-ios-xe.planner.js";
import { ciscoIosXeSshConnector, redactCiscoCliOutput, type CiscoCliCommandSpec } from "../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";

function plan(executionTemplateRef: string, normalizedParams: Record<string, unknown> = {}) {
  return {
    id: `plan-${executionTemplateRef}`,
    actionType: ActionType.generic_security_action,
    deviceId: "device-cisco-1",
    credentialRef: null,
    riskLevel: AiRiskLevel.medium,
    parametersJson: {
      vendor: "cisco",
      ...normalizedParams,
      metadata: {
        vendor: "cisco",
        connectorType: "cisco-ios-xe-ssh",
        catalogCommandId: executionTemplateRef,
        executionTemplateRef,
        normalizedParams
      }
    }
  } as never;
}

const device = { id: "device-cisco-1", vendor: "cisco", host: "192.0.2.12", managementPort: 22 } as never;

test("IOS Classic Action Center exposes read-only and safe-write Cisco operations through one registry", () => {
  const executableRefs = new Set(executableCiscoOperations().map((operation) => operation.executionTemplateRef));
  for (const ref of [
    "cisco_show_version", "cisco_show_inventory", "cisco_show_interfaces_summary", "cisco_show_interface_details",
    "cisco_show_ip_interface_brief", "cisco_show_running_config", "cisco_show_startup_config", "cisco_show_route",
    "cisco_show_arp", "cisco_show_mac_table", "cisco_show_vlan_brief", "cisco_show_cpu", "cisco_show_memory",
    "cisco_ping", "cisco_traceroute", "cisco_run_backup", "cisco_save_configuration",
    "cisco_update_interface_description", "cisco_enable_interface", "cisco_disable_interface",
    "cisco_configure_interface_ipv4", "cisco_remove_interface_ipv4", "cisco_create_vlan", "cisco_rename_vlan",
    "cisco_assign_access_vlan", "cisco_configure_trunk_allowed_vlans", "cisco_add_static_route",
    "cisco_remove_static_route", "cisco_configure_ntp_server", "cisco_configure_syslog_server", "cisco_reload_device"
  ]) {
    assert.ok(executableRefs.has(ref), `${ref} should be executable through the existing Cisco registry`);
    assert.equal(getExecutionTemplate(ref)?.connectorType, "cisco-ios-xe-ssh");
  }
  const reload = findCiscoOperation("cisco.reload-device");
  assert.equal(reload?.state, "implemented");
  assert.equal(reload?.buildCommandSpecs?.({})[0]?.command, "reload in 1 reason Firewall-SOAR-approved-action");
  assert.equal(findCiscoOperation("cisco.erase-configuration")?.executionTemplateRef, null);
  const planned = ciscoIosXePlanner.plan({ actionType: ActionType.generic_security_action, riskLevel: AiRiskLevel.medium, device, parameters: plan("cisco_update_interface_description", { interfaceName: "GigabitEthernet0/1", description: "uplink core" }).parametersJson as Record<string, unknown> });
  assert.equal(planned.status, "planned");
  assert.deepEqual(planned.commands.slice(0, 4), ["configure terminal", "interface GigabitEthernet0/1", "description uplink core", "end"]);
  assert.equal(planned.requiresApproval, true);
});

test("Cisco write preview produces exact CLI without invoking the connector", async () => {
  let invoked = false;
  const original = ciscoIosXeSshConnector.runCliCommands;
  ciscoIosXeSshConnector.runCliCommands = (async () => { invoked = true; throw new Error("connector should not run during dryRun"); }) as never;
  try {
    const dryRun = await ciscoIosXeConnector.dryRun(plan("cisco_update_interface_description", { interfaceName: "GigabitEthernet0/1", description: "uplink core" }));
    assert.equal(invoked, false);
    assert.deepEqual(dryRun.plannedCommands.slice(0, 5), ["configure terminal", "interface GigabitEthernet0/1", "description uplink core", "end", "show running-config interface GigabitEthernet0/1"]);
    assert.equal(dryRun.commandSpecs?.[0]?.write, true);
    assert.equal(dryRun.commandSpecs?.at(-1)?.write, false);
    assert.equal(dryRun.requiresApproval, true);
  } finally {
    ciscoIosXeSshConnector.runCliCommands = original;
  }
});

test("Cisco read-only and approved write execution use the existing Cisco SSH2 connector wrapper", async () => {
  const originalRead = ciscoIosXeSshConnector.runReadOnlyCommands;
  const originalCli = ciscoIosXeSshConnector.runCliCommands;
  const calls: { read?: string[]; cli?: CiscoCliCommandSpec[] } = {};
  ciscoIosXeSshConnector.runReadOnlyCommands = (async (_device, commandIds) => {
    calls.read = [...commandIds];
    return { connectorInvoked: true, warnings: [], results: commandIds.map((commandId) => ({ commandId, command: "show version", stdout: "Cisco IOS Software", stderr: "", exitCode: 0, durationMs: 1 })), connection: {} };
  }) as never;
  ciscoIosXeSshConnector.runCliCommands = (async (_device, specs) => {
    calls.cli = specs;
    return { connectorInvoked: true, warnings: [], results: specs.map((spec) => ({ commandId: spec.commandId, command: spec.command, stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 })), connection: {} };
  }) as never;
  try {
    const read = await ciscoIosXeConnector.execute(plan("cisco_show_version"), device);
    assert.equal(read.executed, true);
    assert.deepEqual(calls.read, ["platform"]);

    const write = await ciscoIosXeConnector.execute(plan("cisco_enable_interface", { interfaceName: "GigabitEthernet0/1" }), device);
    assert.equal(write.executed, true);
    assert.deepEqual(calls.cli?.map((spec) => spec.command), ["configure terminal", "interface GigabitEthernet0/1", "no shutdown", "end", "show interfaces GigabitEthernet0/1"]);
    assert.equal(calls.cli?.some((spec) => spec.write), true);
  } finally {
    ciscoIosXeSshConnector.runReadOnlyCommands = originalRead;
    ciscoIosXeSshConnector.runCliCommands = originalCli;
  }
});

test("Cisco configuration outputs are routed through redaction before Action Center evidence", async () => {
  assert.equal(redactCiscoCliOutput("username admin secret myClearText\nsnmp-server community public RO").includes("myClearText"), false);
  assert.equal(redactCiscoCliOutput("username admin secret myClearText\nsnmp-server community public RO").includes("public"), false);

  const originalRead = ciscoIosXeSshConnector.runReadOnlyCommands;
  const originalCli = ciscoIosXeSshConnector.runCliCommands;
  let readInvoked = false;
  let cliInvoked = false;
  ciscoIosXeSshConnector.runReadOnlyCommands = (async () => { readInvoked = true; throw new Error("sensitive config must not use read-only runner"); }) as never;
  ciscoIosXeSshConnector.runCliCommands = (async (_device, specs) => {
    cliInvoked = true;
    assert.equal(specs[0]?.redactOutput, true);
    return { connectorInvoked: true, warnings: [], results: [{ commandId: "runningConfig", command: "show running-config", stdout: redactCiscoCliOutput("username admin secret myClearText"), stderr: "", exitCode: 0, durationMs: 1 }], connection: {} };
  }) as never;
  try {
    const result = await ciscoIosXeConnector.execute(plan("cisco_show_running_config"), device);
    assert.equal(readInvoked, false);
    assert.equal(cliInvoked, true);
    assert.equal(result.commands[0]?.stdout.includes("myClearText"), false);
  } finally {
    ciscoIosXeSshConnector.runReadOnlyCommands = originalRead;
    ciscoIosXeSshConnector.runCliCommands = originalCli;
  }
});
