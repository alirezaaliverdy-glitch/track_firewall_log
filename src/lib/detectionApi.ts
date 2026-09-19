import { API_BASE_URL } from "@/config/frontendEnv";

export type DetectionRunOptions = {
  batchId?: string;
  deviceId?: string;
  sourceId?: string;
  timeWindowMinutes?: number;
};

export type DetectionRunResult = {
  rulesEvaluated: number;
  incidentsCreated: number;
  incidentsUpdated: number;
  matchedEvents: number;
};

export type DetectionRule = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  ruleType: string;
  queryJson: Record<string, unknown>;
  thresholdJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
};

const normalizeObject = (value: unknown): Record<string, unknown> =>
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
  return `Detection API error ${status}: ${detail} [${url}]`;
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
    throw new Error(`Detection API network error: ${message} [${url}]`);
  }

  const payload = parsePayload(await response.text());
  if (!response.ok) throw new Error(apiErrorMessage(url, response.status, payload));
  return payload as T;
}

function normalizeRunResult(value: unknown): DetectionRunResult {
  const source = normalizeObject(value);
  return {
    rulesEvaluated: safeNumber(source.rulesEvaluated),
    incidentsCreated: safeNumber(source.incidentsCreated),
    incidentsUpdated: safeNumber(source.incidentsUpdated),
    matchedEvents: safeNumber(source.matchedEvents),
  };
}

function normalizeRule(value: unknown): DetectionRule {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    name: String(source.name ?? "Unnamed rule"),
    description: String(source.description ?? ""),
    enabled: Boolean(source.enabled ?? false),
    severity: String(source.severity ?? "medium"),
    ruleType: String(source.ruleType ?? "unknown"),
    queryJson: normalizeObject(source.queryJson),
    thresholdJson: normalizeObject(source.thresholdJson),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
  };
}

export async function runDetections(options: DetectionRunOptions = {}) {
  return requestJson<unknown>("/detections/run", {
    method: "POST",
    body: JSON.stringify(options),
  }).then(normalizeRunResult);
}

export async function getDetectionRules() {
  const payload = await requestJson<unknown>("/detection-rules");
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.rules).map(normalizeRule);
}

export async function updateDetectionRule(id: string, patch: Partial<DetectionRule>) {
  return requestJson<unknown>(`/detection-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then(normalizeRule);
}
