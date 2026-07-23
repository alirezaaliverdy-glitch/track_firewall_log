import { ActionPlanStatus, ActionType, AiRiskLevel, Prisma, type ActionPlan } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { ConnectorError } from "../../connectors/linux-ssh.connector.js";
import { selectDeviceConnector } from "../../connectors/connector-registry.service.js";
import { validateActionPlan } from "../../services/policy-guard.service.js";
import { env } from "../../config/env.js";
import { buildDailyCheckResult } from "../../daily-check/daily-check-engine.js";
import { buildFortiGateDailyCheck, parseFortiGateReadOnlyResult } from "../../fortigate/readonly-result-parser.js";
import {
  ActionExecutionError,
  QuickExecuteConfirmationRequiredError,
  actionExecutionFingerprint,
  approvalRequirements,
  asObject,
  audit,
  approveCurrentRevisionForExecution,
  buildPostExecutionVerification,
  canonicalPayloadFromStoredPlan,
  connectorErrorLike,
  ensureControlledCatalogAction,
  type ExecutionDependencies,
  executionApprovalError,
  includeRelations,
  parseExecutionResult,
  planRevision,
  resolveExecutionPipeline,
  stableJson,
  toJson,
  withExecutionMetadata
} from "./action-plan.shared.js";
import { approveActionPlan } from "./action-plan-approval.service.js";
import { dryRunActionPlan, validateAndStoreActionPlan } from "./action-plan-preview.service.js";
import { classifyExecutionResultState } from "./execution-result-state.js";
async function regenerateLatestRevisionForExecution(plan: ActionPlan, input: Record<string, unknown>, changedFields: string[]) {
  const parameters = asObject(plan.parametersJson);
  const metadata = asObject(parameters.metadata);
  const revision = planRevision(metadata);
  const revisionHistory = Array.isArray(metadata.revisionHistory) ? metadata.revisionHistory : [];
  const {
    canonicalParameters: _canonicalParameters,
    canonicalParametersHash: _canonicalParametersHash,
    canonicalPayload: _canonicalPayload,
    canonicalPayloadHash: _canonicalPayloadHash,
    previewHash: _previewHash,
    previewFingerprint: _previewFingerprint,
    approvedRevision: _approvedRevision,
    approvedCanonicalPayloadHash: _approvedCanonicalPayloadHash,
    approvedPreviewHash: _approvedPreviewHash,
    approvedCanonicalPayload: _approvedCanonicalPayload,
    approvedAt: _approvedAt,
    executingRevision: _executingRevision,
    ...preservedMetadata
  } = metadata;
  const nextRevision = revision + 1;
  const revised = await prisma.actionPlan.update({
    where: { id: plan.id },
    data: {
      status: ActionPlanStatus.proposed,
      parametersJson: toJson({
        ...parameters,
        metadata: {
          ...preservedMetadata,
          planRevision: nextRevision,
          planState: "draft",
          previewGenerated: false,
          previewStale: false,
          staleReason: null,
          lastExecutionStatus: "revision_regenerated",
          revisionHistory: [...revisionHistory, {
            revision,
            state: metadata.planState ?? plan.status,
            canonicalPayloadHash: metadata.canonicalPayloadHash ?? null,
            previewHash: metadata.previewHash ?? null,
            approvedRevision: metadata.approvedRevision ?? null,
          }].slice(-20),
        },
      }),
      validationJson: Prisma.JsonNull,
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      rollbackJson: Prisma.JsonNull,
    },
    include: includeRelations(),
  });
  await audit(revised, "action_revision_regenerated", "Stale ActionPlan inputs were promoted to a new revision before execution.", { previousRevision: revision, currentRevision: nextRevision, changedFields });

  const validated = await validateAndStoreActionPlan(plan.id);
  if (!validated || validated.status === ActionPlanStatus.validation_failed || validated.status === ActionPlanStatus.proposed) {
    throw new ActionExecutionError("REVISION_REGENERATION_FAILED", "The newest ActionPlan revision did not pass validation.", 422, { currentRevision: nextRevision, changedFields });
  }
  const previewed = await dryRunActionPlan(plan.id);
  if (!previewed || previewed.status !== ActionPlanStatus.dry_run_ready || !previewed.dryRunJson) {
    throw new ActionExecutionError("REVISION_PREVIEW_FAILED", "The newest ActionPlan revision could not produce an executable preview.", 422, { currentRevision: nextRevision, changedFields });
  }
  const approved = await approveCurrentRevisionForExecution(previewed, input);
  await audit(approved, "action_revision_ready", "Newest ActionPlan revision was previewed and approved for the current Execute request.", { currentRevision: nextRevision, changedFields });
  return approved;
}


export async function executeActionPlan(id: string, executionInput: Record<string, unknown> = {}, dependencies: ExecutionDependencies = {}) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;

  let catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>;
  try { catalogResolution = await ensureControlledCatalogAction(plan); } catch (error) {
    await audit(plan, "controlled_execution_blocked", "Execution refused by catalog resolution.", { actionType: plan.actionType, code: error instanceof ActionExecutionError ? error.code : "CATALOG_RESOLUTION_FAILED" });
    throw error;
  }

  if (env.actionExecutionMode === "direct_controlled" && !plan.dryRunJson) {
    const planned = await dryRunActionPlan(id);
    if (!planned) return null;
    plan = planned;
    if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) return plan;
  }

  const approvalError = executionApprovalError(plan);
  if (approvalError) {
    await audit(plan, "execution_failed", "Execution refused because action is not approved.", { code: approvalError.code, status: plan.status });
    throw approvalError;
  }

  if (!plan.dryRunJson) {
    await audit(plan, "execution_failed", "Execution refused because the command plan is missing.", { code: "COMMAND_PLAN_REQUIRED" });
    throw new ActionExecutionError("COMMAND_PLAN_REQUIRED", "An internal command plan is required before execution.");
  }
  let metadata = asObject(asObject(plan.parametersJson).metadata);
  if (!metadata.approvedCanonicalPayloadHash) {
    plan = await approveCurrentRevisionForExecution(plan, executionInput);
    metadata = asObject(asObject(plan.parametersJson).metadata);
  }
  const currentFingerprint = actionExecutionFingerprint(plan);
  const approvedFingerprint = String(metadata.approvedCanonicalPayloadHash ?? "");
  if (approvedFingerprint !== currentFingerprint) {
    const approvedPayload = asObject(metadata.approvedCanonicalPayload);
    const currentPayload = canonicalPayloadFromStoredPlan(plan);
    const approvedParameters = asObject(approvedPayload.parameters);
    const changedFields = Array.from(new Set([...Object.keys(approvedParameters), ...Object.keys(currentPayload.parameters)]))
      .filter((field) => stableJson(approvedParameters[field]) !== stableJson(currentPayload.parameters[field]));
    plan = await regenerateLatestRevisionForExecution(plan, executionInput, changedFields);
    metadata = asObject(asObject(plan.parametersJson).metadata);
  }
  if (plan.riskLevel === AiRiskLevel.critical && env.actionExecutionMode !== "direct_controlled" && !env.actionAllowLabUnrestrictedManagement) {
    const reason = typeof executionInput.reason === "string" ? executionInput.reason.trim() : "";
    if (executionInput.breakGlass !== true || !reason) {
      throw new ActionExecutionError("BREAK_GLASS_REQUIRED", "Critical execution requires break-glass mode and a reason.", 428);
    }
  }

  const validationJson = asObject(plan.validationJson);
  const validationErrors = Array.isArray(validationJson.errors) ? validationJson.errors : [];
  if (validationErrors.length > 0 || validationJson.valid === false) {
    await audit(plan, "execution_failed", "Execution refused because stored validation has blocking errors.", { code: "VALIDATION_BLOCKED", validationJson });
    throw new ActionExecutionError("VALIDATION_BLOCKED", "ActionPlan validation has blocking errors.");
  }

  if (!plan.deviceId) {
    await audit(plan, "execution_failed", "Execution refused because no device is selected.", { code: "DEVICE_REQUIRED" });
    throw new ActionExecutionError("DEVICE_REQUIRED", "ActionPlan requires a target device.");
  }

  let device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
  if (!device) {
    await audit(plan, "execution_failed", "Execution refused because target device was not found.", { code: "DEVICE_REQUIRED" });
    throw new ActionExecutionError("DEVICE_REQUIRED", "Target device was not found.", 404);
  }

  const connector = (dependencies.selectConnector ?? selectDeviceConnector)(device);
  if (!connector) {
    await audit(plan, "execution_failed", "Execution refused because no connector matched the target device.", { code: "CONNECTOR_NOT_FOUND", deviceType: device.type, protocol: device.protocol });
    throw new ActionExecutionError("CONNECTOR_NOT_FOUND", "No connector found for this device.");
  }

  if (!connector.supportedActions.includes(plan.actionType)) {
    await audit(plan, "execution_failed", "Execution refused because connector does not support this action.", { code: "CONNECTOR_ACTION_UNSUPPORTED", actionType: plan.actionType });
    throw new ActionExecutionError("CONNECTOR_ACTION_UNSUPPORTED", "Connector does not support this action.");
  }

  if (plan.actionType === ActionType.fortigate_guided_vpn_setup && connector.name === "fortigate") {
    const capabilities = asObject(device.capabilities);
    const discovery = asObject(asObject(capabilities.fortigateStatus).fortigate);
    const cachedInterfaces = Array.isArray(discovery.interfaces) ? discovery.interfaces.map(String).filter(Boolean) : [];
    if (cachedInterfaces.length === 0) {
      await audit(plan, "fortigate_discovery_started", "FortiGate interface discovery cache was empty; running safe read-only discovery before execution.", { commands: ["show system interface", "get system interface"] });
      let status: unknown;
      try {
        status = await connector.collectStatus(device);
      } catch (error) {
        await audit(plan, "execution_failed", "FortiGate read-only discovery failed before execution.", { code: "FORTIGATE_CONNECTOR_NOT_CONFIGURED", error: error instanceof Error ? error.message : "discovery failed" });
        throw new ActionExecutionError("FORTIGATE_CONNECTOR_NOT_CONFIGURED", "Cannot execute: FortiGate SSH connector is not configured for this device.", 409);
      }
      const statusObject = asObject(status);
      const statusDiscovery = asObject(statusObject.fortigate);
      const liveInterfaces = Array.isArray(statusDiscovery.interfaces) ? statusDiscovery.interfaces.map(String).filter(Boolean) : [];
      if (statusObject.connected === false || liveInterfaces.length === 0) {
        await audit(plan, "execution_failed", "FortiGate read-only discovery did not return interface names.", { code: "FORTIGATE_DISCOVERY_FAILED", errorCode: statusObject.errorCode ?? null });
        throw new ActionExecutionError("FORTIGATE_DISCOVERY_FAILED", "Cannot execute: FortiGate interface discovery did not return interface names.", 409);
      }
      device = await prisma.device.update({
        where: { id: device.id },
        data: { capabilities: toJson({ ...capabilities, fortigateStatus: statusObject }) }
      });
      await audit(plan, "fortigate_discovery_completed", "FortiGate interface discovery refreshed before execution.", { interfaceCount: liveInterfaces.length });
    }
  }

  const validation = await validateActionPlan(plan);
  const pipeline = await resolveExecutionPipeline({ plan, device, connector, catalogResolution, validation });
  await audit(plan, "policy_guard_passed", "PolicyGuard allowed controlled execution.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name });
  dependencies.trace?.("action_policy_guard_passed", {});
  if (env.actionAllowLabUnrestrictedManagement) {
    await audit(plan, "policy_allowed_lab_unrestricted", "Lab unrestricted mode allowed the validated template after user confirmation.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name });
    dependencies.trace?.("action_policy_allowed_lab_unrestricted", {});
  }
  await audit(plan, "connector_resolved", "Device connector resolved for execution.", { connector: connector.name, connectorType: pipeline.template.connectorType, templateRef: pipeline.template.id });
  dependencies.trace?.("action_connector_resolved", { connectorType: connector.name, executionTemplateRef: pipeline.template.id });

  const executing = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: ActionPlanStatus.executing,
      parametersJson: toJson(withExecutionMetadata(plan.parametersJson, {
        planState: "executing",
        executingRevision: planRevision(metadata),
        executed: false,
        connectorInvoked: false,
        backupEnabled: false,
        executionTemplateRef: pipeline.template.id,
        connectorType: pipeline.template.connectorType,
        executionPipeline: {
          template: pipeline.template.id,
          connector: connector.name,
          validation: "passed",
          execution: "running",
          verification: "pending",
          audit: "started"
        },
        previewStale: false,
        staleReason: null,
        executionStartedAt: new Date().toISOString(),
        lastExecutionStatus: "executing"
      }))
    },
    include: includeRelations()
  });

  await audit(executing, "execution_started", "Controlled catalog execution started.", { actionType: plan.actionType, templateRef: pipeline.template.id, connector: connector.name, backupEnabled: false });

  await audit(executing, "connection_attempt", "Connector execution connection attempt started.", {
    connector: connector.name,
    host: device.host,
    port: device.managementPort,
    backupEnabled: false
  });

  try {
    await audit(executing, "preflight_check", "Execution gating passed; connector preflight starting.", {
      actionType: plan.actionType,
      approved: true,
      dryRunPresent: true,
      backupEnabled: false
    });
    const invoked = await prisma.actionPlan.update({ where: { id }, data: { parametersJson: toJson(withExecutionMetadata(executing.parametersJson, { connectorInvoked: true })) } });
    await audit(invoked, "connector_invoked", "Resolved connector was invoked for real execution.", { connector: connector.name, backupEnabled: false });
    dependencies.trace?.("action_connector_invoked", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false });
    dependencies.trace?.("action_remote_command_started", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false });
    const result = await connector.execute(plan, device, (eventType, message, metadata) => audit(executing, eventType, message, metadata));
    await audit(executing, "connector_result_received", "Connector returned a real execution result.", { executed: result.executed, commandCount: result.commands.length });
    if (result.executed && plan.actionType === ActionType.mikrotik_change_service_port) {
      const parameters = asObject(plan.parametersJson);
      const newPort = Number(parameters.newPort ?? parameters.port);
      if (parameters.service === "ssh" && Number.isInteger(newPort) && newPort >= 1024 && newPort <= 65535) {
        await prisma.device.update({ where: { id: device.id }, data: { managementPort: newPort } });
        await audit(executing, "device_management_port_updated", "Stored MikroTik SSH management port updated after successful execution.", {
          deviceId: device.id,
          oldPort: device.managementPort,
          newPort,
          approvalStatus: "approved",
          executionResult: "succeeded",
          rollbackPreview: result.rollbackJson ?? plan.rollbackJson
        });
      }
    }
    const completedAt = new Date().toISOString();
    const startedAt = String(asObject(asObject(executing.parametersJson).metadata).executionStartedAt ?? completedAt);
    const exitCodes = result.commands.map((command) => command.exitCode).filter((code): code is number => typeof code === "number");
    const serviceStatus = asObject(result.rollbackJson).serviceStatus;
    const serviceStatusReadSucceeded = plan.actionType === ActionType.linux_check_service_status &&
      result.executed &&
      result.commands.length > 0 &&
      ["active", "inactive", "failed", "not_found", "unknown"].includes(String(asObject(serviceStatus).state));
    const executionSucceeded = serviceStatusReadSucceeded || (result.executed && result.commands.length > 0 && exitCodes.every((code) => code === 0));
    const dailyCheck = plan.actionType === ActionType.linux_daily_check || plan.actionType === ActionType.mikrotik_daily_check || plan.actionType === ActionType.fortigate_daily_check
      ? plan.actionType === ActionType.fortigate_daily_check
        ? buildFortiGateDailyCheck(device.id, result.commands)
        : buildDailyCheckResult({ deviceId: device.id, vendor: plan.actionType === ActionType.linux_daily_check ? "linux" : "mikrotik", outputs: result.commands })
      : null;
    const fortigateReadOnly = String(plan.actionType).startsWith("fortigate_show_") || ["fortigate_route_dns_check", "fortigate_license_status", "fortigate_admin_users"].includes(String(plan.actionType))
      ? parseFortiGateReadOnlyResult(String(plan.actionType), result.commands)
      : null;
    const resultPayload: Record<string, unknown> & { stdout: string; stderr: string; exitCode: number | null } = {
      ...result,
      executed: executionSucceeded,
      outcome: asObject(result.rollbackJson).outcome ?? (executionSucceeded ? "completed" : "failed"),
      connectorInvoked: true,
      backupEnabled: false,
      executionStartedAt: startedAt,
      executionCompletedAt: completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      exitCode: exitCodes.length ? Math.max(...exitCodes) : null,
      stdout: result.commands.map((command) => command.stdout).filter(Boolean).join("\n"),
      stderr: result.commands.map((command) => command.stderr).filter(Boolean).join("\n"),
      executor: connector.name,
      parsedResult: serviceStatusReadSucceeded ? serviceStatus : dailyCheck ?? fortigateReadOnly ?? parseExecutionResult(plan.actionType, result.commands.map((command) => command.stdout).filter(Boolean).join("\n"), result.commands, asObject(result.rollbackJson).verification),
      verification: null,
      executionEvidence: null,
      resultUrl: `/actions/${id}/result`
    };
    const verification = buildPostExecutionVerification({ plan, pipeline, result, executionSucceeded, connectorInvoked: true });
    const verificationEvidenceCount = Object.keys(asObject(asObject(result.rollbackJson).verification)).length > 0 ? 1 : 0;
    const resultState = classifyExecutionResultState({
      connectorInvoked: true,
      executionSucceeded,
      verificationOk: verification.ok,
      verificationEvidenceCount,
      commandExitCodes: result.commands.map((command) => command.exitCode)
    });
    resultPayload.verification = verification;
    resultPayload.resultState = resultState;
    resultPayload.approvalBinding = metadata.approvedBinding ?? asObject(plan.approvalJson).approvalBinding ?? null;
    resultPayload.executionEvidence = {
      template: { status: "resolved", ref: pipeline.template.id, connectorType: pipeline.template.connectorType, handler: pipeline.template.handler },
      connector: { status: "invoked", name: connector.name, registered: true },
      validation: { status: "passed", riskLevel: validation.riskLevel },
      execution: { status: executionSucceeded ? "success" : "failed", commandCount: result.commands.length, connectorInvoked: true },
      verification: { status: verification.ok ? "passed" : "failed", checks: verification.checks, evidenceCount: verificationEvidenceCount },
      resultState,
      approvalBinding: resultPayload.approvalBinding,
      audit: { status: "recorded", events: pipeline.auditEvents }
    };
    dependencies.trace?.("action_remote_command_completed", { connectorInvoked: true, connectorType: connector.name, exitCode: resultPayload.exitCode, stdoutLength: resultPayload.stdout.length, stderrLength: resultPayload.stderr.length });
    dependencies.trace?.(verification.ok ? "action_verification_passed" : "action_verification_failed", { connectorInvoked: true, connectorType: connector.name, executionTemplateRef: pipeline.template.id, checks: verification.checks });
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: verification.ok ? ActionPlanStatus.succeeded : ActionPlanStatus.failed,
        parametersJson: toJson(withExecutionMetadata(executing.parametersJson, {
          planState: verification.ok ? "completed" : "failed",
          executed: verification.ok,
          connectorInvoked: true,
          backupEnabled: false,
          executionTemplateRef: pipeline.template.id,
          connectorType: pipeline.template.connectorType,
          verificationStatus: verification.ok ? "passed" : "failed",
          resultState,
          verificationEvidenceCount,
          executionPipeline: {
            template: "resolved",
            connector: "invoked",
            validation: "passed",
            execution: executionSucceeded ? "success" : "failed",
            verification: verification.ok ? "passed" : "failed",
            audit: "recorded"
          },
          executionCompletedAt: completedAt,
          exitCode: resultPayload.exitCode,
          executor: connector.name,
          lastExecutionStatus: resultState
        })),
        resultJson: toJson(resultPayload),
        rollbackJson: toJson(result.rollbackJson ?? plan.rollbackJson)
      },
      include: includeRelations()
    });

    await audit(updated, "connection_success", "Connector execution connection succeeded.", { connector: connector.name });
    dependencies.trace?.("action_execution_result_saved", { connectorInvoked: true, connectorType: connector.name, backupEnabled: false, exitCode: resultPayload.exitCode, stdoutLength: resultPayload.stdout.length, stderrLength: resultPayload.stderr.length });
    await audit(updated, verification.ok ? "post_execution_verification_passed" : "post_execution_verification_failed", verification.ok ? "Post-execution evidence verified." : "Post-execution evidence failed verification.", verification);
    await audit(updated, "execution_result_state_recorded", "Execution result state and verification evidence were persisted.", { resultState, verificationEvidenceCount, approvalBinding: resultPayload.approvalBinding });
    await audit(updated, verification.ok ? "execution_succeeded" : "execution_failed", verification.ok ? "Connector execution succeeded and evidence verified." : "Connector execution evidence failed verification.", resultPayload);
    return updated;
  } catch (error) {
    const structural = connectorErrorLike(error);
    const connectorError = error instanceof ConnectorError
      ? error
      : structural
        ? structural
        : new ActionExecutionError("EXECUTION_FAILED", error instanceof Error ? error.message : "Execution failed.");
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.failed,
        parametersJson: toJson(withExecutionMetadata(plan.parametersJson, {
          planState: "failed",
          executed: false,
          connectorInvoked: true,
          backupEnabled: false,
          executionTemplateRef: pipeline.template.id,
          connectorType: pipeline.template.connectorType,
          verificationStatus: "failed",
          resultState: "failed",
          verificationEvidenceCount: 0,
          executionPipeline: {
            template: "resolved",
            connector: "invoked",
            validation: "passed",
            execution: "failed",
            verification: "failed",
            audit: "recorded"
          },
          executionCompletedAt: new Date().toISOString(),
          lastExecutionStatus: "failed"
        })),
        resultJson: toJson({
          resultState: "failed",
          executed: false,
          connectorInvoked: true,
          backupEnabled: false,
          executionEvidence: {
            template: { status: "resolved", ref: pipeline.template.id, connectorType: pipeline.template.connectorType, handler: pipeline.template.handler },
            connector: { status: "invoked", name: connector.name, registered: true },
            validation: { status: "passed", riskLevel: validation.riskLevel },
            execution: { status: "failed", connectorInvoked: true },
            verification: { status: "failed", error: connectorError.code },
            audit: { status: "recorded", events: pipeline.auditEvents }
          },
          error: connectorError.code,
          message: connectorError.message
        })
      },
      include: includeRelations()
    });
    await audit(updated, "connection_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    await audit(updated, "command_failed", "Connector command failed or was refused.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    await audit(updated, "post_execution_verification_failed", "Post-execution verification failed because the connector call did not return successful evidence.", { code: connectorError.code, message: connectorError.message, connectorInvoked: true, templateRef: pipeline.template.id, connector: connector.name });
    dependencies.trace?.("action_verification_failed", { connectorInvoked: true, connectorType: connector.name, executionTemplateRef: pipeline.template.id, error: connectorError.code });
    await audit(updated, "execution_failed", "Connector execution failed.", { code: connectorError.code, message: connectorError.message, backupEnabled: false });
    throw new ActionExecutionError(connectorError.code, connectorError.message, connectorError.statusCode ?? 409);
  }
}

export async function quickExecuteActionPlan(id: string, input: Record<string, unknown> = {}, dependencies: ExecutionDependencies = {}) {
  const initial = await prisma.actionPlan.findUnique({ where: { id } });
  if (!initial) return null;
  if (input.intent !== "execute" && input.intent !== "preview") throw new ActionExecutionError("EXECUTION_INTENT_REQUIRED", "برای اجرا، intent=execute الزامی است.", 400);
  const intent = input.intent;
  const traceBase = (extra: Record<string, unknown> = {}) => ({
    actionPlanId: initial.id, actionType: initial.actionType, deviceId: initial.deviceId,
    catalogCommandId: asObject(asObject(initial.parametersJson).metadata).catalogCommandId ?? null,
    executionTemplateRef: asObject(asObject(initial.parametersJson).metadata).executionTemplateRef ?? null,
    vendor: asObject(asObject(initial.parametersJson).metadata).vendor ?? asObject(initial.parametersJson).vendor ?? null,
    connectorType: asObject(asObject(initial.parametersJson).metadata).connectorType ?? null,
    intent, connectorInvoked: false, remoteCommand: null, exitCode: null, stdoutLength: 0, stderrLength: 0,
    ...extra
  });
  const trace = (stage: string, extra: Record<string, unknown> = {}) => dependencies.trace?.(stage, traceBase(extra));
  trace("action_execute_requested");
  await audit(initial, "execution_requested", "Explicit quick execution request received.", traceBase());
  let catalogResolution: Awaited<ReturnType<typeof ensureControlledCatalogAction>>;
  try { catalogResolution = await ensureControlledCatalogAction(initial); } catch (error) {
    await audit(initial, "quick_execute_blocked", "Quick Execute refused by catalog resolution.", { code: error instanceof ActionExecutionError ? error.code : "CATALOG_RESOLUTION_FAILED" });
    throw error;
  }
  trace("action_catalog_resolved", { catalogCommandId: catalogResolution.catalogCommandId, executionTemplateRef: catalogResolution.executionTemplateRef, connectorType: catalogResolution.connectorType, vendor: catalogResolution.vendor });
  trace("action_template_resolved", { executionTemplateRef: catalogResolution.executionTemplateRef, connectorType: catalogResolution.connectorType });
  const initialMetadata = asObject(asObject(initial.parametersJson).metadata);
  const currentRevision = planRevision(initialMetadata);
  const requestedRevision = Number(input.actionPlanRevision);
  if (Number.isInteger(requestedRevision) && requestedRevision > 0 && requestedRevision !== currentRevision) {
    await audit(initial, "execution_revision_resolved", "Execute request revision was superseded by the newest stored ActionPlan revision.", { requestedRevision, currentRevision });
    trace("action_revision_resolved", { requestedRevision, currentRevision });
  }
  const currentInitialFingerprint = actionExecutionFingerprint(initial);
  const storedInitialFingerprint = typeof initialMetadata.previewFingerprint === "string" ? initialMetadata.previewFingerprint : null;
  if (initial.dryRunJson && storedInitialFingerprint && storedInitialFingerprint !== currentInitialFingerprint) {
    await prisma.actionPlan.update({ where: { id }, data: { parametersJson: toJson(withExecutionMetadata(initial.parametersJson, { previewStale: true, staleReason: "user_controlled_inputs_changed" })) } });
    trace("action_preview_checked", { previewStale: true, staleReason: "user_controlled_inputs_changed" });
    await audit(initial, "preview_rebuild_requested", "Stale preview will be rebuilt once before explicit execution.", { staleReason: "stable_execution_inputs_changed" });
  }
  let plan = initial.dryRunJson && storedInitialFingerprint === currentInitialFingerprint ? initial : await dryRunActionPlan(id);
  if (!plan) return null;
  const planMetadata = asObject(asObject(plan.parametersJson).metadata);
  const previewStale = typeof planMetadata.previewFingerprint === "string" && planMetadata.previewFingerprint !== actionExecutionFingerprint(plan);
  const plannedCommands = [...(Array.isArray(asObject(plan.dryRunJson).plannedCommands) ? asObject(plan.dryRunJson).plannedCommands as unknown[] : []), ...(Array.isArray(asObject(plan.dryRunJson).commands) ? asObject(plan.dryRunJson).commands as unknown[] : [])];
  const safeRemoteCommand = plannedCommands.slice(0, 2).map(String).join(" ; ").replace(/(password|passphrase|private[-_ ]?key)\s*[=:]\s*\S+/gi, "$1=[REDACTED]").slice(0, 500) || String(catalogResolution.executionTemplateRef ?? plan.actionType);
  trace("action_preview_checked", { previewStale, staleReason: previewStale ? "user_controlled_inputs_changed" : null, remoteCommand: safeRemoteCommand });
  await audit(plan, "preview_checked", "Prepared command preview fingerprint checked.", { previewStale, staleReason: previewStale ? "user_controlled_inputs_changed" : null });

  if (intent === "preview") return plan;

  if (plan.status === ActionPlanStatus.validation_failed || plan.status === ActionPlanStatus.proposed) {
    await audit(plan, "quick_execute_blocked", "Quick Execute stopped before approval/execution.", {
      status: plan.status,
      validationJson: plan.validationJson,
      dryRunJson: plan.dryRunJson
    });
    trace("action_execution_failed", { connectorInvoked: false, error: "PREVIEW_BLOCKED", status: plan.status });
    throw new ActionExecutionError("PREVIEW_BLOCKED", "پیش‌نمایش آماده اجرا نیست؛ خطاهای اعتبارسنجی یا پارامترهای ناقص را بررسی کنید.");
  }

  if (env.actionExecutionMode === "direct_controlled" || env.actionExecutionMode === "quick_controlled") {
    if (env.appProfile === "staging" && env.actionExecutionMode === "direct_controlled") {
      await audit(plan, "profile_audit_warning", "Staging profile allowed direct controlled execution without a separate approval step.", {
        appProfile: env.appProfile,
        executionMode: env.actionExecutionMode,
        actionType: plan.actionType,
        riskLevel: plan.riskLevel
      });
    }
    await audit(plan, "execution_confirmed", "User confirmed one-click controlled execution.", {
      actionType: plan.actionType,
      executionMode: env.actionExecutionMode
    });
    await audit(plan, "direct_controlled_execution_requested", "One-click controlled execution requested; command planning was automatic.", {
      actionType: plan.actionType,
      catalogControlled: catalogResolution.controlled,
      catalogCommandId: catalogResolution.catalogCommandId,
      catalogSource: catalogResolution.source
    });
    let connectorInvokedDuringExecution = false;
    try {
      const resultPlan = await executeActionPlan(id, input, { ...dependencies, intent, trace: (stage, payload) => { if (stage === "action_connector_invoked") connectorInvokedDuringExecution = true; trace(stage, { remoteCommand: safeRemoteCommand, ...payload }); } });
      if (!resultPlan) return null;
      const result = asObject(resultPlan.resultJson); const connectorInvoked = asObject(asObject(resultPlan.parametersJson).metadata).connectorInvoked === true;
      if (!connectorInvoked || resultPlan.status === ActionPlanStatus.dry_run_ready) throw new ActionExecutionError("PREVIEW_ONLY", "این دستور فقط پیش‌نمایش ساخته و هنوز روی دستگاه اجرا نشده است.");
      trace(resultPlan.status === ActionPlanStatus.succeeded ? "action_execution_succeeded" : "action_execution_failed", { connectorInvoked, remoteCommand: safeRemoteCommand, exitCode: result.exitCode ?? null, stdoutLength: String(result.stdout ?? "").length, stderrLength: String(result.stderr ?? "").length });
      return resultPlan;
    } catch (error) {
      trace("action_execution_failed", { connectorInvoked: connectorInvokedDuringExecution, remoteCommand: safeRemoteCommand, error: error instanceof Error ? error.message : "execution failed" });
      throw error;
    }
  }

  const requirements = approvalRequirements(plan.riskLevel);
  if (requirements.typedApprove) {
    const confirmed = typeof input.approvalConfirmation === "string" && input.approvalConfirmation.trim() === "APPROVE";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const criticalGateMissing = plan.riskLevel === AiRiskLevel.critical && (reason.length === 0 || input.breakGlass !== true);
    if (!confirmed || criticalGateMissing) {
      await audit(plan, "quick_execute_confirmation_required", "Quick Execute requires explicit confirmation for high/critical risk.", {
        riskLevel: plan.riskLevel,
        criticalGateMissing
      });
      throw new QuickExecuteConfirmationRequiredError(
        plan.riskLevel === AiRiskLevel.critical
          ? "Critical risk requires APPROVE, break-glass mode, and a reason."
          : "Safe mode requires APPROVE for this high-risk action.",
        plan
      );
    }
  }

  plan = await approveActionPlan(id, {
    approvedBy: typeof input.approvedBy === "string" ? input.approvedBy : "quick-execute",
    reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "Execute from Action Center",
    approvalConfirmation: input.approvalConfirmation,
    breakGlass: input.breakGlass
  });
  if (!plan) return null;

  return executeActionPlan(id, {
    ...input,
    breakGlass: plan.riskLevel === AiRiskLevel.critical
  }, { ...dependencies, intent, trace: (stage, payload) => trace(stage, { remoteCommand: safeRemoteCommand, ...payload }) });
}
