const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type AiRole = "user" | "assistant" | "system" | "tool";

export type AiMessage = {
  id: string;
  sessionId: string;
  role: AiRole;
  content: string;
  structuredJson: Record<string, unknown>;
  createdAt: string;
};

export type AiSession = {
  id: string;
  title: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AiMessage[];
  intents?: AiActionIntent[];
};

export type AiActionIntent = {
  id: string;
  sessionId: string;
  messageId: string | null;
  deviceId: string | null;
  intentType: string;
  status: string;
  riskLevel: string;
  parametersJson: Record<string, unknown>;
  explanation: string;
  createdAt: string;
  updatedAt: string;
  device?: { id: string; name: string; type: string } | null;
};

export type AiChatResponse = {
  sessionId: string;
  message: AiMessage | null;
  assistantMessage: AiMessage | null;
  actionIntent: AiActionIntent | null;
  providerStatus: AiProviderStatus | null;
  structured: StructuredAiResponse | null;
};

export type StructuredAiIntent = {
  intentType: string;
  riskLevel: string;
  targetDeviceHint: string | null;
  parameters: Record<string, unknown>;
  missingFields: string[];
  clarificationQuestions: string[];
  explanation: string;
};

export type StructuredAiResponse = {
  assistantMessage: string;
  shouldCreateIntent: boolean;
  intent: StructuredAiIntent | null;
  confidence: number;
};

export type AiProviderStatus = {
  provider: string;
  model: string;
  keyConfigured: boolean;
  baseUrlConfigured: boolean;
  timeoutMs: number;
  maxContextEvents: number;
  maxContextIncidents: number;
  executionAllowed: boolean;
  lastError: string | null;
};

export type SecuritySummary = {
  generatedAt: string;
  recentWindowMinutes: number;
  incidents: Record<string, unknown>;
  events: {
    recentCount: number;
    topSourceIps: Array<{ srcIp: string | null; count: number }>;
    sensitivePorts: Array<{ dstPort: number | null; count: number }>;
  };
  devices: Array<Record<string, unknown>>;
  eventBatches: Array<Record<string, unknown>>;
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
  return `AI API error ${status}: ${detail} [${url}]`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`AI API network error: ${message} [${url}]`);
  }

  const payload = parsePayload(await response.text());
  if (!response.ok) throw new Error(apiErrorMessage(url, response.status, payload));
  return payload as T;
}

export function normalizeAiMessage(value: unknown): AiMessage {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    sessionId: String(source.sessionId ?? ""),
    role: String(source.role ?? "assistant") as AiRole,
    content: String(source.content ?? ""),
    structuredJson: normalizeObject(source.structuredJson),
    createdAt: String(source.createdAt ?? ""),
  };
}

export function normalizeAiIntent(value: unknown): AiActionIntent {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    sessionId: String(source.sessionId ?? ""),
    messageId: typeof source.messageId === "string" ? source.messageId : null,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    intentType: String(source.intentType ?? "unknown"),
    status: String(source.status ?? "proposed"),
    riskLevel: String(source.riskLevel ?? "medium"),
    parametersJson: normalizeObject(source.parametersJson),
    explanation: String(source.explanation ?? ""),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
    device: source.device ? normalizeObject(source.device) as AiActionIntent["device"] : null,
  };
}

function normalizeSession(value: unknown): AiSession {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    title: String(source.title ?? "Security chat"),
    userId: typeof source.userId === "string" ? source.userId : null,
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
    messages: normalizeArray<unknown>(source.messages).map(normalizeAiMessage),
    intents: normalizeArray<unknown>(source.intents).map(normalizeAiIntent),
  };
}

function normalizeSummary(value: unknown): SecuritySummary {
  const source = normalizeObject(value);
  const events = normalizeObject(source.events);
  return {
    generatedAt: String(source.generatedAt ?? ""),
    recentWindowMinutes: safeNumber(source.recentWindowMinutes),
    incidents: normalizeObject(source.incidents),
    events: {
      recentCount: safeNumber(events.recentCount),
      topSourceIps: normalizeArray<Record<string, unknown>>(events.topSourceIps).map((item) => ({
        srcIp: typeof item.srcIp === "string" ? item.srcIp : null,
        count: safeNumber(item.count),
      })),
      sensitivePorts: normalizeArray<Record<string, unknown>>(events.sensitivePorts).map((item) => ({
        dstPort: item.dstPort === null || item.dstPort === undefined ? null : safeNumber(item.dstPort),
        count: safeNumber(item.count),
      })),
    },
    devices: normalizeArray<Record<string, unknown>>(source.devices),
    eventBatches: normalizeArray<Record<string, unknown>>(source.eventBatches),
  };
}

function normalizeStructuredIntent(value: unknown): StructuredAiIntent | null {
  const source = normalizeObject(value);
  if (Object.keys(source).length === 0) return null;
  return {
    intentType: String(source.intentType ?? "unknown"),
    riskLevel: String(source.riskLevel ?? "medium"),
    targetDeviceHint: typeof source.targetDeviceHint === "string" ? source.targetDeviceHint : null,
    parameters: normalizeObject(source.parameters),
    missingFields: normalizeArray<unknown>(source.missingFields).map(String),
    clarificationQuestions: normalizeArray<unknown>(source.clarificationQuestions).map(String),
    explanation: String(source.explanation ?? ""),
  };
}

function normalizeStructured(value: unknown): StructuredAiResponse | null {
  const source = normalizeObject(value);
  if (Object.keys(source).length === 0) return null;
  return {
    assistantMessage: String(source.assistantMessage ?? ""),
    shouldCreateIntent: Boolean(source.shouldCreateIntent),
    intent: source.intent ? normalizeStructuredIntent(source.intent) : null,
    confidence: safeNumber(source.confidence),
  };
}

function normalizeProviderStatus(value: unknown): AiProviderStatus {
  const source = normalizeObject(value);
  return {
    provider: String(source.provider ?? "mock"),
    model: String(source.model ?? "mock-deterministic"),
    keyConfigured: Boolean(source.keyConfigured),
    baseUrlConfigured: Boolean(source.baseUrlConfigured),
    timeoutMs: safeNumber(source.timeoutMs),
    maxContextEvents: safeNumber(source.maxContextEvents),
    maxContextIncidents: safeNumber(source.maxContextIncidents),
    executionAllowed: Boolean(source.executionAllowed),
    lastError: typeof source.lastError === "string" ? source.lastError : null,
  };
}

export async function sendAiMessage(sessionId: string | null | undefined, message: string) {
  const payload = await requestJson<unknown>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ ...(sessionId ? { sessionId } : {}), message }),
  });
  const source = normalizeObject(payload);
  return {
    sessionId: String(source.sessionId ?? sessionId ?? ""),
    message: source.message ? normalizeAiMessage(source.message) : null,
    assistantMessage: source.assistantMessage ? normalizeAiMessage(source.assistantMessage) : null,
    actionIntent: source.actionIntent ? normalizeAiIntent(source.actionIntent) : null,
    providerStatus: source.providerStatus ? normalizeProviderStatus(source.providerStatus) : null,
    structured: source.structured ? normalizeStructured(source.structured) : null,
  } satisfies AiChatResponse;
}

export async function getAiSessions() {
  const payload = await requestJson<unknown>("/ai/chat/sessions");
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.sessions).map(normalizeSession);
}

export async function getAiSession(id: string) {
  return requestJson<unknown>(`/ai/chat/sessions/${id}`).then(normalizeSession);
}

export async function getSecuritySummary() {
  return requestJson<unknown>("/ai/context/security-summary").then(normalizeSummary);
}

export async function getAiProviderStatus() {
  return requestJson<unknown>("/ai/provider/status").then(normalizeProviderStatus);
}

export async function getAiIntents() {
  const payload = await requestJson<unknown>("/ai/intents");
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.intents).map(normalizeAiIntent);
}

export async function getAiIntent(id: string) {
  return requestJson<unknown>(`/ai/intents/${id}`).then(normalizeAiIntent);
}

export async function updateAiIntent(id: string, patch: Partial<AiActionIntent>) {
  return requestJson<unknown>(`/ai/intents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then(normalizeAiIntent);
}
