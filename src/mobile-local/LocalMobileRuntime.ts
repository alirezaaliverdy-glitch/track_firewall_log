import { buildLocalApprovalBinding, approvalStillMatches, sha256Hex } from "../../packages/action-core/src/index";
import type {
  ApprovalInput,
  ApprovalReceipt,
  AuditEvent,
  AuditFilter,
  ActionPlan,
  CreateDeviceInput,
  CreatePlanInput,
  DeviceDetails,
  DeviceSummary,
  ExecutePlanInput,
  ExecutionEvent,
  ExecutionHandle,
  ExecutionResult,
  RuntimeCapabilities
} from "../../packages/contracts/src/index";
import { evaluateLocalPolicyGuard } from "../../packages/policy-core/src/index";
import { templateFor } from "../../packages/vendor-schemas/src/index";
import { createLocalMobileRepository } from "@/mobile-local/persistence/CapacitorSqliteRepository";
import type { LocalMobileRepository } from "@/mobile-local/persistence/LocalMobileRepository";
import { NativeLocalSshExecutor, type LocalSshExecutor } from "@/mobile-local/execution/LocalSshExecutor";
import { sanitizeTerminalOutput, verifyExecutionResult } from "../../packages/verification-core/src/index";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderCommand(command: string, parameters: Record<string, unknown>) {
  return Object.entries(parameters).reduce(
    (text, [key, value]) => text.replaceAll(`\${${key}}`, String(value)),
    command
  );
}

export class LocalMobileRuntime {
  readonly kind = "local-mobile" as const;
  private readonly repository: LocalMobileRepository;
  private readonly ssh: LocalSshExecutor;
  private initialized = false;

  constructor(repository: LocalMobileRepository = createLocalMobileRepository(), ssh: LocalSshExecutor = new NativeLocalSshExecutor()) {
    this.repository = repository;
    this.ssh = ssh;
  }

  async getCapabilities(): Promise<RuntimeCapabilities> {
    return {
      mode: "local-mobile",
      localOnly: true,
      supportsSsh: true,
      supportsServerApi: false,
      supportsOfflineInventory: true,
      supportsSecureVault: true,
      supportedVendors: ["linux", "mikrotik", "fortigate", "cisco"]
    };
  }

  async listDevices(): Promise<DeviceSummary[]> {
    await this.ensureInitialized();
    return this.repository.listDevices();
  }

  async createDevice(input: CreateDeviceInput): Promise<DeviceDetails> {
    await this.ensureInitialized();
    const createdAt = now();
    const device: DeviceDetails = {
      id: id("local-device"),
      name: input.name,
      vendor: input.vendor,
      host: input.host,
      port: input.port ?? 22,
      credentialRef: input.credentialRef ?? null,
      trustedHostKeyRef: null,
      verified: false,
      platform: null,
      capabilities: [],
      createdAt,
      updatedAt: createdAt
    };
    await this.repository.saveDevice(device);
    await this.audit("local.device.created", { deviceId: device.id, host: device.host, vendor: device.vendor });
    return device;
  }

  async createPlan(input: CreatePlanInput): Promise<ActionPlan> {
    await this.ensureInitialized();
    const device = await this.repository.getDevice(input.deviceId);
    if (!device) throw new Error("LOCAL_DEVICE_NOT_FOUND");
    const template = templateFor(device.vendor, input.actionType);
    if (!template) throw new Error("LOCAL_TEMPLATE_NOT_REGISTERED");
    const createdAt = now();
    const plan: ActionPlan = {
      id: id("local-plan"),
      deviceId: device.id,
      actionType: input.actionType,
      status: "draft",
      riskLevel: template.riskLevel,
      parameters: { ...input.parameters, source: input.source, monitoring: template.monitoring },
      commandSpecs: template.commandSpecs.map((command) => ({ ...command, command: renderCommand(command.command, input.parameters) })),
      verification: "pending",
      createdAt,
      updatedAt: createdAt
    };
    await this.repository.savePlan(plan);
    await this.audit("local.plan.created", { planId: plan.id, deviceId: device.id, actionType: plan.actionType });
    return plan;
  }

  async validatePlan(planId: string) {
    await this.ensureInitialized();
    const plan = await this.requirePlan(planId);
    const validation = evaluateLocalPolicyGuard(plan, await this.repository.getDevice(plan.deviceId));
    if (validation.valid) await this.repository.savePlan({ ...plan, status: "preview_ready", updatedAt: now() });
    await this.audit(validation.valid ? "local.plan.validated" : "local.plan.validation_failed", { planId, errors: validation.errors });
    return validation;
  }

  async approvePlan(input: ApprovalInput): Promise<ApprovalReceipt> {
    await this.ensureInitialized();
    const plan = await this.requirePlan(input.planId);
    const device = await this.requireDevice(plan.deviceId);
    if (plan.status !== "preview_ready") throw new Error("LOCAL_PREVIEW_REQUIRED");
    if (!device.credentialRef) throw new Error("LOCAL_CREDENTIAL_REF_REQUIRED");
    if (!device.trustedHostKeyRef) throw new Error("LOCAL_TRUSTED_HOST_KEY_REQUIRED");
    const receipt = await buildLocalApprovalBinding({
      plan,
      device,
      credentialRef: device.credentialRef,
      trustedHostKeyFingerprint: device.trustedHostKeyRef,
      approval: input
    });
    await this.repository.saveApproval(receipt);
    await this.repository.savePlan({ ...plan, status: "approved", updatedAt: now() });
    await this.audit("local.plan.approved", { planId: plan.id, approvalHash: receipt.approvalHash, binding: receipt.binding });
    return receipt;
  }

  async executePlan(input: ExecutePlanInput): Promise<ExecutionHandle> {
    await this.ensureInitialized();
    const existing = await this.repository.getExecutionResult(input.idempotencyKey);
    if (existing) return { executionId: existing.executionId, planId: existing.planId, startedAt: existing.completedAt };
    const plan = await this.requirePlan(input.planId);
    const device = await this.requireDevice(plan.deviceId);
    const receipt = await this.repository.getApproval(plan.id);
    if (!receipt || !await approvalStillMatches(plan, input.approvalHash, receipt.binding)) throw new Error("LOCAL_APPROVAL_BINDING_INVALID");
    const validation = evaluateLocalPolicyGuard(plan, device);
    if (!validation.valid) throw new Error(`LOCAL_POLICY_GUARD_BLOCKED: ${validation.errors.join("; ")}`);

    const executionId = input.idempotencyKey;
    const startedAt = now();
    const executingPlan = { ...plan, status: "executing" as const, updatedAt: startedAt };
    await this.repository.savePlan(executingPlan);
    await this.repository.saveExecutionResult({
      executionId,
      planId: plan.id,
      status: "executing",
      connectorInvoked: false,
      verification: "pending",
      stdout: "",
      stderr: "",
      exitCode: null,
      completedAt: startedAt
    });
    await this.repository.appendExecutionEvent({ executionId, type: "started", message: "Local SSH execution requested.", createdAt: startedAt });
    await this.audit("local.execution.started", { executionId, planId: plan.id, deviceId: device.id, approvalHash: input.approvalHash });

    try {
      const handle = await this.ssh.startExecution({
        executionId,
        plan: executingPlan,
        device,
        idempotencyKey: input.idempotencyKey,
        onEvent: (event) => this.recordNativeExecutionEvent(plan.id, event)
      });
      await this.repository.saveExecutionResult({
        executionId,
        planId: plan.id,
        status: "executing",
        connectorInvoked: true,
        verification: "pending",
        stdout: "",
        stderr: "",
        exitCode: null,
        completedAt: startedAt
      });
      await this.audit("local.connector.invoked", { executionId, planId: plan.id, deviceId: device.id });
      return handle;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local SSH execution failed.";
      const result = {
        executionId,
        planId: plan.id,
        status: "failed" as const,
        connectorInvoked: false,
        verification: "failed" as const,
        stdout: "",
        stderr: sanitizeTerminalOutput(message),
        exitCode: null,
        completedAt: now()
      };
      await this.repository.saveExecutionResult(result);
      await this.repository.savePlan({ ...plan, status: "failed", verification: verifyExecutionResult(result), updatedAt: result.completedAt });
      await this.audit("local.execution.failed", { executionId, planId: plan.id, error: message });
      throw error;
    }
  }

  async cancelExecution(executionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.ssh.cancel(executionId);
    const result = await this.repository.getExecutionResult(executionId);
    if (result) await this.repository.saveExecutionResult({ ...result, status: "cancelled", completedAt: now() });
    await this.audit("local.execution.cancelled", { executionId });
  }

  async *observeExecution(executionId: string): AsyncIterable<ExecutionEvent> {
    await this.ensureInitialized();
    for (const event of await this.repository.listExecutionEvents(executionId)) yield event;
  }

  async getExecutionResult(executionId: string): Promise<ExecutionResult> {
    await this.ensureInitialized();
    const result = await this.repository.getExecutionResult(executionId);
    if (!result) throw new Error("LOCAL_EXECUTION_RESULT_NOT_FOUND");
    return result;
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    await this.ensureInitialized();
    return (await this.repository.listAuditEvents()).filter((event) =>
      (!filter?.deviceId || event.payload.deviceId === filter.deviceId) &&
      (!filter?.planId || event.payload.planId === filter.planId) &&
      (!filter?.eventType || event.eventType === filter.eventType)
    );
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    await this.repository.initialize();
    this.initialized = true;
  }

  private async requireDevice(deviceId: string) {
    const device = await this.repository.getDevice(deviceId);
    if (!device) throw new Error("LOCAL_DEVICE_NOT_FOUND");
    return device;
  }

  private async requirePlan(planId: string) {
    const plan = await this.repository.getPlan(planId);
    if (!plan) throw new Error("LOCAL_PLAN_NOT_FOUND");
    return plan;
  }

  private async audit(eventType: string, payload: Record<string, unknown>) {
    const events = await this.repository.listAuditEvents();
    const previous = events.at(-1)?.eventHash ?? null;
    const createdAt = now();
    const eventHash = await sha256Hex({ previousHash: previous, eventType, payload, createdAt });
    const event: AuditEvent = {
      id: id("local-audit"),
      eventHash,
      previousHash: previous,
      eventType,
      payload,
      createdAt
    };
    await this.repository.appendAuditEvent(event);
  }

  private async recordNativeExecutionEvent(planId: string, event: ExecutionEvent) {
    await this.repository.appendExecutionEvent(event);
    const existing = await this.repository.getExecutionResult(event.executionId);
    if (!existing) return;
    const stdout = event.type === "stdout" ? sanitizeTerminalOutput(String(event.metadata?.data ?? event.message)) : "";
    const stderr = event.type === "stderr" ? sanitizeTerminalOutput(String(event.metadata?.data ?? event.message)) : "";
    const merged = {
      ...existing,
      stdout: sanitizeTerminalOutput(`${existing.stdout}${stdout}`),
      stderr: sanitizeTerminalOutput(`${existing.stderr}${stderr}`)
    };
    if (event.type === "completed" || event.type === "cancelled") {
      const exitCode = typeof event.metadata?.exitCode === "number" ? event.metadata.exitCode : event.type === "cancelled" ? 130 : 0;
      const failed = exitCode !== 0 || /failed|timeout|mismatch|authentication/i.test(event.message);
      const status = event.type === "cancelled" ? "cancelled" : failed ? "failed" : "succeeded";
      const completedAt = event.createdAt || now();
      const result = {
        ...merged,
        status,
        exitCode,
        verification: status === "succeeded" ? "verified" : status === "failed" ? "failed" : "unverified",
        completedAt
      } as const;
      await this.repository.saveExecutionResult(result);
      const plan = await this.repository.getPlan(planId);
      if (plan) await this.repository.savePlan({ ...plan, status, verification: result.verification, updatedAt: completedAt });
      await this.audit(status === "succeeded" ? "local.execution.completed" : status === "cancelled" ? "local.execution.cancelled" : "local.execution.failed", { executionId: event.executionId, planId, exitCode, message: event.message });
      return;
    }
    await this.repository.saveExecutionResult(merged);
  }
}
