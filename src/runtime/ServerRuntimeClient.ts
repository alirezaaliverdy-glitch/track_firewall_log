import { approveAction, executeAction, getAction, getActionAudit, normalizeObject, proposeAction, validateAction } from "@/lib/actions";
import { createDevice as createServerDevice, listDevices as listServerDevices } from "@/lib/devices";
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
import type { ExecutionRuntime } from "../../packages/runtime-contracts/src/index";

function now() {
  return new Date().toISOString();
}

function vendor(value: string): DeviceSummary["vendor"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("mikrotik") || normalized.includes("routeros")) return "mikrotik";
  if (normalized.includes("forti")) return "fortigate";
  if (normalized.includes("cisco")) return "cisco";
  return "linux";
}

function mapDevice(input: Awaited<ReturnType<typeof listServerDevices>>[number]): DeviceDetails {
  return {
    id: input.id,
    name: input.name,
    vendor: vendor(input.vendor || input.type),
    host: input.host,
    port: input.managementPort,
    credentialRef: input.credentialRef ?? input.credentialId,
    trustedHostKeyRef: typeof input.capabilities.trustedHostKeyRef === "string" ? input.capabilities.trustedHostKeyRef : null,
    verified: input.status === "online",
    platform: typeof input.capabilities.platform === "string" ? input.capabilities.platform : input.type,
    capabilities: Array.isArray(input.capabilities.supportedActions) ? input.capabilities.supportedActions.map(String) : [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

function mapPlan(input: Awaited<ReturnType<typeof getAction>>): ActionPlan {
  const dryRun = normalizeObject(input.dryRunJson);
  const metadata = normalizeObject(input.parametersJson.metadata);
  const commandSpecs = Array.isArray(dryRun.commandSpecs)
    ? dryRun.commandSpecs as ActionPlan["commandSpecs"]
    : [];
  return {
    id: input.id,
    deviceId: input.deviceId ?? "",
    actionType: input.actionType,
    status: input.status === "dry_run_ready" ? "preview_ready" : input.status === "running" || input.status === "executing" ? "executing" : input.status === "approved" ? "approved" : input.status === "succeeded" ? "succeeded" : input.status === "failed" ? "failed" : "draft",
    riskLevel: input.riskLevel as ActionPlan["riskLevel"],
    parameters: input.parametersJson,
    commandSpecs,
    verification: String(metadata.verificationStatus ?? "") === "passed" ? "verified" : "pending",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export class ServerRuntimeClient implements ExecutionRuntime {
  readonly kind = "server" as const;

  async getCapabilities(): Promise<RuntimeCapabilities> {
    return {
      mode: "server",
      localOnly: false,
      supportsSsh: true,
      supportsServerApi: true,
      supportsOfflineInventory: false,
      supportsSecureVault: false,
      supportedVendors: ["linux", "mikrotik", "fortigate", "cisco"]
    };
  }

  async listDevices(): Promise<DeviceSummary[]> {
    return (await listServerDevices()).map(mapDevice);
  }

  async createDevice(input: CreateDeviceInput): Promise<DeviceDetails> {
    return mapDevice(await createServerDevice({
      name: input.name,
      vendor: input.vendor,
      type: input.vendor === "linux" ? "linux_edge" : input.vendor === "cisco" ? "generic_firewall" : input.vendor,
      host: input.host,
      managementPort: input.port ?? 22,
      protocol: "ssh",
      credentialRef: input.credentialRef,
      environment: "lab",
      tags: [],
      capabilities: {}
    }));
  }

  async createPlan(input: CreatePlanInput): Promise<ActionPlan> {
    return mapPlan(await proposeAction({ deviceId: input.deviceId, actionType: input.actionType, parametersJson: input.parameters, source: input.source === "assistant" ? "ai" : "user" }));
  }

  async validatePlan(planId: string) {
    const plan = await validateAction(planId);
    const validation = normalizeObject(plan.validationJson);
    return {
      valid: validation.valid !== false,
      errors: Array.isArray(validation.errors) ? validation.errors.map(String) : [],
      warnings: Array.isArray(validation.warnings) ? validation.warnings.map(String) : [],
      riskLevel: plan.riskLevel as ActionPlan["riskLevel"],
      previewHash: typeof normalizeObject(plan.parametersJson.metadata).previewHash === "string" ? String(normalizeObject(plan.parametersJson.metadata).previewHash) : undefined
    };
  }

  async approvePlan(input: ApprovalInput): Promise<ApprovalReceipt> {
    const plan = await approveAction(input.planId, { approvedBy: input.approvedBy, reason: input.reason });
    const approval = normalizeObject(plan.approvalJson);
    return {
      planId: plan.id,
      approvedAt: String(approval.approvedAt ?? now()),
      approvalHash: String(normalizeObject(approval.approvalBinding).approvalHash ?? approval.previewHash ?? ""),
      binding: normalizeObject(approval.approvalBinding)
    };
  }

  async executePlan(input: ExecutePlanInput): Promise<ExecutionHandle> {
    await executeAction(input.planId, { approvalHash: input.approvalHash, idempotencyKey: input.idempotencyKey });
    return { executionId: input.idempotencyKey, planId: input.planId, startedAt: now() };
  }

  async cancelExecution(): Promise<void> {
    throw new Error("SERVER_RUNTIME_CANCEL_NOT_IMPLEMENTED");
  }

  async *observeExecution(executionId: string): AsyncIterable<ExecutionEvent> {
    yield { executionId, type: "completed", message: "Server execution events are available through Action Center polling.", createdAt: now() };
  }

  async getExecutionResult(executionId: string): Promise<ExecutionResult> {
    const plan = await getAction(executionId);
    const result = normalizeObject(plan.resultJson);
    return {
      executionId,
      planId: plan.id,
      status: plan.status === "succeeded" ? "succeeded" : plan.status === "failed" ? "failed" : "cancelled",
      connectorInvoked: result.connectorInvoked === true,
      verification: String(result.resultState ?? "").includes("verified") ? "verified" : "unverified",
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      completedAt: String(result.executionCompletedAt ?? plan.updatedAt)
    };
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    if (!filter?.planId) return [];
    return (await getActionAudit(filter.planId)).map((entry) => ({
      id: entry.id,
      eventHash: String(entry.metadataJson.eventHash ?? ""),
      previousHash: typeof entry.metadataJson.previousHash === "string" ? entry.metadataJson.previousHash : null,
      eventType: entry.eventType,
      payload: entry.metadataJson,
      createdAt: entry.createdAt
    }));
  }
}
