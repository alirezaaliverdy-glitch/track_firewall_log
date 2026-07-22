import type { AiActionDebug, AiActionIntent } from "@/lib/ai";
import type { Device } from "@/lib/devices";

export type AssistantResponseMode = "conversation" | "device_question" | "action_request";
export type AssistantPlanningMode = "chat" | "direct_action" | "guided_workflow";

export type AssistantExecutionState = {
  support: string;
  implementation: string;
  missing: string[];
  nextStep: string;
  template: string | null;
  canCreateActionPlan: boolean;
  manualOnly: boolean;
  executable: boolean;
  executionMode: string;
  lifecycle: { actionPlanId: string; status: string; planRevision: number; planState: string } | null;
};

export type GuidedStartState = {
  blueprintId: string;
  initialValues: Record<string, unknown>;
  vendor: string | null;
  deviceId: string | null;
  initialRequest: string;
};

export type AssistantPlanningInput = {
  backendMode: string | null;
  createdPlanId: string | null;
  guidedStart: GuidedStartState | null;
  actionIntent: AiActionIntent | null;
  actionDebug: AiActionDebug | null;
  executionState: Pick<AssistantExecutionState, "lifecycle"> | null;
};

export type AssistantTargetDevice = Device | null;
