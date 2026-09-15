export const ASSISTANT_MODES = ["chat", "direct_action", "guided_workflow"] as const;
export type AssistantMode = typeof ASSISTANT_MODES[number];

export type AssistantDecision =
  | { mode: "chat"; message: string; reason: string; deviceId?: string; rawCommandExecution: false }
  | {
      mode: "direct_action";
      deviceId: string;
      intentKey: string;
      parameters: Record<string, unknown>;
      reason: string;
      rawCommandExecution: false;
    }
  | {
      mode: "guided_workflow";
      deviceId: string;
      title: string;
      steps: WorkflowDraftStep[];
      reason: string;
      rawCommandExecution: false;
    };

export type WorkflowDraftStep = {
  clientStepId: string;
  intentKey: string;
  parameters: Record<string, unknown>;
  dependsOn: string[];
  verificationIntentKey?: string;
  rollbackIntentKey?: string;
};

export const REGISTERED_ACTION_MODES = ["read", "write"] as const;
export const REGISTERED_ACTION_EXECUTION_TYPES = ["direct", "guided"] as const;
export const REGISTERED_ACTION_RISKS = ["low", "medium", "high", "critical"] as const;

export type RegisteredAction = {
  key: string;
  vendor: string;
  platforms: string[];
  mode: typeof REGISTERED_ACTION_MODES[number];
  executionType: typeof REGISTERED_ACTION_EXECUTION_TYPES[number];
  parameterSchema: unknown;
  risk: typeof REGISTERED_ACTION_RISKS[number];
  approvalRequired: boolean;
  executable: boolean;
  connector: string;
  verificationKey?: string;
  rollbackKey?: string;
};

export const WORKFLOW_STATES = [
  "draft",
  "resolving",
  "needs_input",
  "ready_for_review",
  "awaiting_approval",
  "approved",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "blocked",
  "cancelled",
  "rollback_running",
  "rolled_back",
] as const;
export type WorkflowState = typeof WORKFLOW_STATES[number];

export const WORKFLOW_STEP_STATES = [
  "draft",
  "resolving",
  "needs_input",
  "blocked",
  "ready",
  "awaiting_approval",
  "queued",
  "running",
  "verifying",
  "succeeded",
  "failed",
  "skipped",
  "retryable",
  "rollback_available",
  "rollback_running",
  "rolled_back",
] as const;
export type WorkflowStepState = typeof WORKFLOW_STEP_STATES[number];

export type WorkflowStep = {
  id: string;
  clientStepId: string;
  intentKey: string;
  state: WorkflowStepState;
  actionKey?: string;
  parameters: Record<string, unknown>;
  dependsOn: string[];
  missingParameters: string[];
  blockedReason?: string;
  verificationIntentKey?: string;
  rollbackIntentKey?: string;
  result?: WorkflowStepResult;
};

export type WorkflowPlan = {
  id: string;
  title: string;
  deviceId: string;
  vendor: string;
  platform?: string | null;
  state: WorkflowState;
  risk: RegisteredAction["risk"];
  steps: WorkflowStep[];
  approval?: ApprovalContract;
  audit: AuditEventContract[];
  rawCommandExecution: false;
};

export type ApprovalContract = {
  required: boolean;
  status: "not_required" | "pending" | "approved" | "rejected" | "expired";
  requestedBy?: string;
  approvedBy?: string;
  decidedAt?: string;
};

export type ExecutionContract = {
  actionPlanId: string;
  workflowId?: string;
  workflowStepId?: string;
  intent: "preview" | "execute";
  deviceId: string;
  connector: string;
  policyGuardChecked: boolean;
  connectorInvoked: boolean;
  rawCommandExecution: false;
};

export type WorkflowStepResult = {
  status: "succeeded" | "failed" | "blocked" | "skipped";
  connectorInvoked: boolean;
  summary: string;
  evidenceRef?: string;
};

export type AuditEventContract = {
  id: string;
  eventType: string;
  actor?: string;
  deviceId?: string;
  actionPlanId?: string;
  workflowId?: string;
  workflowStepId?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export function isExecutableRegisteredAction(action: RegisteredAction) {
  return action.executable && action.connector.trim().length > 0;
}

export function isWorkflowReadyForReview(plan: WorkflowPlan) {
  return plan.state === "ready_for_review" &&
    plan.steps.length > 0 &&
    plan.steps.every((step) => step.state === "ready" && step.missingParameters.length === 0 && !step.blockedReason);
}
