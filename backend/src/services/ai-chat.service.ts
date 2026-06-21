import { AiChatRole, AiIntentType, AiRiskLevel, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { buildSecurityContext } from "./ai-context.service.js";
import { createAiActionIntent, type ParsedIntent } from "./ai-intent.service.js";
import { getAiProviderStatus, runAiProvider, type StructuredAiIntent } from "./ai-provider.service.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function titleFromMessage(message: string) {
  const cleaned = message.trim().replace(/\s+/g, " ");
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned || "Security chat";
}

async function getOrCreateSession(sessionId: string | undefined, message: string) {
  if (sessionId) {
    const existing = await prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (existing) return existing;
  }

  return prisma.aiChatSession.create({
    data: {
      title: titleFromMessage(message)
    }
  });
}

function parsedIntentFromStructured(intent: StructuredAiIntent | null): ParsedIntent | null {
  if (!intent) return null;
  if (!(intent.intentType in AiIntentType)) return null;
  if (intent.intentType === AiIntentType.explain_security_status || intent.intentType === AiIntentType.unknown) return null;
  const riskLevel = intent.riskLevel in AiRiskLevel ? intent.riskLevel as AiRiskLevel : AiRiskLevel.medium;
  return {
    intentType: intent.intentType as AiIntentType,
    riskLevel,
    parameters: {
      ...intent.parameters,
      ...(intent.targetDeviceHint ? { targetDeviceHint: intent.targetDeviceHint } : {}),
      ...(intent.missingFields.length > 0 ? { missingFields: intent.missingFields } : {}),
      ...(intent.clarificationQuestions.length > 0 ? { clarificationQuestions: intent.clarificationQuestions } : {})
    },
    explanation: intent.explanation
  };
}

export async function chatWithAssistant(input: { sessionId?: string; message: string }) {
  const message = input.message.trim();
  if (!message) throw new Error("message is required");

  const session = await getOrCreateSession(input.sessionId, message);
  const userMessage = await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.user,
      content: message
    }
  });

  const context = await buildSecurityContext();
  const providerResponse = await runAiProvider({ message, context });

  const assistantMessage = await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.assistant,
      content: providerResponse.assistantMessage,
      structuredJson: toJson({
        schema: "ai_security_assistant_v1",
        assistantMessage: providerResponse.assistantMessage,
        shouldCreateIntent: providerResponse.shouldCreateIntent,
        intent: providerResponse.intent,
        confidence: providerResponse.confidence,
        provider: providerResponse.provider,
        model: providerResponse.model,
        keyConfigured: providerResponse.keyConfigured,
        fallbackUsed: providerResponse.fallbackUsed,
        error: providerResponse.error,
        executionAllowed: false,
        contextWindow: {
          generatedAt: context.generatedAt,
          recentWindowMinutes: context.recentWindowMinutes
        }
      })
    }
  });

  const parsedIntent = providerResponse.shouldCreateIntent ? parsedIntentFromStructured(providerResponse.intent) : null;
  const actionIntent = parsedIntent
    ? await createAiActionIntent({
        sessionId: session.id,
        messageId: assistantMessage.id,
        parsedIntent
      })
    : undefined;

  return {
    sessionId: session.id,
    message: userMessage,
    assistantMessage,
    actionIntent,
    providerStatus: getAiProviderStatus(providerResponse.error),
    structured: {
      assistantMessage: providerResponse.assistantMessage,
      shouldCreateIntent: providerResponse.shouldCreateIntent,
      intent: providerResponse.intent,
      confidence: providerResponse.confidence
    }
  };
}

export async function listAiChatSessions() {
  return prisma.aiChatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
}

export async function getAiChatSession(id: string) {
  return prisma.aiChatSession.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      },
      intents: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
}
