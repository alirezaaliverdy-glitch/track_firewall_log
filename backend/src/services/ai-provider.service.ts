import { AiIntentType, AiRiskLevel } from "@prisma/client";
import { env } from "../config/env.js";
import type { buildSecurityContext } from "./ai-context.service.js";
import { runMockAiProvider } from "./providers/mock-ai.provider.js";
import { runOpenAiCompatibleProvider } from "./providers/openai-compatible.provider.js";
import { runOpenAiProvider } from "./providers/openai.provider.js";

export type AiProviderName = "mock" | "openai" | "openai_compatible";

export type StructuredAiIntent = {
  intentType: string;
  riskLevel: "low" | "medium" | "high" | "critical";
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

export type AiProviderInput = {
  message: string;
  context: Awaited<ReturnType<typeof buildSecurityContext>>;
};

export type AiProviderResult = StructuredAiResponse & {
  provider: AiProviderName;
  model: string;
  keyConfigured: boolean;
  fallbackUsed: boolean;
  error?: string;
};

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

function normalizeResponse(value: unknown): StructuredAiResponse {
  const source = objectValue(value);
  const intentSource = source.intent === null ? null : objectValue(source.intent);
  const normalizedIntent = intentSource && Object.keys(intentSource).length > 0
    ? {
        intentType: INTENT_TYPES.has(String(intentSource.intentType) as AiIntentType) ? String(intentSource.intentType) : "unknown",
        riskLevel: RISK_LEVELS.has(String(intentSource.riskLevel) as AiRiskLevel) ? String(intentSource.riskLevel) as StructuredAiIntent["riskLevel"] : "medium",
        targetDeviceHint: typeof intentSource.targetDeviceHint === "string" ? intentSource.targetDeviceHint : null,
        parameters: objectValue(intentSource.parameters),
        missingFields: stringArray(intentSource.missingFields),
        clarificationQuestions: stringArray(intentSource.clarificationQuestions),
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

export function getAiProviderStatus(lastError?: string) {
  const provider = providerName();
  return {
    provider,
    model: provider === "mock" ? "mock-deterministic" : env.openaiModel,
    keyConfigured: Boolean(env.openaiApiKey),
    baseUrlConfigured: Boolean(env.openaiBaseUrl),
    timeoutMs: env.aiTimeoutMs,
    maxContextEvents: env.aiMaxContextEvents,
    maxContextIncidents: env.aiMaxContextIncidents,
    executionAllowed: false,
    lastError: lastError ?? null
  };
}

export async function runAiProvider(input: AiProviderInput): Promise<AiProviderResult> {
  const provider = providerName();
  const keyConfigured = Boolean(env.openaiApiKey);

  if (provider === "mock" || !keyConfigured) {
    const response = normalizeResponse(await runMockAiProvider(input));
    return {
      ...response,
      provider: "mock",
      model: "mock-deterministic",
      keyConfigured,
      fallbackUsed: provider !== "mock"
    };
  }

  try {
    const raw = provider === "openai"
      ? await runOpenAiProvider(input)
      : await runOpenAiCompatibleProvider(input);
    const response = normalizeResponse(raw);
    return {
      ...response,
      provider,
      model: env.openaiModel,
      keyConfigured,
      fallbackUsed: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider failed";
    const fallback = normalizeResponse(await runMockAiProvider(input));
    return {
      ...fallback,
      provider: "mock",
      model: "mock-deterministic",
      keyConfigured,
      fallbackUsed: true,
      error: message
    };
  }
}
