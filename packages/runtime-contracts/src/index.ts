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
  PlanValidationResult,
  RuntimeCapabilities,
  RuntimeKind
} from "../../contracts/src/index";

export type { RuntimeKind };

export interface ExecutionRuntime {
  readonly kind: RuntimeKind;
  getCapabilities(): Promise<RuntimeCapabilities>;
  listDevices(): Promise<DeviceSummary[]>;
  createDevice(input: CreateDeviceInput): Promise<DeviceDetails>;
  createPlan(input: CreatePlanInput): Promise<ActionPlan>;
  validatePlan(planId: string): Promise<PlanValidationResult>;
  approvePlan(input: ApprovalInput): Promise<ApprovalReceipt>;
  executePlan(input: ExecutePlanInput): Promise<ExecutionHandle>;
  cancelExecution(executionId: string): Promise<void>;
  observeExecution(executionId: string): AsyncIterable<ExecutionEvent>;
  getExecutionResult(executionId: string): Promise<ExecutionResult>;
  listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]>;
}

export type RuntimeSelector = () => ExecutionRuntime;
