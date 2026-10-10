import { apiRequest } from "./apiTransport";
import { normalizeActionPlan, normalizeObject, type ActionPlan } from "./actions";

export type ScriptEditorIssue = {
  line: number | null;
  section: "script" | "verification" | "general";
  command: string | null;
  message: string;
  messageFa: string;
};

export type EditableActionScript = {
  sourceActionPlanId: string;
  sourceRevision: number;
  actionType: string;
  riskLevel: string;
  vendor: "linux" | "mikrotik" | "fortigate" | "cisco";
  device: { id: string; name: string; host: string; vendor: string; type: string };
  script: string;
  verificationScript: string;
  limits: { maxExecutionLines: number; maxLineLength: number };
  safety: { rawExecution: false; requiresPreview: true; requiresConfirmation: true; messageFa: string };
};

export class ScriptEditorApiError extends Error {
  code: string;
  issues: ScriptEditorIssue[];

  constructor(code: string, message: string, issues: ScriptEditorIssue[] = []) {
    super(message);
    this.name = "ScriptEditorApiError";
    this.code = code;
    this.issues = issues;
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await apiRequest(path, init);
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    const root = normalizeObject(payload);
    const error = normalizeObject(root.error);
    const issues = Array.isArray(error.issues) ? error.issues as ScriptEditorIssue[] : [];
    throw new ScriptEditorApiError(
      String(error.code ?? "SCRIPT_EDITOR_ERROR"),
      String(error.messageFa ?? error.message ?? root.detail ?? "ویرایشگر اسکریپت با خطا روبه‌رو شد."),
      issues,
    );
  }
  return normalizeObject(payload);
}

export async function getEditableActionScript(actionPlanId: string): Promise<EditableActionScript> {
  return request(`/actions/${encodeURIComponent(actionPlanId)}/script-editor`) as Promise<unknown> as Promise<EditableActionScript>;
}

export async function createEditedScriptPreview(actionPlanId: string, input: {
  sourceRevision: number;
  script: string;
  verificationScript: string;
}): Promise<{ actionPlan: ActionPlan; validation: { valid: true; warnings: string[]; normalizedLines: number; verificationLines: number; rawExecution: false } }> {
  const payload = await request(`/actions/${encodeURIComponent(actionPlanId)}/script-editor/preview`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return {
    actionPlan: normalizeActionPlan(payload.actionPlan),
    validation: normalizeObject(payload.validation) as { valid: true; warnings: string[]; normalizedLines: number; verificationLines: number; rawExecution: false },
  };
}
