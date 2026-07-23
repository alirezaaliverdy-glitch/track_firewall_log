export type RuntimeKind = "local-mobile" | "server";
export type DeviceVendor = "linux" | "mikrotik" | "fortigate" | "cisco";
export type PlanStatus = "draft" | "needs_input" | "preview_ready" | "approved" | "executing" | "succeeded" | "failed" | "cancelled";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type VerificationState = "pending" | "verified" | "failed" | "unverified";

export type DeviceSummary = {
  id: string;
  name: string;
  vendor: DeviceVendor;
  host: string;
  port: number;
  credentialRef?: string | null;
  trustedHostKeyRef?: string | null;
  verified: boolean;
};

export type DeviceDetails = DeviceSummary & {
  platform?: string | null;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateDeviceInput = {
  name: string;
  vendor: DeviceVendor;
  host: string;
  port?: number;
  credentialRef?: string | null;
};

export type ActionCommandSpec = {
  id: string;
  command: string;
  stream?: "stdout" | "stderr" | "both";
  readOnly: boolean;
  timeoutMs: number;
};

export type CreatePlanInput = {
  deviceId: string;
  actionType: string;
  parameters: Record<string, unknown>;
  source: "catalog" | "assistant" | "monitoring" | "user";
};

export type ActionPlan = {
  id: string;
  deviceId: string;
  actionType: string;
  status: PlanStatus;
  riskLevel: RiskLevel;
  parameters: Record<string, unknown>;
  commandSpecs: ActionCommandSpec[];
  verification: VerificationState;
  createdAt: string;
  updatedAt: string;
};

export type PlanValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: RiskLevel;
  previewHash?: string;
};

export type ApprovalInput = {
  planId: string;
  approvedBy: string;
  reason?: string;
  expiresAt?: string;
};

export type ApprovalReceipt = {
  planId: string;
  approvedAt: string;
  approvalHash: string;
  binding: Record<string, unknown>;
};

export type ExecutePlanInput = {
  planId: string;
  approvalHash: string;
  idempotencyKey: string;
};

export type ExecutionHandle = {
  executionId: string;
  planId: string;
  startedAt: string;
};

export type ExecutionEvent = {
  executionId: string;
  type: "started" | "stdout" | "stderr" | "step_succeeded" | "step_failed" | "verification" | "completed" | "cancelled";
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ExecutionResult = {
  executionId: string;
  planId: string;
  status: "succeeded" | "failed" | "cancelled";
  connectorInvoked: boolean;
  verification: VerificationState;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  completedAt: string;
};

export type AuditFilter = {
  deviceId?: string;
  planId?: string;
  eventType?: string;
};

export type AuditEvent = {
  id: string;
  eventHash: string;
  previousHash: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RuntimeCapabilities = {
  mode: RuntimeKind;
  localOnly: boolean;
  supportsSsh: boolean;
  supportsServerApi: boolean;
  supportsOfflineInventory: boolean;
  supportsSecureVault: boolean;
  supportedVendors: DeviceVendor[];
};
