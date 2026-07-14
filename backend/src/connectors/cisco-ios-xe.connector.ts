import { ActionType, type ActionPlan, type Device } from "@prisma/client";
import { ciscoIosXeSshConnector, isCiscoIosXeSshCandidate } from "./cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import type { ConnectorDryRun, ConnectorExecutionResult, DeviceCapabilities, DeviceConnectionTestResult, DeviceConnector } from "./types.js";

function metadata(plan: ActionPlan) {
  const parameters = plan.parametersJson && typeof plan.parametersJson === "object" && !Array.isArray(plan.parametersJson)
    ? plan.parametersJson as Record<string, unknown>
    : {};
  return parameters.metadata && typeof parameters.metadata === "object" && !Array.isArray(parameters.metadata)
    ? parameters.metadata as Record<string, unknown>
    : {};
}

function assertShowVersion(plan: ActionPlan) {
  if (metadata(plan).catalogCommandId !== "cisco.show-version") {
    throw new Error("Only the registered Cisco show version template is executable.");
  }
}

async function connection(device: Device): Promise<DeviceConnectionTestResult> {
  try {
    const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device, ["platform"]);
    return {
      connected: result.connectorInvoked,
      deviceId: device.id,
      vendor: "cisco",
      host: device.host,
      port: device.managementPort,
      credentialResolved: true,
      stages: [
        { name: "resolve_device", status: "ok" },
        { name: "resolve_credential", status: "ok" },
        { name: "tcp_connect", status: "ok" },
        { name: "ssh_handshake", status: "ok" },
        { name: "ssh_auth", status: "ok" },
        { name: "basic_commands", status: "ok", message: "show version completed." }
      ],
      warnings: result.warnings.map((message) => ({ code: "CISCO_WARNING", message })),
      capabilities: { canConnect: true, canRunBasicReadOnly: true, canReadSystem: true, canExecuteWriteActions: false },
      message: "Cisco SSH connection and authentication succeeded."
    };
  } catch (error) {
    const source = error as { code?: string; message?: string };
    const errorText = String(source.code ?? source.message ?? "");
    const authFailed = /auth/i.test(errorText);
    const timeout = /timeout/i.test(errorText);
    const credentialMissing = /credential.*missing/i.test(errorText);
    return {
      connected: false,
      deviceId: device.id,
      vendor: "cisco",
      host: device.host,
      port: device.managementPort,
      credentialResolved: !credentialMissing,
      stages: [
        { name: "resolve_device", status: "ok" },
        { name: "resolve_credential", status: credentialMissing ? "failed" : "ok" },
        { name: "tcp_connect", status: timeout ? "failed" : "warning", code: source.code, message: source.message },
        { name: "ssh_auth", status: authFailed ? "failed" : "warning", code: source.code, message: source.message }
      ],
      warnings: [],
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canReadSystem: false, canExecuteWriteActions: false },
      errorCode: source.code ?? "CISCO_SSH_CONNECT_FAILED",
      message: source.message ?? "Cisco SSH connection failed."
    };
  }
}

export const ciscoIosXeConnector: DeviceConnector = {
  name: "cisco",
  supportedActions: [ActionType.generic_security_action],
  supports(device) {
    return Boolean(device && isCiscoIosXeSshCandidate(device));
  },
  testConnection: connection,
  async getCapabilities(_device): Promise<DeviceCapabilities> {
    return {
      canTestConnection: true,
      canCollectStatus: true,
      canReadSystem: true,
      canExecuteWriteActions: false,
      canExecuteChangeSshPort: false,
      supportedActions: [ActionType.generic_security_action]
    };
  },
  collectStatus: connection,
  async dryRun(plan): Promise<ConnectorDryRun> {
    assertShowVersion(plan);
    return {
      plannedCommands: ["show version"],
      validationWarnings: ["Read-only Cisco IOS-XE command."],
      affectedPorts: [],
      affectedServices: [],
      rollbackSteps: [],
      riskLevel: plan.riskLevel,
      requiresApproval: true,
      commandSpecs: [{ template: "show version", command: "show version", write: false, target: { deviceId: plan.deviceId } }],
      exactTarget: { deviceId: plan.deviceId }
    };
  },
  async execute(plan, device): Promise<ConnectorExecutionResult> {
    assertShowVersion(plan);
    const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device, ["platform"]);
    return {
      executed: result.connectorInvoked,
      actionType: plan.actionType,
      deviceId: device.id,
      commands: result.results.map((entry) => ({ template: "show version", stdout: entry.stdout, stderr: entry.stderr, exitCode: entry.exitCode })),
      warnings: result.warnings,
      rollbackJson: { available: false, outcome: "read_only_no_rollback_required" }
    };
  },
  async rollback(plan, device): Promise<ConnectorExecutionResult> {
    return { executed: false, actionType: plan.actionType, deviceId: device.id, commands: [], warnings: ["Read-only Cisco show version has no rollback."], rollbackJson: { available: false } };
  }
};
