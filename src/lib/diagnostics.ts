const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type DiagnosticSession = {
  id: string;
  state: "completed" | "failed";
  target: string;
  normalizedTarget: string;
  targetKind: string;
  provider: string;
  providerInvoked: boolean;
  checks: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  evidence: Record<string, unknown>;
  createdAt: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && payload?.error?.message) throw new Error(payload.error.message);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return payload as T;
}

export function runDiagnostic(target: string) {
  return requestJson<{ session: DiagnosticSession }>("/diagnostics/sessions", { method: "POST", body: JSON.stringify({ target }) });
}

export function listDiagnostics() {
  return requestJson<{ sessions: DiagnosticSession[] }>("/diagnostics/sessions");
}
