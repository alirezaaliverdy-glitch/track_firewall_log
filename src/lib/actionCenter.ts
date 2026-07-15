const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type ActionLifecycle = "draft" | "needs_input" | "ready_for_confirmation" | "confirmed" | "executing" | "succeeded" | "failed" | "cancelled";
export type ActionCenterItem = {
  id: string;
  source: string;
  requestedBy: string | null;
  deviceId: string | null;
  actionType: string;
  status: string;
  lifecycleState: ActionLifecycle;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
  device: { id: string; name: string; vendor: string; type: string; host: string; protocol: string; credentialConfigured: boolean } | null;
  support: { state: string; execution: string; executable: boolean; reason: unknown };
  controls: {
    canReview: boolean; canEditParameters: boolean; canSelectDevice: boolean; canSelectCredential: boolean;
    canPreview: boolean; canConfirm: boolean; canExecute: boolean; canRetry: boolean; canCancel: boolean;
    canViewEvidence: boolean; canViewConnectorResult: boolean; relatedDevicePath: string | null;
  };
  parametersJson: Record<string, unknown>;
  validationJson: Record<string, unknown>;
  commandPreview: Record<string, unknown>;
  approval: Record<string, unknown>;
  connectorResult: Record<string, unknown>;
  rollback: Record<string, unknown>;
  evidence: { connectorInvoked: boolean; integrityError: string | null; approvals: unknown };
  audit?: unknown[];
};

export type ActionCenterResponse = {
  items: ActionCenterItem[];
  total: number;
  offset: number;
  limit: number;
  summary: Record<ActionLifecycle, number>;
  generatedAt: string;
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const LIFECYCLES = new Set<ActionLifecycle>(["draft", "needs_input", "ready_for_confirmation", "confirmed", "executing", "succeeded", "failed", "cancelled"]);

function lifecycle(value: unknown, status: unknown, connectorInvoked: boolean): ActionLifecycle {
  if (LIFECYCLES.has(value as ActionLifecycle)) return value as ActionLifecycle;
  const normalized = String(status ?? "").toLowerCase();
  if (["awaiting_approval", "dry_run_ready"].includes(normalized)) return "ready_for_confirmation";
  if (normalized === "approved") return "confirmed";
  if (normalized === "executing") return "executing";
  if (normalized === "succeeded") return connectorInvoked ? "succeeded" : "failed";
  if (["failed", "validation_failed", "blocked", "rollback_needed"].includes(normalized)) return normalized === "validation_failed" ? "needs_input" : "failed";
  if (["rejected", "rolled_back", "cancelled", "expired"].includes(normalized)) return "cancelled";
  return "draft";
}

export function normalizeActionCenterItem(value: unknown): ActionCenterItem {
  const source = object(value);
  const rawResult = object(source.connectorResult ?? source.resultJson);
  const rawEvidence = object(source.evidence);
  const connectorInvoked = rawEvidence.connectorInvoked === true || rawResult.connectorInvoked === true;
  const state = lifecycle(source.lifecycleState, source.status, connectorInvoked);
  const rawDevice = object(source.device);
  const rawSupport = object(source.support);
  const rawControls = object(source.controls);
  const terminal = ["succeeded", "failed", "cancelled"].includes(state);
  const executable = rawSupport.executable === true;
  return {
    id: String(source.id ?? ""),
    source: String(source.source ?? "unknown"),
    requestedBy: typeof source.requestedBy === "string" ? source.requestedBy : null,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    actionType: String(source.actionType ?? "unknown_action"),
    status: String(source.status ?? "proposed"),
    lifecycleState: state,
    riskLevel: String(source.riskLevel ?? "unknown"),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? source.createdAt ?? ""),
    device: Object.keys(rawDevice).length ? {
      id: String(rawDevice.id ?? source.deviceId ?? ""), name: String(rawDevice.name ?? ""), vendor: String(rawDevice.vendor ?? ""),
      type: String(rawDevice.type ?? ""), host: String(rawDevice.host ?? ""), protocol: String(rawDevice.protocol ?? ""), credentialConfigured: rawDevice.credentialConfigured === true
    } : null,
    support: { state: String(rawSupport.state ?? "unverified"), execution: String(rawSupport.execution ?? "unknown"), executable, reason: rawSupport.reason ?? null },
    controls: {
      canReview: rawControls.canReview !== false, canEditParameters: rawControls.canEditParameters === true || !terminal,
      canSelectDevice: rawControls.canSelectDevice === true || !terminal, canSelectCredential: rawControls.canSelectCredential === true,
      canPreview: rawControls.canPreview === true, canConfirm: rawControls.canConfirm === true,
      canExecute: rawControls.canExecute === true, canRetry: rawControls.canRetry === true || state === "failed",
      canCancel: rawControls.canCancel === true, canViewEvidence: rawControls.canViewEvidence !== false,
      canViewConnectorResult: rawControls.canViewConnectorResult === true || connectorInvoked,
      relatedDevicePath: typeof rawControls.relatedDevicePath === "string" ? rawControls.relatedDevicePath : null
    },
    parametersJson: object(source.parametersJson), validationJson: object(source.validationJson),
    commandPreview: object(source.commandPreview ?? source.dryRunJson), approval: object(source.approval ?? source.approvalJson),
    connectorResult: rawResult, rollback: object(source.rollback ?? source.rollbackJson),
    evidence: { connectorInvoked, integrityError: typeof rawEvidence.integrityError === "string" ? rawEvidence.integrityError : null, approvals: rawEvidence.approvals ?? [] },
    audit: Array.isArray(source.audit) ? source.audit : []
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    const payload = object(body);
    const error = object(payload.error);
    const failure = new Error(String(error.message ?? payload.detail ?? payload.message ?? `Request failed (${response.status})`)) as Error & { status?: number; code?: string };
    failure.status = response.status;
    failure.code = String(error.code ?? payload.error ?? "ACTION_CENTER_ERROR");
    throw failure;
  }
  return body as T;
}

export function listActionCenter(input: { view?: string; q?: string; status?: string; deviceId?: string; offset?: number; limit?: number }) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return request<ActionCenterResponse>(`/action-center?${query.toString()}`).then((response) => ({ ...response, items: Array.isArray(response.items) ? response.items.map(normalizeActionCenterItem) : [] }));
}

export const getActionCenterItem = (id: string) => request<unknown>(`/action-center/${encodeURIComponent(id)}`).then(normalizeActionCenterItem);
export const cancelActionCenterItem = (id: string, reason = "Cancelled from Action Center") => request<unknown>(`/action-center/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }).then(normalizeActionCenterItem);
export const retryActionCenterItem = (id: string) => request<unknown>(`/action-center/${encodeURIComponent(id)}/retry`, { method: "POST", body: "{}" }).then(normalizeActionCenterItem);
export const updateActionCenterTarget = (id: string, deviceId: string) => request<unknown>(`/action-center/${encodeURIComponent(id)}/target`, { method: "PATCH", body: JSON.stringify({ deviceId }) }).then(normalizeActionCenterItem);
export const clearActionCenterHistory = () => request<{ deleted: number; retainedActive: number }>("/action-center/history", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE ACTION HISTORY" }) });
