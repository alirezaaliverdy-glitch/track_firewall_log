import { AiIntentType, AiRiskLevel } from "@prisma/client";
import { env } from "../config/env.js";
import type { buildSecurityOrchestratorContext } from "../ai/context/security-orchestrator-context.js";
import { VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { runMockAiProvider } from "./providers/mock-ai.provider.js";
import { AiProviderRequestError, runOpenAiCompatibleProvider } from "./providers/openai-compatible.provider.js";
import { runOpenAiProvider } from "./providers/openai.provider.js";
import { normalizeIntentType, normalizeVendor } from "./ai-normalization.js";

export type AiProviderName = "mock" | "openai" | "openai_compatible";

export type StructuredAiIntent = {
  intentType: string;
  vendor: "mikrotik" | "fortigate" | "linux" | "pfsense" | "cisco" | "generic" | "unknown";
  riskLevel: "low" | "medium" | "high" | "critical";
  targetDeviceHint: string | null;
  parameters: Record<string, unknown>;
  missingFields: string[];
  clarificationQuestions: string[];
  executionSupport: "catalog_executable" | "connector_supported" | "manual_or_not_implemented" | "unsupported_vendor" | "needs_parameters";
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

export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiProviderInput = {
  message: string;
  context: Awaited<ReturnType<typeof buildSecurityOrchestratorContext>>;
  mode?: "chat" | "action";
  requireLiveResponse?: boolean;
  conversationHistory?: AiConversationMessage[];
  selectedVendor?: string | null;
  selectedConnectorType?: string | null;
  selectedDeviceName?: string | null;
};

export type AiProviderResult = StructuredAiResponse & {
  provider: AiProviderName;
  model: string;
  keyConfigured: boolean;
  fallbackUsed: boolean;
  error?: string;
};

export class AiProviderFailedError extends Error {
  statusCode: number;
  provider: AiProviderName;
  attemptedModels: string[];

  constructor(input: { statusCode: number; provider: AiProviderName; attemptedModels: string[]; message: string }) {
    super(input.message);
    this.name = "AiProviderFailedError";
    this.statusCode = input.statusCode;
    this.provider = input.provider;
    this.attemptedModels = input.attemptedModels;
  }
}

const INTENT_TYPES = new Set(Object.values(AiIntentType));
const RISK_LEVELS = new Set(Object.values(AiRiskLevel));

function providerName(): AiProviderName {
  return env.aiProvider === "openai" || env.aiProvider === "openai_compatible" ? env.aiProvider : "mock";
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 1)) : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function normalizeResponse(value: unknown): StructuredAiResponse {
  const source = objectValue(value);
  const intentSource = source.intent === null ? null : objectValue(source.intent);
  const intentParameters = intentSource ? objectValue(intentSource.parameters) : {};
  const vendor = normalizeVendor(intentSource?.vendor) ?? normalizeVendor(intentSource?.targetDeviceHint) ?? normalizeVendor(intentParameters.vendor) ?? normalizeVendor(intentParameters.targetDeviceHint);
  const intentType = normalizeIntentType(intentSource?.intentType, vendor);
  const rawDeviceHint = typeof intentSource?.targetDeviceHint === "string" ? intentSource.targetDeviceHint.trim() : "";
  const normalizedIntent = intentSource && Object.keys(intentSource).length > 0
    ? {
        intentType: intentType && INTENT_TYPES.has(intentType) ? intentType : "unknown",
        vendor: (vendor ?? "unknown") as StructuredAiIntent["vendor"],
        riskLevel: RISK_LEVELS.has(String(intentSource.riskLevel) as AiRiskLevel) ? String(intentSource.riskLevel) as StructuredAiIntent["riskLevel"] : "medium",
        targetDeviceHint: vendor ?? (rawDeviceHint.length >= 2 ? rawDeviceHint : null),
        parameters: intentParameters,
        missingFields: stringArray(intentSource.missingFields),
        clarificationQuestions: stringArray(intentSource.clarificationQuestions),
        executionSupport: ["catalog_executable", "connector_supported", "manual_or_not_implemented", "unsupported_vendor", "needs_parameters"].includes(String(intentSource.executionSupport))
          ? String(intentSource.executionSupport) as StructuredAiIntent["executionSupport"]
          : "manual_or_not_implemented",
        destructive: Boolean(intentSource.destructive),
        requiresExplicitReview: Boolean(intentSource.requiresExplicitReview),
        expectedImpact: String(intentSource.expectedImpact ?? ""),
        suggestedPrechecks: stringArray(intentSource.suggestedPrechecks),
        suggestedVerification: stringArray(intentSource.suggestedVerification),
        suggestedRollback: stringArray(intentSource.suggestedRollback),
        explanation: String(intentSource.explanation ?? "")
      }
    : null;

  return {
    assistantMessage: String(source.assistantMessage ?? "I could not produce a complete answer."),
    shouldCreateIntent: Boolean(source.shouldCreateIntent && normalizedIntent && normalizedIntent.intentType !== "explain_security_status"),
    intent: normalizedIntent,
    confidence: safeNumber(source.confidence, 0.5)
  };
}

function errorStatusCode(error: unknown) {
  if (error instanceof AiProviderRequestError) return error.statusCode;
  if (error instanceof Error && error.name === "AbortError") return 504;
  return 502;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "AI provider failed";
}

async function deterministicProviderFallback(input: AiProviderInput, keyConfigured: boolean, error: string): Promise<AiProviderResult> {
  const response = normalizeResponse(await runMockAiProvider(input));
  return {
    ...response,
    provider: "mock",
    model: "deterministic-offline-fallback",
    keyConfigured,
    fallbackUsed: true,
    error
  };
}

export function getAiProviderStatus(lastError?: string, liveVerified = false) {
  const provider = providerName();
  return {
    provider,
    model: provider === "mock" ? "mock-deterministic" : env.openaiModel,
    fallbackModels: provider === "mock" ? [] : env.openaiFallbackModels,
    keyConfigured: Boolean(env.openaiApiKey),
    liveVerified,
    baseUrlConfigured: Boolean(env.openaiBaseUrl),
    timeoutMs: env.aiTimeoutMs,
    appProfile: env.appProfile,
    actionExecutionMode: env.actionExecutionMode,
    actionCreationPolicy: "permissive",
    executionPolicy: "controlled",
    catalogActionCount: VENDOR_COMMAND_CATALOG.length,
    customActionFallbackSupported: true,
    maxContextEvents: env.aiMaxContextEvents,
    maxContextIncidents: env.aiMaxContextIncidents,
    maxContextFindings: env.aiMaxContextFindings,
    maxActionPlans: env.aiMaxActionPlans,
    maxEvidenceLines: env.aiMaxEvidenceLines,
    includeRawLogs: env.aiIncludeRawLogs,
    executionAllowed: false,
    lastError: lastError ?? null
  };
}

export async function runAiProvider(input: AiProviderInput): Promise<AiProviderResult> {
  const provider = providerName();
  const keyConfigured = Boolean(env.openaiApiKey);
  const requireLiveResponse = input.requireLiveResponse === true;

  if (provider === "mock") {
    if (requireLiveResponse) {
      throw new AiProviderFailedError({
        statusCode: 503,
        provider,
        attemptedModels: [],
        message: "Live AI chat requires a configured OpenAI-compatible provider."
      });
    }
    const response = normalizeResponse(await runMockAiProvider(input));
    return {
      ...response,
      provider: "mock",
      model: "mock-deterministic",
      keyConfigured,
      fallbackUsed: false
    };
  }

  if (!keyConfigured) {
    if (requireLiveResponse) {
      throw new AiProviderFailedError({
        statusCode: 503,
        provider,
        attemptedModels: [],
        message: "OPENAI_API_KEY is not configured."
      });
    }
    return deterministicProviderFallback(input, false, "OPENAI_API_KEY is not configured; deterministic fallback is active.");
  }

  const models = uniqueModels([env.openaiModel, ...env.openaiFallbackModels]);
  const errors: string[] = [];
  let lastStatusCode = 502;

  for (const model of models) {
    try {
      const raw = provider === "openai"
        ? await runOpenAiProvider(input, model)
        : await runOpenAiCompatibleProvider(input, model);
      const response = normalizeResponse(raw);
      return {
        ...response,
        provider,
        model,
        keyConfigured,
        fallbackUsed: model !== env.openaiModel
      };
    } catch (error) {
      lastStatusCode = errorStatusCode(error);
      errors.push(errorMessage(error));
      if (lastStatusCode === 401) break;
    }
  }

  const lastError = lastStatusCode === 429
    ? requireLiveResponse
      ? "سرویس هوش مصنوعی به محدودیت تعداد درخواست خورده است؛ کمی بعد دوباره تلاش کنید."
      : "سرویس هوش مصنوعی به محدودیت تعداد درخواست خورده است؛ پاسخ جایگزین داخلی فعال شد."
    : errors.at(-1) ?? (requireLiveResponse
      ? "ارتباط زنده با سرویس هوش مصنوعی ناموفق بود."
      : "ارتباط با سرویس هوش مصنوعی ناموفق بود؛ پاسخ جایگزین داخلی فعال شد.");
  if (requireLiveResponse) {
    throw new AiProviderFailedError({
      statusCode: lastStatusCode,
      provider,
      attemptedModels: models,
      message: lastError
    });
  }
  return deterministicProviderFallback(input, keyConfigured, lastError);
}
