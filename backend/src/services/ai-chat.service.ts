import { AiChatRole, AiIntentType, AiRiskLevel, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { buildSecurityOrchestratorContext } from "../ai/context/security-orchestrator-context.js";
import { createAiActionIntent, parseAiIntent, type ParsedIntent } from "./ai-intent.service.js";
import { getAiProviderStatus, runAiProvider, type StructuredAiIntent } from "./ai-provider.service.js";
import { proposeActionPlan } from "./action-plan.service.js";
import { normalizeIntentType, normalizeVendor } from "./ai-normalization.js";
import { routeCatalogIntent } from "../actions/intent-router.js";
import { VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { getActionCatalogEntry } from "../actions/action-catalog.js";
import { missingFieldsMessageFa, resolveAiTemplate } from "../ai/ai-template-resolver.js";

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
  const vendor = normalizeVendor(intent.targetDeviceHint) ?? normalizeVendor(intent.parameters.vendor) ?? normalizeVendor(intent.parameters.targetDeviceHint);
  const intentType = normalizeIntentType(intent.intentType, vendor);
  if (!intentType || intentType === AiIntentType.explain_security_status || intentType === AiIntentType.unknown) return null;
  const riskLevel = intent.riskLevel in AiRiskLevel ? intent.riskLevel as AiRiskLevel : AiRiskLevel.medium;
  return {
    intentType,
    riskLevel,
    parameters: {
      ...intent.parameters,
      ...(vendor ? { vendor } : {}),
      ...(intent.targetDeviceHint && intent.targetDeviceHint.length >= 2 ? { targetDeviceHint: vendor ?? intent.targetDeviceHint } : {}),
      ...(intent.missingFields.length > 0 ? { missingFields: intent.missingFields } : {}),
      ...(intent.clarificationQuestions.length > 0 ? { clarificationQuestions: intent.clarificationQuestions } : {})
      ,executionSupport: intent.executionSupport,
      destructive: intent.destructive,
      requiresExplicitReview: intent.requiresExplicitReview,
      expectedImpact: intent.expectedImpact,
      suggestedPrechecks: intent.suggestedPrechecks,
      suggestedVerification: intent.suggestedVerification,
      suggestedRollback: intent.suggestedRollback
    },
    explanation: intent.explanation
  };
}

function structuredFromParsed(parsed: ParsedIntent): StructuredAiIntent {
  const missingFields = Array.isArray(parsed.parameters.missingFields) ? parsed.parameters.missingFields.map(String) : [];
  const clarificationQuestions = Array.isArray(parsed.parameters.clarificationQuestions) ? parsed.parameters.clarificationQuestions.map(String) : [];
  const vendor = normalizeVendor(parsed.parameters.vendor) ?? normalizeVendor(parsed.parameters.targetDeviceHint) ?? (parsed.intentType.startsWith("mikrotik_") ? "mikrotik" : null);
  return {
    intentType: parsed.intentType,
    vendor: (vendor ?? "unknown") as StructuredAiIntent["vendor"],
    riskLevel: parsed.riskLevel,
    targetDeviceHint: vendor ?? (typeof parsed.parameters.targetDeviceHint === "string" && parsed.parameters.targetDeviceHint.length >= 2 ? parsed.parameters.targetDeviceHint : null),
    parameters: parsed.parameters,
    missingFields,
    clarificationQuestions,
    executionSupport: String(parsed.parameters.executionSupport ?? (isControlledCatalogAction(parsed.intentType) ? "catalog_executable" : "manual_or_not_implemented")) as StructuredAiIntent["executionSupport"],
    destructive: Boolean(parsed.parameters.destructive),
    requiresExplicitReview: Boolean(parsed.parameters.requiresExplicitReview),
    expectedImpact: String(parsed.parameters.expectedImpact ?? ""),
    suggestedPrechecks: Array.isArray(parsed.parameters.suggestedPrechecks) ? parsed.parameters.suggestedPrechecks.map(String) : [],
    suggestedVerification: Array.isArray(parsed.parameters.suggestedVerification) ? parsed.parameters.suggestedVerification.map(String) : [],
    suggestedRollback: Array.isArray(parsed.parameters.suggestedRollback) ? parsed.parameters.suggestedRollback.map(String) : [],
    explanation: parsed.explanation
  };
}

function shouldPreferDeterministic(providerIntent: StructuredAiIntent | null, deterministic: ParsedIntent | null) {
  if (!deterministic || deterministic.intentType === "explain_security_status") return false;
  if (!providerIntent) return true;
  if (providerIntent.intentType !== deterministic.intentType) return true;
  const providerMissing = new Set(providerIntent.missingFields);
  const deterministicMissing = Array.isArray(deterministic.parameters.missingFields)
    ? deterministic.parameters.missingFields.map(String)
    : [];
  if (providerMissing.size > deterministicMissing.length) return true;
  const deterministicKeys = Object.keys(deterministic.parameters).filter((key) => !["missingFields", "clarificationQuestions"].includes(key));
  const providerKeys = Object.keys(providerIntent.parameters);
  const deterministicDuration = deterministic.parameters.timeout ?? deterministic.parameters.durationMinutes;
  const providerDuration = providerIntent.parameters.timeout ?? providerIntent.parameters.durationMinutes;
  if (deterministicDuration !== undefined && providerDuration !== undefined && String(deterministicDuration) !== String(providerDuration)) return true;
  const deterministicIp = deterministic.parameters.address ?? deterministic.parameters.srcIp ?? deterministic.parameters.srcIP ?? deterministic.parameters.sourceIp ?? deterministic.parameters.ip;
  const providerIp = providerIntent.parameters.address ?? providerIntent.parameters.srcIp ?? providerIntent.parameters.srcIP ?? providerIntent.parameters.sourceIp ?? providerIntent.parameters.ip;
  if (deterministicIp !== undefined && providerIp !== undefined && String(deterministicIp) !== String(providerIp)) return true;
  return deterministicKeys.length > providerKeys.length;
}

function isControlledCatalogAction(actionType: string) {
  return Boolean(getActionCatalogEntry(actionType)) || VENDOR_COMMAND_CATALOG.some((entry) => entry.supported && entry.actionType === actionType);
}

function isCustomProposal(actionType: string) {
  return actionType === AiIntentType.custom_vendor_action || actionType === AiIntentType.generic_security_action;
}

function intentDebug(input: {
  intent: Awaited<ReturnType<typeof createAiActionIntent>> | undefined;
  structuredIntent: StructuredAiIntent | null;
}) {
  const parameters = input.intent?.parametersJson && typeof input.intent.parametersJson === "object" && !Array.isArray(input.intent.parametersJson)
    ? input.intent.parametersJson as Record<string, unknown>
    : {};
  const missingFields = Array.from(new Set([
    ...(
      Array.isArray(parameters.missingFields)
        ? parameters.missingFields.map(String)
        : []
    ),
    ...(
      input.structuredIntent?.missingFields.map(String) ?? []
    ),
    ...(!input.intent?.deviceId && input.intent && input.intent.intentType !== "unknown" && !isCustomProposal(input.intent.intentType) ? ["deviceId"] : [])
  ]));

  if (!input.intent) {
    return {
      intentType: input.structuredIntent?.intentType ?? "none",
      vendor: normalizeVendor(input.structuredIntent?.targetDeviceHint),
      deviceId: null,
      missingFields,
      canCreateActionPlan: false,
      reason: input.structuredIntent?.intentType === "unknown" ? "not_supported_yet" : "no_actionable_intent",
      blockedReason: input.structuredIntent?.intentType === "unknown" ? "not_supported_yet" : "no_actionable_intent"
    };
  }

  const canCreateActionPlan = input.intent.status === "proposed" && input.intent.intentType !== "unknown" && missingFields.length === 0;
  const vendor = normalizeVendor(parameters.vendor) ?? normalizeVendor(parameters.targetDeviceHint) ?? (input.intent.intentType.startsWith("mikrotik_") ? "mikrotik" : null);
  return {
    intentType: input.intent.intentType,
    vendor: vendor ?? normalizeVendor(input.structuredIntent?.targetDeviceHint),
    deviceId: input.intent.deviceId,
    missingFields,
    canCreateActionPlan,
    reason: canCreateActionPlan
      ? null
      : input.intent.status !== "proposed" || input.intent.intentType === "unknown"
        ? "not_supported_yet"
        : missingFields.length > 0
          ? "missing_fields"
          : "blocked",
    blockedReason: canCreateActionPlan
      ? null
      : input.intent.status !== "proposed" || input.intent.intentType === "unknown"
        ? "not_supported_yet"
        : missingFields.length > 0
          ? "missing_fields"
          : "blocked"
  };
}

export async function chatWithAssistant(input: { sessionId?: string; message: string; deviceId?: string }) {
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

  const context = await buildSecurityOrchestratorContext();
  const catalogMatch = routeCatalogIntent(message);
  const providerCandidate = catalogMatch.aiRequired
    ? await runAiProvider({ message, context })
    : {
        assistantMessage: catalogMatch.status === "matched" && catalogMatch.catalogEntry
          ? `${catalogMatch.catalogEntry.title} is ready as a controlled catalog action. Review it in Action Center and select Execute.`
          : catalogMatch.message ?? "This action is not in the controlled catalog yet.",
        shouldCreateIntent: catalogMatch.status === "matched" || catalogMatch.status === "unsupported",
        intent: catalogMatch.parsedIntent ? structuredFromParsed(catalogMatch.parsedIntent) : structuredFromParsed(parseAiIntent(message)!),
        confidence: catalogMatch.confidence,
        provider: "mock" as const,
        model: "command-catalog",
        keyConfigured: false,
        fallbackUsed: false
      };
  const providerResponse = providerCandidate;
  const parsedCandidate = catalogMatch.parsedIntent ?? parseAiIntent(message);
  const deterministicParsed = parsedCandidate;
  const deterministicWins = shouldPreferDeterministic(providerResponse.intent, deterministicParsed);
  const effectiveStructuredIntent = deterministicWins && deterministicParsed
    ? structuredFromParsed(deterministicParsed)
    : providerResponse.intent;

  const assistantMessage = await prisma.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: AiChatRole.assistant,
      content: providerResponse.assistantMessage,
      structuredJson: toJson({
        schema: "ai_security_assistant_v1",
        assistantMessage: providerResponse.assistantMessage,
        shouldCreateIntent: providerResponse.shouldCreateIntent,
        intent: effectiveStructuredIntent,
        providerIntent: providerResponse.intent,
        deterministicParserUsed: deterministicWins,
        catalogMatched: catalogMatch.status === "matched",
        catalogActionId: catalogMatch.catalogEntry?.id ?? null,
        aiProviderCalled: catalogMatch.aiRequired,
        confidence: providerResponse.confidence,
        provider: providerResponse.provider,
        model: providerResponse.model,
        keyConfigured: providerResponse.keyConfigured,
        fallbackUsed: providerResponse.fallbackUsed,
        error: providerResponse.error,
        executionAllowed: false,
        contextWindow: {
          generatedAt: context.generatedAt,
          recentWindowMinutes: context.recentWindowMinutes,
          evidence: context.evidencePack.metadata
        }
      })
    }
  });

  const parsedIntent = deterministicWins && deterministicParsed
    ? deterministicParsed
    : providerResponse.shouldCreateIntent
      ? parsedIntentFromStructured(providerResponse.intent)
      : null;
  const actionIntent = parsedIntent
    ? await createAiActionIntent({
        sessionId: session.id,
        messageId: assistantMessage.id,
        parsedIntent
      })
    : undefined;
  const debug = intentDebug({ intent: actionIntent, structuredIntent: effectiveStructuredIntent });
  const selectedDeviceId = input.deviceId ?? actionIntent?.deviceId;
  const selectedDevice = selectedDeviceId ? await prisma.device.findUnique({ where: { id: selectedDeviceId } }) : null;
  const resolution = resolveAiTemplate({ userText: message, selectedDevice, aiIntent: effectiveStructuredIntent ? { intentType: effectiveStructuredIntent.intentType, parameters: effectiveStructuredIntent.parameters } : null });
  const resolutionMissing = Array.from(new Set([...resolution.missingFields, ...(!selectedDevice && resolution.implementationState === "implemented" ? ["deviceId"] : [])]));
  const actionPlan = resolution.implementationState === "implemented" && resolutionMissing.length === 0 && selectedDevice && resolution.catalogItem
    ? await proposeActionPlan({ source: "ai", deviceId: selectedDevice.id, vendor: resolution.canonicalVendor, actionType: resolution.canonicalActionType, riskLevel: resolution.catalogItem.riskLevel, parametersJson: { ...resolution.normalizedParams, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: true, metadata: { source: "ai_mapped_template", catalogCommandId: resolution.catalogCommandId, executionTemplateRef: resolution.executionTemplateRef, connectorType: resolution.connectorType, implementationState: "implemented", executionSupport: "connector", normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } })
    : debug.canCreateActionPlan && actionIntent && resolution.implementationState !== "implemented"
      ? await proposeActionPlan({ aiIntentId: actionIntent.id })
      : null;
  const executionSupport = resolution.executionSupport;
  const implementationState = resolution.implementationState;
  const nextStepFa = actionPlan
    ? executionSupport === "connector" ? "برای بازبینی و تأیید به مرکز عملیات بروید." : "پیشنهاد را در مرکز عملیات به‌صورت دستی بررسی کنید."
    : resolutionMissing.length ? missingFieldsMessageFa(resolutionMissing) : resolution.reasonFa;
  const assistantText = actionPlan && executionSupport === "connector"
    ? "برنامه اجرای قابل تأیید ساخته شد. پس از بازبینی می‌توانید آن را در مرکز عملیات تأیید کنید."
    : resolutionMissing.length ? nextStepFa : providerResponse.assistantMessage;

  return {
    sessionId: session.id,
    message: userMessage,
    assistantMessage: assistantText,
    assistantMessageRecord: assistantMessage,
    shouldCreateActionPlan: Boolean(actionPlan),
    actionIntent,
    actionPlan,
    executionSupport,
    implementationState,
    mappedTemplate: resolution.executionTemplateRef,
    missingFields: resolutionMissing,
    nextStepFa,
    warnings: executionSupport === "connector" ? [] : [resolution.reasonFa],
    resolution,
    actionDebug: debug,
    providerStatus: getAiProviderStatus(providerResponse.error),
    evidenceMetadata: context.evidencePack.metadata,
    structured: {
      assistantMessage: providerResponse.assistantMessage,
      shouldCreateIntent: providerResponse.shouldCreateIntent,
      intent: effectiveStructuredIntent,
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

export async function clearAiChatSessionMessages(id: string) {
  const session = await prisma.aiChatSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) return null;
  const result = await prisma.aiChatMessage.deleteMany({ where: { sessionId: id } });
  await prisma.aiChatSession.update({ where: { id }, data: { updatedAt: new Date() } });
  return { ok: true, sessionId: id, deletedMessages: result.count };
}
