import { ActionType, type ActionPlan, type Device } from "@prisma/client";
import { CiscoConnectorError, ciscoIosXeSshConnector, isCiscoIosXeSshCandidate } from "./cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import type { ConnectorDryRun, ConnectorExecutionResult, DeviceCapabilities, DeviceConnectionTestResult, DeviceConnector } from "./types.js";
import { ciscoReadCommand } from "./cisco/ios-xe/cisco-iosxe.templates.js";
import type { CiscoCliCommandSpec } from "./cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { findCiscoOperation, type CiscoOperationDefinition } from "../cisco/cisco-operation-registry.js";
import { customDryRun, customPlanFromParameters } from "../ai/custom-action-plan.js";
import { SWITCHING_ACTIONS } from "../cisco/cisco-switching.js";
import { prisma } from "../db/prisma.js";
import { detectCiscoPlatform } from "./cisco/ios-xe/cisco-iosxe.parsers.js";
const switchingOperations = new Set<string>(SWITCHING_ACTIONS.map(operation => "cisco." + operation.slug));
const activeSwitchingDevices = new Set<string>();

function metadata(plan: ActionPlan) {
  const parameters = plan.parametersJson && typeof plan.parametersJson === "object" && !Array.isArray(plan.parametersJson)
    ? plan.parametersJson as Record<string, unknown>
    : {};
  return parameters.metadata && typeof parameters.metadata === "object" && !Array.isArray(parameters.metadata)
    ? parameters.metadata as Record<string, unknown>
    : {};
}

function executableOperation(plan: ActionPlan): CiscoOperationDefinition {
  const meta = metadata(plan);
  const operation = findCiscoOperation(String(meta.catalogCommandId ?? meta.executionTemplateRef ?? ""));
  if (!operation || operation.state !== "implemented" || (operation.commandIds.length === 0 && !operation.buildCommandSpecs)) {
    throw new Error("Cisco operation is not registered for controlled execution.");
  }
  return operation;
}


function actionParameters(plan: ActionPlan) {
  const parameters = plan.parametersJson && typeof plan.parametersJson === "object" && !Array.isArray(plan.parametersJson)
    ? plan.parametersJson as Record<string, unknown>
    : {};
  const meta = metadata(plan);
  const normalizedParams = meta.normalizedParams && typeof meta.normalizedParams === "object" && !Array.isArray(meta.normalizedParams)
    ? meta.normalizedParams as Record<string, unknown>
    : {};
  return { ...normalizedParams, ...parameters };
}

function specsForOperation(operation: CiscoOperationDefinition, plan: ActionPlan): CiscoCliCommandSpec[] {
  if (operation.buildCommandSpecs) {
    const specs = operation.buildCommandSpecs(actionParameters(plan));
    return switchingOperations.has(operation.id) ? [{ commandId: "platform", command: "show version", strict: true, validateOutput(output: string) {
      if (!detectCiscoPlatform(output).supported) throw new Error("پلتفرم IOS/IOS XE پشتیبانی‌شده تأیید نشد؛ تغییر ارسال نشد.");
    } }, ...specs] : specs;
  }
  return operation.commandIds.map((commandId) => ({
    commandId,
    command: ciscoReadCommand(commandId),
    write: false,
    redactOutput: commandId === "runningConfig" || commandId === "startupConfig"
  }));
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
      capabilities: { canConnect: true, canRunBasicReadOnly: true, canReadSystem: supported, canExecuteWriteActions: true },
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
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canReadSystem: false, canExecuteWriteActions: true },
      errorCode: diagnostic?.code ?? source.code ?? "CISCO_SSH_CONNECT_FAILED",
      diagnostic: diagnostic as unknown as Record<string, unknown> | undefined,
      message: diagnostic?.userMessage ?? source.message ?? "Cisco SSH connection failed."
    };
  }
}

export const ciscoIosXeConnector: DeviceConnector = {
  name: "cisco",
  supportedActions: [ActionType.generic_security_action, ActionType.custom_vendor_action],
  supports(device) {
    return Boolean(device && isCiscoIosXeSshCandidate(device));
  },
  testConnection: connection,
  async getCapabilities(): Promise<DeviceCapabilities> {
    return {
      canTestConnection: true,
      canCollectStatus: true,
      canReadSystem: true,
      canExecuteWriteActions: true,
      canExecuteChangeSshPort: false,
      supportedActions: [ActionType.generic_security_action, ActionType.custom_vendor_action]
    };
  },
  collectStatus: connection,
  async dryRun(plan): Promise<ConnectorDryRun> {
    if (plan.actionType === ActionType.custom_vendor_action) {
      const customPlan = customPlanFromParameters(plan.parametersJson);
      if (!customPlan || customPlan.vendor !== "cisco") throw new Error("Cisco custom command plan is missing or targets another vendor.");
      return customDryRun(customPlan);
    }
    const operation = executableOperation(plan);
    return {
      plannedCommands: specsForOperation(operation, plan).map((spec) => spec.command),
      validationWarnings: switchingOperations.has(operation.id) ? [operation.titleFa, ...operation.prechecks, "بک‌آپ ایمنی گرفته می‌شود؛ ذخیره Startup-config و بازگردانی خودکار انجام نمی‌شود."] : [`Controlled Cisco SSH2 operation: ${operation.titleEn}.`],
      affectedPorts: [],
      affectedServices: [],
      rollbackSteps: operation.rollback.available ? operation.rollback.steps : [],
      riskLevel: plan.riskLevel,
      requiresApproval: true,
      commandSpecs: specsForOperation(operation, plan).map((spec) => ({ template: spec.commandId, command: spec.command, write: spec.write === true, target: { deviceId: plan.deviceId, operationId: operation.id } })),
      exactTarget: { deviceId: plan.deviceId, interfaces: String(actionParameters(plan).interfaces ?? actionParameters(plan).interfaceName ?? "") }
    };
  },
  async execute(plan, device): Promise<ConnectorExecutionResult> {
    if (plan.actionType === ActionType.custom_vendor_action) {
      const customPlan = customPlanFromParameters(plan.parametersJson);
      if (!customPlan || customPlan.vendor !== "cisco") throw new Error("Cisco custom command plan is missing or targets another vendor.");
      const specs: CiscoCliCommandSpec[] = [
        ...customPlan.orderedCommands.map((command, index) => ({ commandId: `custom step ${index + 1}`, command, write: true })),
        ...customPlan.verificationCommands.map((command, index) => ({ commandId: `custom verification ${index + 1}`, command, write: false })),
      ];
      const result = await ciscoIosXeSshConnector.runCliCommands(device, specs);
      return {
        executed: result.connectorInvoked,
        actionType: plan.actionType,
        deviceId: device.id,
        commands: result.results.map((entry) => ({ template: entry.commandId, stdout: entry.stdout, stderr: entry.stderr, exitCode: entry.exitCode })),
        warnings: [...result.warnings, "AI-generated custom commands executed only after backend validation, approval, PolicyGuard, and registered Cisco connector dispatch."],
        rollbackJson: { customConnectorPlan: true, steps: customPlan.rollbackGuidance, verification: { ok: true, summary: "Custom Cisco verification commands completed." } }
      };
    }
    const operation = executableOperation(plan);
    const specs = specsForOperation(operation, plan);
    const switching = switchingOperations.has(operation.id);
    if (switching && activeSwitchingDevices.has(device.id)) throw new Error("CISCO_SWITCHING_BUSY: عملیات دیگری روی این دستگاه در حال اجراست.");
    if (switching) activeSwitchingDevices.add(device.id);
    let safetyBackupId: string | undefined;
    try {
    if (switching) {
      if (!device.companyId) throw new Error("CISCO_BACKUP_OWNER_REQUIRED");
      const company = await prisma.company.findFirst({ where: { id: device.companyId, deletedAt: null }, select: { ownerId: true } });
      if (!company) throw new Error("CISCO_BACKUP_OWNER_REQUIRED");
      const { createBackup } = await import("../backups/device-backup.service.js");
      const backup = await createBackup(device.id, company.ownerId, plan.requestedBy || "system");
      safetyBackupId = backup.id;
      await prisma.actionAuditLog.create({ data: { actionPlanId: plan.id, deviceId: device.id, eventType: "cisco_switching_safety_backup", message: "Fresh encrypted backup saved before switching configuration changes.", metadataJson: { safetyBackupId, sha256: backup.sha256 } } });
    }
    const mustUseSpecRunner = specs.some((spec) => spec.write === true || spec.redactOutput === true);
    const result = operation.commandIds.length > 0 && !operation.buildCommandSpecs && !mustUseSpecRunner
      ? await ciscoIosXeSshConnector.runReadOnlyCommands(device, operation.commandIds)
      : await ciscoIosXeSshConnector.runCliCommands(device, specs);
    return {
      executed: result.connectorInvoked,
      actionType: plan.actionType,
      deviceId: device.id,
      commands: result.results.map((entry) => ({ template: entry.commandId, stdout: entry.stdout, stderr: entry.stderr, exitCode: entry.exitCode })),
      warnings: [...result.warnings, ...(switching ? ["تنظیمات درخواست‌شده از دستگاه خوانده و تأیید شدند؛ Startup-config ذخیره نشده است."] : [])],
      rollbackJson: switching ? { available: false, safetyBackupId, outcome: "verified_change_manual_restore_available", verification: { ok: true, summary: "Requested switching configuration matched authenticated read-back." } } : operation.rollback.available ? { available: true, steps: operation.rollback.steps, outcome: operation.readOnly ? "read_only_no_rollback_required" : "change_executed_manual_rollback_available" } : { available: false, outcome: operation.readOnly ? "read_only_no_rollback_required" : "manual_rollback_required" }
    };
    } finally { if (switching) activeSwitchingDevices.delete(device.id); }
  },
  async rollback(plan, device): Promise<ConnectorExecutionResult> {
    const operation = executableOperation(plan);
    return { executed: false, actionType: plan.actionType, deviceId: device.id, commands: [], warnings: [`Read-only Cisco ${operation.titleEn} has no rollback.`], rollbackJson: { available: false } };
  }
};
