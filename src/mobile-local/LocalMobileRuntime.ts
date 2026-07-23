import { buildLocalApprovalBinding, approvalStillMatches } from "../../packages/action-core/src/index";
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
  private initialized = false;

  constructor(repository: LocalMobileRepository = createLocalMobileRepository()) {
    this.repository = repository;
  }

  async getCapabilities(): Promise<RuntimeCapabilities> {
    return {
      mode: "local-mobile",
      localOnly: true,
      supportsSsh: false,
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
    const plan = await this.requirePlan(input.planId);
    const receipt = await this.repository.getApproval(plan.id);
    if (!receipt || !await approvalStillMatches(plan, input.approvalHash, receipt.binding)) throw new Error("LOCAL_APPROVAL_BINDING_INVALID");
    throw new Error("LOCAL_SSH_PLUGIN_NOT_CONFIGURED");
  }

  async cancelExecution(executionId: string): Promise<void> {
    await this.ensureInitialized();
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
    const event: AuditEvent = {
      id: id("local-audit"),
      eventHash: `${previous ?? "root"}:${eventType}:${events.length}`,
      previousHash: previous,
      eventType,
      payload,
      createdAt: now()
    };
    await this.repository.appendAuditEvent(event);
  }
}
