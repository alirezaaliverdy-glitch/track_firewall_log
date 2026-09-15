import type { SecurityEvent } from "@/lib/securityEvents";
import { API_BASE_URL } from "@/config/frontendEnv";

export type IncidentStatus = "open" | "investigating" | "resolved" | "false_positive";

export type IncidentFilters = {
  status?: string;
  severity?: string;
  deviceId?: string;
  sourceId?: string;
  ruleType?: string;
  from?: string;
  to?: string;
};

export type Incident = {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: IncidentStatus;
  deviceId: string | null;
  sourceId: string | null;
  ruleId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  eventCount: number;
  summaryJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  device?: { id: string; name: string; type: string; host?: string } | null;
  source?: { id: string; name: string; type: string } | null;
  rule?: { id: string; name: string; ruleType: string; severity?: string } | null;
};

export type IncidentEventsResponse = {
  incidentId: string;
  events: SecurityEvent[];
};

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
};

export const normalizeObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiErrorMessage(url: string, status: number, payload: unknown) {
  const body = normalizeObject(payload);
  const detail = typeof body.error === "string"
    ? `${body.error}${typeof body.detail === "string" ? `: ${body.detail}` : ""}`
    : typeof body.message === "string"
      ? body.message
      : "No response details were provided.";
  return `Incident API error ${status}: ${detail} [${url}]`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`Incident API network error: ${message} [${url}]`);
  }

  const payload = parsePayload(await response.text());
  if (!response.ok) throw new Error(apiErrorMessage(url, response.status, payload));
  return payload as T;
}

export function normalizeIncident(value: unknown): Incident {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    title: String(source.title ?? "Untitled incident"),
    description: String(source.description ?? ""),
    severity: String(source.severity ?? "medium"),
    status: String(source.status ?? "open") as IncidentStatus,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    sourceId: typeof source.sourceId === "string" ? source.sourceId : null,
    ruleId: typeof source.ruleId === "string" ? source.ruleId : null,
    firstSeenAt: typeof source.firstSeenAt === "string" ? source.firstSeenAt : null,
    lastSeenAt: typeof source.lastSeenAt === "string" ? source.lastSeenAt : null,
    eventCount: safeNumber(source.eventCount),
    summaryJson: normalizeObject(source.summaryJson),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
    device: source.device ? normalizeObject(source.device) as Incident["device"] : null,
    source: source.source ? normalizeObject(source.source) as Incident["source"] : null,
    rule: source.rule ? normalizeObject(source.rule) as Incident["rule"] : null,
  };
}

function queryString(filters: IncidentFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && String(value).trim() !== "") params.set(key, String(value).trim());
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getIncidents(filters: IncidentFilters = {}) {
  const payload = await requestJson<unknown>(`/incidents${queryString(filters)}`);
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.incidents).map(normalizeIncident);
}

export async function getIncident(id: string) {
  return requestJson<unknown>(`/incidents/${id}`).then(normalizeIncident);
}

export async function getIncidentEvents(id: string): Promise<IncidentEventsResponse> {
  const payload = await requestJson<unknown>(`/incidents/${id}/events`);
  const source = normalizeObject(payload);
  return {
    incidentId: String(source.incidentId ?? id),
    events: normalizeArray<SecurityEvent>(Array.isArray(payload) ? payload : source.events),
  };
}

export async function updateIncidentStatus(id: string, status: IncidentStatus) {
  return requestJson<unknown>(`/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }).then(normalizeIncident);
}
