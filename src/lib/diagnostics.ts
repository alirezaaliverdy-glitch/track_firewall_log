import { API_BASE_URL } from "@/config/frontendEnv";

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

export type NmapScan = {
  id: string;
  state: "completed" | "failed" | "rejected";
  target: string;
  normalizedTarget: string;
  profile: "host_discovery" | "quick_tcp";
  workerInvoked: boolean;
  policyDecision: string;
  reason?: string;
  durationMs?: number;
  exitCode?: number;
  result?: {
    hosts: Array<{
      state: string;
      addresses: Array<{ address: string; type: string }>;
      hostnames: string[];
      ports: Array<{ protocol: string; port: number; state: string; service: string | null; product: string | null; version: string | null }>;
    }>;
    elapsedSeconds: number;
  };
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

export function runNmapScan(target: string, profile: "host_discovery" | "quick_tcp") {
  return requestJson<{ scan: NmapScan }>("/diagnostics/nmap", { method: "POST", body: JSON.stringify({ target, profile }) });
}

export function listNmapScans() {
  return requestJson<{ scans: NmapScan[] }>("/diagnostics/nmap");
}
