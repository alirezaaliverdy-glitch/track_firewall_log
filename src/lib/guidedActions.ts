import type { ActionPlan } from "./actions";
import type { GuidedActionField } from "./commandCatalog";

const API = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type GuidedActionStep = {
  id: string;
  titleFa: string;
  descriptionFa?: string;
  fields: GuidedActionField[];
};

export type GuidedActionBlueprint = {
  id: string;
  vendor: string;
  titleFa: string;
  descriptionFa: string;
  category: string;
  risk: string;
  implementationState: string;
  researchStatus: string;
  steps: GuidedActionStep[];
};

export type GuidedSession = {
  sessionId: string;
  status: "collecting_inputs" | "ready_to_build" | "built" | "cancelled";
  blueprint: GuidedActionBlueprint;
  currentStep: GuidedActionStep | null;
  answers: Record<string, unknown>;
  actionPlanId?: string;
  actionPlan?: ActionPlan;
  preview?: Record<string, unknown>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.messageFa ?? body.error ?? "خطا در ارتباط با سرور");
  return body as T;
}

export function startGuidedSession(input: { blueprintId: string; deviceId: string; vendor: string; initialRequest: string; initialValues: Record<string, unknown> }) {
  return request<GuidedSession>("/action-sessions/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function answerGuidedSession(sessionId: string, input: { stepId: string; values: Record<string, unknown> }) {
  return request<GuidedSession>(`/action-sessions/${encodeURIComponent(sessionId)}/answers`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function buildGuidedPlan(sessionId: string) {
  return request<GuidedSession>(`/action-sessions/${encodeURIComponent(sessionId)}/build-plan`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function cancelGuidedSession(sessionId: string) {
  return request<GuidedSession>(`/action-sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
}
