const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type AiRole = "user" | "assistant" | "system" | "tool";
export type AiIntentModeOverride = "Auto" | "Chat" | "Action";

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
  answer?: string;
  confidence?: number;
  requiresClarification?: boolean;
  message: AiMessage | null;
  assistantMessage: AiMessage | null;
  actionIntent: AiActionIntent | null;
  actionPlan: { id: string; status: string; actionType: string } | null;
  actionDebug: AiActionDebug | null;
  providerStatus: AiProviderStatus | null;
  structured: StructuredAiResponse | null;
  evidenceMetadata: EvidencePackMetadata | null;
  shouldCreateActionPlan: boolean;
  executionSupport: string;
  implementationState: string;
  mappedTemplate: string | null;
  missingFields: string[];
  nextStepFa: string;
  warnings: string[];
  mode: "conversation" | "device_question" | "action_request" | string;
  blueprintId: string | null;
  initialValues: Record<string, unknown> | null;
  actionSessionId: string | null;
  actionSession: Record<string, unknown> | null;
  guidedActionUrl: string | null;
  vendor: string | null;
  connectorType: string | null;
  deviceId: string | null;
  selectedDeviceName: string | null;
  actionContract: AiActionContract;
};

export type AiActionContract = {
  canCreateActionPlan: boolean;
  manualOnly: boolean;
  executable: boolean;
  executionSupport: string;
  implementationState: string;
  executionMode: string;
  lifecycle: { actionPlanId: string; status: string; planRevision: number; planState: string } | null;
};

export type EvidencePackMetadata = {
  contextTruncated: boolean;
  rawLogsIncluded: boolean;
  includedEventsCount: number;
  includedFindingsCount: number;
  includedIncidentsCount: number;
  includedActionPlansCount: number;
};

export type AiActionDebug = {
  intentType: string;
  vendor: string | null;
  deviceId: string | null;
  missingFields: string[];
  canCreateActionPlan: boolean;
  reason: string | null;
  blockedReason: string | null;
};

export type CompleteActionRequestResponse = {
  canCreateActionPlan: boolean;
  actionPlanId: string | null;
  status: string;
  missingFields: string[];
  blockedReason: string | null;
  intent: AiActionIntent | null;
  actionPlan: { id: string; status: string; actionType: string } | null;
};

export type StructuredAiIntent = {
  intentType: string;
  vendor: string;
  riskLevel: string;
  targetDeviceHint: string | null;
  parameters: Record<string, unknown>;
  missingFields: string[];
  clarificationQuestions: string[];
  executionSupport: string;
  destructive: boolean;
  requiresExplicitReview: boolean;
  expectedImpact: string;
  suggestedPrechecks: string[];
  suggestedVerification: string[];
  suggestedRollback: string[];
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
  fallbackModels: string[];
  keyConfigured: boolean;
  baseUrlConfigured: boolean;
  timeoutMs: number;
  appProfile: string;
  actionExecutionMode: string;
  actionCreationPolicy: string;
  executionPolicy: string;
  catalogActionCount: number;
  customActionFallbackSupported: boolean;
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

export type HardeningRecommendation = {
  id: string;
  assessmentId: string;
  deviceId: string | null;
  vendor: string;
  title: string;
  severity: string;
  category: string;
  reason: string;
  evidenceJson: Record<string, unknown>;
  recommendation: string;
  catalogActionId: string | null;
  actionType: string | null;
  parametersJson: Record<string, unknown>;
  executable: boolean;
  createActionSupported: boolean;
  actionHint: string | null;
  impact: string;
  recommendedFix: string;
  status: string;
  actionPlanId: string | null;
  device: { id: string; name: string; vendor: string; type: string } | null;
};

export type SecurityAssessment = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  riskScore: number;
  summary: string;
  language: string;
  dataSourcesJson: Record<string, unknown>;
  findingsJson: Record<string, unknown>;
  recommendations: HardeningRecommendation[];
  createdAt: string;
  updatedAt: string;
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
  if (body.error === "AI_PROVIDER_FAILED") {
    const attemptedModels = normalizeArray<unknown>(body.attemptedModels).map(String);
    const provider = typeof body.provider === "string" ? body.provider : "AI provider";
    const message = typeof body.message === "string" ? body.message : "All configured AI models failed.";
    const attempts = attemptedModels.length > 0 ? ` Attempted models: ${attemptedModels.join(", ")}.` : "";
    return `${provider} failed (${status}): ${message}.${attempts} [${url}]`;
  }
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
      credentials: "include",
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

function normalizeHardeningRecommendation(value: unknown): HardeningRecommendation {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    assessmentId: String(source.assessmentId ?? ""),
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    vendor: String(source.vendor ?? "unknown"),
    title: String(source.title ?? "Hardening recommendation"),
    severity: String(source.severity ?? "medium"),
    category: String(source.category ?? "hardening"),
    reason: String(source.reason ?? ""),
    evidenceJson: normalizeObject(source.evidenceJson),
    recommendation: String(source.recommendation ?? ""),
    catalogActionId: typeof source.catalogActionId === "string" ? source.catalogActionId : null,
    actionType: typeof source.actionType === "string" ? source.actionType : null,
    parametersJson: normalizeObject(source.parametersJson),
    executable: Boolean(source.executable),
    createActionSupported: Boolean(source.createActionSupported ?? source.executable),
    actionHint: typeof source.actionHint === "string" ? source.actionHint : (typeof source.catalogActionId === "string" ? source.catalogActionId : null),
    impact: String(source.impact ?? source.reason ?? ""),
    recommendedFix: String(source.recommendedFix ?? source.recommendation ?? ""),
    status: String(source.status ?? "proposed"),
    actionPlanId: typeof source.actionPlanId === "string" ? source.actionPlanId : null,
    device: source.device ? normalizeObject(source.device) as HardeningRecommendation["device"] : null,
  };
}

function normalizeSecurityAssessment(value: unknown): SecurityAssessment {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    scopeType: String(source.scopeType ?? "all"),
    scopeId: typeof source.scopeId === "string" ? source.scopeId : null,
    status: String(source.status ?? "completed"),
    riskScore: safeNumber(source.riskScore),
    summary: String(source.summary ?? ""),
    language: String(source.language ?? "fa"),
    dataSourcesJson: normalizeObject(source.dataSourcesJson),
    findingsJson: normalizeObject(source.findingsJson),
    recommendations: normalizeArray<unknown>(source.recommendations).map(normalizeHardeningRecommendation),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
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
    vendor: String(source.vendor ?? "unknown"),
    riskLevel: String(source.riskLevel ?? "medium"),
    targetDeviceHint: typeof source.targetDeviceHint === "string" ? source.targetDeviceHint : null,
    parameters: normalizeObject(source.parameters),
    missingFields: normalizeArray<unknown>(source.missingFields).map(String),
    clarificationQuestions: normalizeArray<unknown>(source.clarificationQuestions).map(String),
    executionSupport: String(source.executionSupport ?? "manual_or_not_implemented"),
    destructive: Boolean(source.destructive),
    requiresExplicitReview: Boolean(source.requiresExplicitReview),
    expectedImpact: String(source.expectedImpact ?? ""),
    suggestedPrechecks: normalizeArray<unknown>(source.suggestedPrechecks).map(String),
    suggestedVerification: normalizeArray<unknown>(source.suggestedVerification).map(String),
    suggestedRollback: normalizeArray<unknown>(source.suggestedRollback).map(String),
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

function normalizeActionDebug(value: unknown): AiActionDebug | null {
  const source = normalizeObject(value);
  if (Object.keys(source).length === 0) return null;
  return {
    intentType: String(source.intentType ?? "none"),
    vendor: typeof source.vendor === "string" ? source.vendor : null,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    missingFields: normalizeArray<unknown>(source.missingFields).map(String),
    canCreateActionPlan: Boolean(source.canCreateActionPlan),
    reason: typeof source.reason === "string" ? source.reason : null,
    blockedReason: typeof source.blockedReason === "string" ? source.blockedReason : typeof source.reason === "string" ? source.reason : null,
  };
}

function normalizeProviderStatus(value: unknown): AiProviderStatus {
  const source = normalizeObject(value);
  return {
    provider: String(source.provider ?? "mock"),
    model: String(source.model ?? "mock-deterministic"),
    fallbackModels: normalizeArray<unknown>(source.fallbackModels).map(String),
    keyConfigured: Boolean(source.keyConfigured),
    baseUrlConfigured: Boolean(source.baseUrlConfigured),
    timeoutMs: safeNumber(source.timeoutMs),
    appProfile: String(source.appProfile ?? "unknown"),
    actionExecutionMode: String(source.actionExecutionMode ?? "unknown"),
    actionCreationPolicy: String(source.actionCreationPolicy ?? "permissive"),
    executionPolicy: String(source.executionPolicy ?? "controlled"),
    catalogActionCount: safeNumber(source.catalogActionCount),
    customActionFallbackSupported: Boolean(source.customActionFallbackSupported),
    maxContextEvents: safeNumber(source.maxContextEvents),
    maxContextIncidents: safeNumber(source.maxContextIncidents),
    executionAllowed: Boolean(source.executionAllowed),
    lastError: typeof source.lastError === "string" ? source.lastError : null,
  };
}

export async function sendAiMessage(sessionId: string | null | undefined, message: string, deviceId?: string, selectedContext?: { selectedVendor?: string; selectedConnectorType?: string | null; selectedDeviceName?: string; intentModeOverride?: AiIntentModeOverride }) {
  const payload = await requestJson<unknown>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ ...(sessionId ? { sessionId } : {}), ...(deviceId ? { deviceId, selectedDeviceId: deviceId } : {}), ...(selectedContext ?? {}), message }),
  });
  const source = normalizeObject(payload);
  const evidence = normalizeObject(source.evidenceMetadata);
  const contractSource = normalizeObject(source.actionContract);
  const lifecycleSource = normalizeObject(contractSource.lifecycle);
  const actionContract: AiActionContract = {
    canCreateActionPlan: Boolean(contractSource.canCreateActionPlan ?? source.shouldCreateActionPlan),
    manualOnly: Boolean(contractSource.manualOnly ?? String(source.executionSupport ?? "manual") !== "connector"),
    executable: Boolean(contractSource.executable),
    executionSupport: String(contractSource.executionSupport ?? source.executionSupport ?? "manual"),
    implementationState: String(contractSource.implementationState ?? source.implementationState ?? "manualOnly"),
    executionMode: String(contractSource.executionMode ?? "unknown"),
    lifecycle: Object.keys(lifecycleSource).length > 0 ? {
      actionPlanId: String(lifecycleSource.actionPlanId ?? ""),
      status: String(lifecycleSource.status ?? "proposed"),
      planRevision: safeNumber(lifecycleSource.planRevision) || 1,
      planState: String(lifecycleSource.planState ?? "draft"),
    } : null,
  };
  const assistantRecord = source.assistantMessageRecord ?? (typeof source.assistantMessage === "object" ? source.assistantMessage : null);
  const assistantText = typeof source.assistantMessage === "string" ? source.assistantMessage : "";
  const assistantMessage = assistantRecord
    ? normalizeAiMessage({
        ...normalizeObject(assistantRecord),
        content: assistantText || String(normalizeObject(assistantRecord).content ?? ""),
      })
    : assistantText
      ? normalizeAiMessage({ id: `assistant-${Date.now()}`, sessionId: String(source.sessionId ?? sessionId ?? ""), role: "assistant", content: assistantText, structuredJson: {}, createdAt: new Date().toISOString() })
      : null;
  return {
    sessionId: String(source.sessionId ?? sessionId ?? ""),
    answer: typeof source.answer === "string" ? source.answer : undefined,
    confidence: source.confidence === undefined ? undefined : safeNumber(source.confidence),
    requiresClarification: source.requiresClarification === undefined ? undefined : Boolean(source.requiresClarification),
    message: source.message ? normalizeAiMessage(source.message) : null,
    assistantMessage,
    actionIntent: source.actionIntent ? normalizeAiIntent(source.actionIntent) : null,
    actionPlan: source.actionPlan ? normalizeObject(source.actionPlan) as AiChatResponse["actionPlan"] : null,
    actionDebug: source.actionDebug ? normalizeActionDebug(source.actionDebug) : null,
    providerStatus: source.providerStatus ? normalizeProviderStatus(source.providerStatus) : null,
    structured: source.structured ? normalizeStructured(source.structured) : null,
    evidenceMetadata: source.evidenceMetadata ? {
      contextTruncated: Boolean(evidence.contextTruncated),
      rawLogsIncluded: Boolean(evidence.rawLogsIncluded),
      includedEventsCount: safeNumber(evidence.includedEventsCount),
      includedFindingsCount: safeNumber(evidence.includedFindingsCount),
      includedIncidentsCount: safeNumber(evidence.includedIncidentsCount),
      includedActionPlansCount: safeNumber(evidence.includedActionPlansCount),
    } : null,
    shouldCreateActionPlan: actionContract.canCreateActionPlan,
    executionSupport: actionContract.executionSupport,
    implementationState: actionContract.implementationState,
    mappedTemplate: typeof source.mappedTemplate === "string" ? source.mappedTemplate : null,
    missingFields: normalizeArray<unknown>(source.missingFields).map(String),
    nextStepFa: String(source.nextStepFa ?? ""),
    warnings: normalizeArray<unknown>(source.warnings).map(String),
    mode: String(source.mode ?? "manual_or_not_supported"),
    blueprintId: typeof source.blueprintId === "string" ? source.blueprintId : null,
    initialValues: source.initialValues ? normalizeObject(source.initialValues) : null,
    actionSessionId: typeof source.actionSessionId === "string" ? source.actionSessionId : null,
    actionSession: source.actionSession ? normalizeObject(source.actionSession) : null,
    guidedActionUrl: typeof source.guidedActionUrl === "string" ? source.guidedActionUrl : null,
    vendor: typeof source.vendor === "string" ? source.vendor : null,
    connectorType: typeof source.connectorType === "string" ? source.connectorType : null,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    selectedDeviceName: typeof source.selectedDeviceName === "string" ? source.selectedDeviceName : null,
    actionContract,
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

export async function clearAiSessionMessages(id: string) {
  return requestJson<unknown>(`/ai/chat/sessions/${id}/messages`, { method: "DELETE" });
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

export async function completeAiActionRequest(id: string, fields: Record<string, unknown>) {
  const payload = await requestJson<unknown>(`/ai/action-requests/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  const source = normalizeObject(payload);
  return {
    canCreateActionPlan: Boolean(source.canCreateActionPlan),
    actionPlanId: typeof source.actionPlanId === "string" ? source.actionPlanId : null,
    status: String(source.status ?? ""),
    missingFields: normalizeArray<unknown>(source.missingFields).map(String),
    blockedReason: typeof source.blockedReason === "string" ? source.blockedReason : null,
    intent: source.intent ? normalizeAiIntent(source.intent) : null,
    actionPlan: source.actionPlan ? normalizeObject(source.actionPlan) as CompleteActionRequestResponse["actionPlan"] : null,
  } satisfies CompleteActionRequestResponse;
}

export async function runFullSecurityAnalysis() {
  return requestJson<unknown>("/assessments/full-analysis", {
    method: "POST",
    body: JSON.stringify({ scopeType: "all", collectConnectorData: true }),
  }).then((payload) => {
    const source = normalizeObject(payload);
    if (source.ok === false) throw new Error(String(source.message ?? "تحلیل کامل انجام نشد."));
    return normalizeSecurityAssessment(source.assessment ?? payload);
  });
}

export async function getSecurityAssessment(id: string) {
  return requestJson<unknown>(`/assessments/${id}`).then(normalizeSecurityAssessment);
}

export async function generateHardeningSuggestions(_id?: string) {
  return requestJson<unknown>("/assessments/hardening-suggestions", { method: "POST" }).then((payload) => {
    const source = normalizeObject(payload);
    if (source.ok === false) throw new Error(String(source.message ?? "پیشنهادهای ایمن‌سازی تولید نشد."));
    const recommendations = normalizeArray<unknown>(source.recommendations).map((value) => {
      const item = normalizeObject(value);
      return normalizeHardeningRecommendation({
        ...item,
        id: item.id ?? "",
        assessmentId: source.assessmentId ?? "",
        title: item.titleFa,
        reason: item.reasonFa,
        evidenceJson: Object.fromEntries(normalizeArray<Record<string, unknown>>(item.evidence).map((row) => [String(row.name ?? "شاهد"), row.value])),
        recommendation: item.recommendationFa,
        parametersJson: item.suggestedParameters,
        device: item.deviceId ? { id: item.deviceId, name: item.deviceName, vendor: item.vendor, type: item.vendor } : null
      });
    });
    return normalizeSecurityAssessment({
      id: source.assessmentId,
      status: source.ok ? "completed" : "failed",
      summary: source.dataNoticeFa,
      language: "fa",
      findingsJson: { dataNotice: source.dataNoticeFa, sections: {} },
      recommendations,
      createdAt: source.createdAt,
      updatedAt: source.createdAt
    });
  });
}

export async function createRecommendationActionPlan(id: string) {
  const payload = await requestJson<unknown>(`/recommendations/${id}/create-action-plan`, { method: "POST" });
  const source = normalizeObject(payload);
  return { recommendationId: String(source.recommendationId ?? id), actionPlan: normalizeObject(source.actionPlan) as { id: string; status: string; actionType: string } };
}
