import type { ApprovalReceipt, AuditEvent, ActionPlan, DeviceDetails, ExecutionEvent, ExecutionResult } from "../../../packages/contracts/src/index";

export interface LocalMobileRepository {
  initialize(): Promise<void>;
  resetLocalData(): Promise<void>;
  listDevices(): Promise<DeviceDetails[]>;
  saveDevice(device: DeviceDetails): Promise<void>;
  getDevice(deviceId: string): Promise<DeviceDetails | null>;
  savePlan(plan: ActionPlan): Promise<void>;
  getPlan(planId: string): Promise<ActionPlan | null>;
  saveApproval(receipt: ApprovalReceipt): Promise<void>;
  getApproval(planId: string): Promise<ApprovalReceipt | null>;
  saveExecutionResult(result: ExecutionResult): Promise<void>;
  getExecutionResult(executionId: string): Promise<ExecutionResult | null>;
  appendExecutionEvent(event: ExecutionEvent): Promise<void>;
  listExecutionEvents(executionId: string): Promise<ExecutionEvent[]>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(): Promise<AuditEvent[]>;
}

export class InMemoryLocalMobileRepository implements LocalMobileRepository {
  private readonly devices = new Map<string, DeviceDetails>();
  private readonly plans = new Map<string, ActionPlan>();
  private readonly approvals = new Map<string, ApprovalReceipt>();
  private readonly results = new Map<string, ExecutionResult>();
  private readonly executionEvents = new Map<string, ExecutionEvent[]>();
  private readonly auditEvents: AuditEvent[] = [];

  async initialize() {
    return;
  }

  async resetLocalData() {
    this.devices.clear();
    this.plans.clear();
    this.approvals.clear();
    this.results.clear();
    this.executionEvents.clear();
    this.auditEvents.splice(0);
  }

  async listDevices() {
    return [...this.devices.values()];
  }

  async saveDevice(device: DeviceDetails) {
    this.devices.set(device.id, device);
  }

  async getDevice(deviceId: string) {
    return this.devices.get(deviceId) ?? null;
  }

  async savePlan(plan: ActionPlan) {
    this.plans.set(plan.id, plan);
  }

  async getPlan(planId: string) {
    return this.plans.get(planId) ?? null;
  }

  async saveApproval(receipt: ApprovalReceipt) {
    this.approvals.set(receipt.planId, receipt);
  }

  async getApproval(planId: string) {
    return this.approvals.get(planId) ?? null;
  }

  async saveExecutionResult(result: ExecutionResult) {
    this.results.set(result.executionId, result);
  }

  async getExecutionResult(executionId: string) {
    return this.results.get(executionId) ?? null;
  }

  async appendExecutionEvent(event: ExecutionEvent) {
    this.executionEvents.set(event.executionId, [...(this.executionEvents.get(event.executionId) ?? []), event]);
  }

  async listExecutionEvents(executionId: string) {
    return this.executionEvents.get(executionId) ?? [];
  }

  async appendAuditEvent(event: AuditEvent) {
    this.auditEvents.push(event);
  }

  async listAuditEvents() {
    return [...this.auditEvents];
  }
}
