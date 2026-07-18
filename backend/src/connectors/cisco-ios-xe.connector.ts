import { ActionType, type ActionPlan, type Device } from "@prisma/client";
import { CiscoConnectorError, ciscoIosXeSshConnector, isCiscoIosXeSshCandidate } from "./cisco/ios-xe/cisco-iosxe.ssh.connector.js";
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
    const diagnostic = result.connection.diagnostic;
    const supported = result.connection.semantic === "connected_supported";
    return {
      connected: diagnostic.authenticated && diagnostic.shellOpened,
      deviceId: device.id,
      vendor: "cisco",
      host: device.host,
      port: device.managementPort,
      credentialResolved: true,
      stages: [
        { name: "resolve_device", status: "ok" },
        { name: "resolve_credential", status: "ok" },
        { name: "tcp_connect", status: diagnostic.transportConnected ? "ok" : "failed" },
        { name: "ssh_handshake", status: diagnostic.authenticated ? "ok" : "failed" },
        { name: "ssh_auth", status: diagnostic.authenticated ? "ok" : "failed" },
        { name: "shell", status: diagnostic.shellOpened ? "ok" : "failed" },
        { name: "prompt", status: "ok" },
        { name: "basic_commands", status: "ok", message: "show version completed." },
        { name: "platform_detection", status: supported ? "ok" : "warning", code: diagnostic.code, message: diagnostic.userMessage }
      ],
      warnings: result.warnings.map((message) => ({ code: "CISCO_WARNING", message })),
      capabilities: { canConnect: true, canRunBasicReadOnly: true, canReadSystem: supported, canExecuteWriteActions: false },
      diagnostic: diagnostic as unknown as Record<string, unknown>,
      message: diagnostic.userMessage
    };
  } catch (error) {
    const connectorError = error instanceof CiscoConnectorError ? error : null;
    const diagnostic = connectorError?.toDiagnostic();
    const source = error as { code?: string; message?: string };
    const credentialMissing = diagnostic?.code === "CISCO_SSH_CREDENTIAL_MISSING";
    const failedStage = diagnostic?.stage;
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
        { name: "tcp_connect", status: diagnostic?.transportConnected ? "ok" : failedStage === "tcp" || failedStage === "dns" ? "failed" : "warning", code: failedStage === "tcp" || failedStage === "dns" ? diagnostic?.code : undefined, message: failedStage === "tcp" || failedStage === "dns" ? diagnostic?.userMessage : undefined },
        { name: "ssh_handshake", status: diagnostic?.authenticated ? "ok" : failedStage === "ssh_negotiation" ? "failed" : "warning", code: failedStage === "ssh_negotiation" ? diagnostic?.code : undefined, message: failedStage === "ssh_negotiation" ? diagnostic?.userMessage : undefined },
        { name: "ssh_auth", status: diagnostic?.authenticated ? "ok" : failedStage === "authentication" ? "failed" : "warning", code: failedStage === "authentication" ? diagnostic?.code : undefined, message: failedStage === "authentication" ? diagnostic?.userMessage : undefined },
        { name: "shell", status: diagnostic?.shellOpened ? "ok" : failedStage === "shell" ? "failed" : "warning", code: failedStage === "shell" ? diagnostic?.code : undefined, message: failedStage === "shell" ? diagnostic?.userMessage : undefined },
        { name: "prompt", status: failedStage === "prompt" ? "failed" : "warning", code: failedStage === "prompt" ? diagnostic?.code : undefined, message: failedStage === "prompt" ? diagnostic?.userMessage : undefined }
      ],
      warnings: [],
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canReadSystem: false, canExecuteWriteActions: false },
      errorCode: diagnostic?.code ?? source.code ?? "CISCO_SSH_CONNECT_FAILED",
      diagnostic: diagnostic as unknown as Record<string, unknown> | undefined,
      message: diagnostic?.userMessage ?? source.message ?? "Cisco SSH connection failed."
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
  async getCapabilities(): Promise<DeviceCapabilities> {
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
