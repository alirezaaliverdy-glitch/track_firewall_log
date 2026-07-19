import { AiChatRole, AiIntentType, AiRiskLevel, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { buildSecurityOrchestratorContext } from "../ai/context/security-orchestrator-context.js";
import { suggestSupportedActionsForAssistantTarget } from "../ai/context/assistant-target-context.js";
import { createAiActionIntent, parseAiIntent, type ParsedIntent } from "./ai-intent.service.js";
import { getAiProviderStatus, runAiProvider, type StructuredAiIntent } from "./ai-provider.service.js";
import { proposeActionPlan } from "./action-plan.service.js";
import { normalizeIntentType, normalizeVendor } from "./ai-normalization.js";
import { routeCatalogIntent } from "../actions/intent-router.js";
import { VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { getActionCatalogEntry } from "../actions/action-catalog.js";
import { COMMAND_CATALOG_VERSION } from "../commands/catalog/index.js";
import { missingFieldsMessageFa, resolveAiTemplate } from "../ai/ai-template-resolver.js";
import { catalogGuidedBlueprintId } from "../guided-actions/catalog-guided-blueprint.js";
import { env } from "../config/env.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function normalizedChatText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasOperationalVerb(message: string) {
  const text = normalizedChatText(message);
  return [
    "configure", "config", "create", "add", "change", "set", "update", "delete", "remove", "enable", "disable",
    "block", "unblock", "allow", "deny", "open", "close", "restart", "reload", "apply", "make", "build",
    "تنظیم", "کانفیگ", "بساز", "ساخت", "ایجاد", "اضافه", "تغییر", "عوض", "حذف", "پاک", "فعال", "غیرفعال",
    "بلاک", "مسدود", "اجازه", "باز", "ببند", "بستن", "ریستارت", "راه اندازی", "راه‌اندازی", "اعمال"
  ].some((term) => text.includes(term));
}

function hasDevicePlanSignal(message: string) {
  const text = normalizedChatText(message);
  return hasOperationalVerb(message) || [
    "device", "router", "switch", "firewall", "server", "host", "vendor", "status", "health", "diagnostic", "overview", "about",
    "دستگاه", "روتر", "سوییچ", "سوئیچ", "فایروال", "سرور", "وندور", "وضعیت", "سلامت", "بررسی", "چک", "تحلیل", "درباره", "چی میدونی", "چه میدونی",
  ].some((term) => text.includes(term));
}

function shouldCreateReviewOnlyActionPlan(input: {
  message: string;
  selectedDevice: { id: string } | null;
  resolution: ReturnType<typeof resolveAiTemplate>;
  supportedActionForPlan: unknown;
  resolutionMissing: string[];
}) {
  return Boolean(
    input.selectedDevice &&
    !input.supportedActionForPlan &&
    input.resolution.mode === "manual_or_not_supported" &&
    input.resolutionMissing.length === 0 &&
    hasDevicePlanSignal(input.message)
  );
}

function selectedDeviceSupportsConnector(device: { protocol?: string | null } | null, connectorType: string | null) {
  if (!device || !connectorType) return false;
  if (connectorType.endsWith("-ssh")) return device.protocol === "ssh";
  return true;
}

function unsupportedForSelectedDeviceMessageFa(input: { deviceName?: string | null; reasonFa: string; selectedDevice: { vendor: string; type: string } | null; }) {
  const suggestions = suggestSupportedActionsForAssistantTarget(input.selectedDevice).slice(0, 5);
  const names = suggestions.map((action) => action.titleFa || action.titleEn || action.id).filter(Boolean);
  const suffix = names.length ? ` \u067e\u06cc\u0634\u0646\u0647\u0627\u062f\u0647\u0627\u06cc \u0645\u0639\u062a\u0628\u0631 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062f\u0633\u062a\u06af\u0627\u0647: ${names.join("\u060c ")}.` : " \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062f\u0633\u062a\u06af\u0627\u0647 \u0641\u0639\u0644\u0627 \u0627\u0642\u062f\u0627\u0645 \u0627\u062c\u0631\u0627\u06cc\u06cc \u0645\u0639\u062a\u0628\u0631\u06cc \u062f\u0631 \u06a9\u0627\u062a\u0627\u0644\u0648\u06af \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.";
  const device = input.deviceName ? `\u062f\u0633\u062a\u06af\u0627\u0647 "${input.deviceName}"` : "\u062f\u0633\u062a\u06af\u0627\u0647 \u0627\u0646\u062a\u062e\u0627\u0628\u200c\u0634\u062f\u0647";
  return `${device} \u062a\u0646\u0647\u0627 \u0645\u0646\u0628\u0639 \u0645\u0639\u062a\u0628\u0631 \u0627\u06cc\u0646 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0627\u0633\u062a. ${input.reasonFa}${suffix}`;
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

  const [earlySelectedDevice, context] = await Promise.all([
    input.deviceId ? prisma.device.findUnique({ where: { id: input.deviceId } }) : Promise.resolve(null),
    buildSecurityOrchestratorContext({ selectedDeviceId: input.deviceId }),
  ]);
  const earlyResolution = resolveAiTemplate({
    userText: message,
    selectedDevice: earlySelectedDevice,
    targetDeviceContext: context.targetDeviceContext,
  });
  const deterministicResolved = earlyResolution.mode === "executable_action_plan" || earlyResolution.mode === "guided_workflow" || Boolean((earlyResolution.catalogItem ?? earlyResolution.targetSupportedAction) && earlyResolution.missingFields.length > 0);
  const catalogMatch = routeCatalogIntent(message);
  const providerCandidate = deterministicResolved
    ? {
        assistantMessage: earlyResolution.mode === "executable_action_plan" ? "درخواست به اکشن کنترل‌شده کاتالوگ نگاشت شد." : earlyResolution.reasonFa || "این درخواست باید در فرم مرحله‌ای تکمیل شود.",
        shouldCreateIntent: true,
        intent: catalogMatch.parsedIntent ? structuredFromParsed(catalogMatch.parsedIntent) : null,
        confidence: 1,
        provider: "mock" as const,
        model: "deterministic-guided-router",
        keyConfigured: false,
        fallbackUsed: false
      }
    : catalogMatch.aiRequired
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
          evidence: context.evidencePack.metadata,
          selectedDeviceId: input.deviceId ?? null,
          targetDeviceContext: context.targetDeviceContext
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
        deviceId: input.deviceId,
        parsedIntent
      })
    : undefined;
  const debug = intentDebug({ intent: actionIntent, structuredIntent: effectiveStructuredIntent });
  const selectedDeviceId = input.deviceId;
  const selectedDevice = earlySelectedDevice ?? (selectedDeviceId ? await prisma.device.findUnique({ where: { id: selectedDeviceId } }) : null);
  const resolution = resolveAiTemplate({
    userText: message,
    selectedDevice,
    targetDeviceContext: context.targetDeviceContext,
    aiIntent: effectiveStructuredIntent ? { intentType: effectiveStructuredIntent.intentType, parameters: effectiveStructuredIntent.parameters } : null,
  });
  const resolutionMissing = Array.from(new Set([...resolution.missingFields, ...(!selectedDevice && resolution.implementationState === "implemented" ? ["deviceId"] : [])]));
  const supportedActionForPlan = resolution.catalogItem ?? resolution.targetSupportedAction ?? null;
  const canCreateSupportedActionPlan = Boolean(
    selectedDevice &&
    supportedActionForPlan &&
    resolution.implementationState === "implemented" &&
    resolution.executionSupport === "connector" &&
    selectedDeviceSupportsConnector(selectedDevice, resolution.connectorType) &&
    (resolution.mode === "executable_action_plan" || resolution.mode === "needs_input"),
  );
  const canCreateReviewOnlyActionPlan = shouldCreateReviewOnlyActionPlan({
    message,
    selectedDevice,
    resolution,
    supportedActionForPlan,
    resolutionMissing
  });
  const actionVendor = resolution.catalogItem?.vendor ?? resolution.canonicalVendor;
  const actionRiskLevel = resolution.catalogItem?.riskLevel ?? resolution.targetSupportedAction?.riskLevel ?? "medium";
  const actionSupportState = resolution.catalogItem?.supportState ?? "verified";
  const actionSupportReasonKey = resolution.catalogItem?.supportReasonKey ?? "support.reason.verified";
  const actionTitleFa = resolution.catalogItem?.titleFa ?? resolution.targetSupportedAction?.titleFa ?? resolution.canonicalActionType;
  const actionPlan = canCreateSupportedActionPlan && selectedDevice && supportedActionForPlan
    ? await proposeActionPlan({ source: "ai", deviceId: selectedDevice.id, vendor: actionVendor, actionType: resolution.canonicalActionType, riskLevel: actionRiskLevel, parametersJson: { ...resolution.normalizedParams, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", supportState: actionSupportState, supportReasonKey: actionSupportReasonKey, executable: true, connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: resolutionMissing.length === 0, missingFields: resolutionMissing, metadata: { source: "ai_mapped_template", catalogCommandId: resolution.catalogCommandId, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: actionTitleFa, vendor: actionVendor, actionType: resolution.canonicalActionType, implementationState: "implemented", executionSupport: "connector", supportState: actionSupportState, supportReasonKey: actionSupportReasonKey, executable: true, connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: resolutionMissing.length === 0, missingFields: resolutionMissing, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } })
    : canCreateReviewOnlyActionPlan && selectedDevice
      ? await proposeActionPlan({ source: "ai", deviceId: selectedDevice.id, vendor: actionVendor, actionType: "custom_vendor_action", riskLevel: actionRiskLevel, parametersJson: { ...resolution.normalizedParams, vendor: actionVendor, userRequest: message, source: "ai_custom_proposal", implementationState: "manualOnly", executionSupport: "manual", supportState: "manual_only", supportReasonKey: "support.reason.manualReview", executable: false, connectorType: null, executionTemplateRef: null, normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: true, missingFields: resolutionMissing, requiresExplicitReview: true, metadata: { source: "ai_custom_proposal", catalogCommandId: null, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: "پیشنهاد سفارشی هوش مصنوعی", vendor: actionVendor, actionType: "custom_vendor_action", requestedActionType: resolution.canonicalActionType, implementationState: "manualOnly", executionSupport: "manual", supportState: "manual_only", supportReasonKey: "support.reason.manualReview", executable: false, connectorType: null, executionTemplateRef: null, normalizedParams: resolution.normalizedParams, requiredParamsSatisfied: true, missingFields: resolutionMissing, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started", reviewOnly: true } } })
    : debug.canCreateActionPlan && actionIntent && resolution.mode === "needs_input"
      ? await proposeActionPlan({ aiIntentId: actionIntent.id })
      : null;
  const executionSupport = resolution.executionSupport;
  const implementationState = resolution.implementationState;
  const canCreateActionPlan = Boolean(actionPlan);
  const manualOnly = implementationState === "manualOnly" || executionSupport !== "connector";
  const executable = canCreateActionPlan && !manualOnly && resolution.mode === "executable_action_plan";
  const actionPlanMetadata = actionPlan ? asObject(asObject(actionPlan.parametersJson).metadata) : {};
  const actionContract = {
    canCreateActionPlan,
    manualOnly,
    executable,
    executionSupport,
    implementationState,
    executionMode: env.actionExecutionMode,
    lifecycle: actionPlan ? {
      actionPlanId: actionPlan.id,
      status: actionPlan.status,
      planRevision: Number(actionPlanMetadata.planRevision ?? 1),
      planState: String(actionPlanMetadata.planState ?? "draft"),
    } : null,
  };
  const resolvedDebug = { ...debug, deviceId: selectedDevice?.id ?? actionPlan?.deviceId ?? debug.deviceId, missingFields: actionPlan ? resolutionMissing : debug.missingFields, canCreateActionPlan, reason: canCreateActionPlan ? null : debug.reason, blockedReason: canCreateActionPlan ? null : debug.blockedReason };
  const canStartParameterizedGuidedAction = Boolean(
    selectedDevice &&
    resolution.catalogItem?.supportState === "verified" &&
    resolution.implementationState === "implemented" &&
    resolution.executionSupport === "connector" &&
    resolution.executionTemplateRef &&
    selectedDeviceSupportsConnector(selectedDevice, resolution.connectorType) &&
    resolutionMissing.length > 0,
  );
  const parameterizedBlueprintId = canStartParameterizedGuidedAction && resolution.catalogItem ? catalogGuidedBlueprintId(resolution.catalogItem.id) : null;
  const guidedBlueprintId = parameterizedBlueprintId;
  const nextStepFa = actionPlan
    ? executionSupport === "connector" ? "برای بازبینی و تأیید به مرکز عملیات بروید." : "پیشنهاد را در مرکز عملیات به‌صورت دستی بررسی کنید."
    : resolutionMissing.length ? missingFieldsMessageFa(resolutionMissing) : resolution.reasonFa;
  const selectedDeviceUnsupportedMessage = selectedDevice && executionSupport !== "connector"
    ? unsupportedForSelectedDeviceMessageFa({ deviceName: selectedDevice.name, reasonFa: resolution.reasonFa, selectedDevice })
    : null;
  const assistantText = actionPlan
    ? executionSupport === "connector"
      ? "برنامه اجرای قابل تأیید ساخته شد. پس از بازبینی می‌توانید آن را در مرکز عملیات تأیید کنید."
      : "پیشنهاد سفارشی قابل بازبینی ساخته شد. این برنامه اجرایی نیست و باید در مرکز عملیات دستی بررسی شود."
    : resolutionMissing.length ? nextStepFa : selectedDeviceUnsupportedMessage ?? providerResponse.assistantMessage;
  const responseMode = guidedBlueprintId ? "guided_workflow" : resolution.mode === "guided_workflow" ? "manual_or_not_supported" : resolution.mode;
  const guidedAssistantText = guidedBlueprintId
    ? "این درخواست چندمرحله‌ای است. برای ادامه باید چند مقدار را وارد کنید."
    : resolution.mode === "clarification" ? nextStepFa : assistantText;

  return {
    sessionId: session.id,
    message: userMessage,
    assistantMessage: guidedAssistantText,
    assistantMessageRecord: assistantMessage,
    shouldCreateActionPlan: actionContract.canCreateActionPlan,
    actionIntent,
    actionPlan,
    actionContract,
    executionSupport,
    implementationState,
    mode: responseMode,
    blueprintId: guidedBlueprintId ?? null,
    initialValues: resolution.initialValues ?? resolution.normalizedParams ?? null,
    actionSessionId: null,
    actionSession: null,
    guidedActionUrl: null,
    vendor: resolution.canonicalVendor,
    connectorType: resolution.connectorType,
    deviceId: selectedDevice?.id ?? null,
    selectedDeviceName: selectedDevice?.name ?? null,
    clarification: resolution.mode === "clarification" ? { questionFa: resolution.questionFa, options: resolution.options ?? [] } : null,
    mappedTemplate: resolution.executionTemplateRef,
    missingFields: resolutionMissing,
    nextStepFa,
    warnings: executionSupport === "connector" ? [] : [resolution.reasonFa],
    resolution,
    actionDebug: resolvedDebug,
    providerStatus: getAiProviderStatus(providerResponse.error),
    evidenceMetadata: context.evidencePack.metadata,
    targetDeviceContext: context.targetDeviceContext,
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
