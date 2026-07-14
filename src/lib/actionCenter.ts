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
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  return request<ActionCenterResponse>(`/action-center?${query.toString()}`);
}

export const getActionCenterItem = (id: string) => request<ActionCenterItem>(`/action-center/${encodeURIComponent(id)}`);
export const cancelActionCenterItem = (id: string, reason = "Cancelled from Action Center") => request<ActionCenterItem>(`/action-center/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
export const retryActionCenterItem = (id: string) => request<ActionCenterItem>(`/action-center/${encodeURIComponent(id)}/retry`, { method: "POST", body: "{}" });
export const updateActionCenterTarget = (id: string, deviceId: string) => request<ActionCenterItem>(`/action-center/${encodeURIComponent(id)}/target`, { method: "PATCH", body: JSON.stringify({ deviceId }) });
