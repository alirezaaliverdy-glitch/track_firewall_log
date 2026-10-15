import type { FastifyPluginAsync } from "fastify";
import { buildSecurityOrchestratorContext } from "../ai/context/security-orchestrator-context.js";
import { chatWithAssistant, clearAiChatSessionMessages, getAiChatSession, listAiChatSessions } from "../services/ai-chat.service.js";
import { completeAiActionRequest, getAiActionIntent, listAiActionIntents, updateAiActionIntent } from "../services/ai-intent.service.js";
import { AiProviderFailedError, getAiProviderStatus } from "../services/ai-provider.service.js";
import { runAiProvider, type AiProviderInput } from "../services/ai-provider.service.js";
import { publicAiRuntimeSettings, saveAiRuntimeSettings } from "../services/ai-runtime-settings.service.js";
import { prisma } from "../db/prisma.js";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/ai/provider/config", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try { return publicAiRuntimeSettings(); } catch { return reply.code(503).send({ error: "AI_SETTINGS_UNAVAILABLE" }); }
  });
  app.put<{ Body: Record<string, unknown> }>("/api/ai/provider/config", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try {
      const result = await saveAiRuntimeSettings(request.body ?? {});
      await prisma.auditLog.create({ data: { actor: request.authUser.username, action: "ai.provider.configuration_updated", targetType: "ai_provider", targetId: "openrouter", dryRun: false, approvalStatus: "not_required", metadata: { enabled: result.enabled, model: result.model, keyConfigured: result.keyConfigured, externalDataConsent: request.body.externalDataConsent === true } } });
      return result;
    } catch { return reply.code(400).send({ error: "AI_SETTINGS_INVALID", message: "تنظیمات یا کلید معتبر نیست؛ مجوز ارسال داده را هم بررسی کنید." }); }
  });
  app.post("/api/ai/provider/test", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    try {
      const result = await runAiProvider({ message: "This is a synthetic connectivity test. Reply briefly with OK. Do not propose an action.", mode: "chat", requireLiveResponse: true,
        context: { events: { recentCount: 0 }, evidencePack: { availableActionHints: [], recentHighCriticalEvents: [] }, availableCatalogActions: [], targetScopedCatalogActions: [], targetDeviceContext: null } as unknown as AiProviderInput["context"] });
      return { ok: result.provider !== "mock" && Boolean(result.assistantMessage.trim()), liveVerified: result.provider !== "mock", model: result.model };
    } catch (error) { return reply.code(error instanceof AiProviderFailedError ? error.statusCode : 502).send({ ok: false, liveVerified: false, error: "AI_CONNECTION_FAILED", upstreamStatus: error instanceof AiProviderFailedError ? error.statusCode : 0 }); }
  });
  app.post<{ Body: { sessionId?: string; message?: string; deviceId?: string; selectedDeviceId?: string; selectedVendor?: string; selectedConnectorType?: string; selectedDeviceName?: string; intentModeOverride?: "Chat" | "Action" | string } }>("/api/ai/chat", async (request, reply) => {
    try {
      return await chatWithAssistant({
        userId: request.authUser?.id ?? null,
        ownerId: request.authUser?.scopeOwnerId,
        sessionId: request.body?.sessionId,
        message: request.body?.message ?? "",
        deviceId: request.body?.selectedDeviceId ?? request.body?.deviceId,
        selectedVendor: request.body?.selectedVendor,
        selectedConnectorType: request.body?.selectedConnectorType,
        selectedDeviceName: request.body?.selectedDeviceName,
        intentModeOverride: request.body?.intentModeOverride
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI chat failed";
      if (error instanceof AiProviderFailedError) {
        return reply.code(error.statusCode).send({
          error: "AI_PROVIDER_FAILED",
          statusCode: error.statusCode,
          provider: error.provider,
          attemptedModels: error.attemptedModels,
          message: "اتصال هوش مصنوعی آماده نیست. تنظیمات provider را بررسی کنید.",
          detail: message
        });
      }
      return reply.code(400).send({
        error: "AI chat failed",
        detail: message
      });
    }
  });

  app.get("/api/ai/chat/sessions", async (request) => ({
    sessions: await listAiChatSessions(request.authUser?.id ?? null)
  }));

  app.get<{ Params: { id: string } }>("/api/ai/chat/sessions/:id", async (request, reply) => {
    const session = await getAiChatSession(request.params.id, request.authUser?.id ?? null);
    if (!session) return reply.code(404).send({ error: "AI chat session not found" });
    return session;
  });

  app.delete<{ Params: { id: string } }>("/api/ai/chat/sessions/:id/messages", async (request, reply) => {
    try {
      const result = await clearAiChatSessionMessages(request.params.id, request.authUser?.id ?? null);
      return result ?? reply.code(404).send({ ok: false, message: "گفت‌وگو پیدا نشد." });
    } catch (error) {
      request.log.error({ err: error }, "Failed to clear AI chat messages");
      return reply.code(200).send({ ok: false, message: "پاک‌کردن سابقه سمت سرور انجام نشد؛ نمایش محلی پاک شده است." });
    }
  });

  app.get("/api/ai/context/security-summary", async request => buildSecurityOrchestratorContext({ ownerId: request.authUser?.scopeOwnerId }));

  app.get("/api/ai/provider/status", async () => getAiProviderStatus());

  app.get("/api/ai/intents", async (request) => ({
    intents: await listAiActionIntents(request.authUser?.id ?? null)
  }));

  app.get<{ Params: { id: string } }>("/api/ai/intents/:id", async (request, reply) => {
    const intent = await getAiActionIntent(request.params.id, request.authUser?.id ?? null);
    if (!intent) return reply.code(404).send({ error: "AI action intent not found" });
    return intent;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/ai/intents/:id", async (request, reply) => {
    try {
      return await updateAiActionIntent(request.params.id, request.body ?? {}, request.authUser?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update AI action intent";
      const statusCode = message.includes("not found") || message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({
        error: statusCode === 404 ? "AI action intent not found" : "Failed to update AI action intent",
        detail: message
      });
    }
  });

  app.post<{ Params: { id: string }; Body: { fields?: Record<string, unknown> } }>("/api/ai/action-requests/:id/complete", async (request, reply) => {
    try {
      return await completeAiActionRequest(request.params.id, request.body ?? {}, request.authUser?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to complete AI action request";
      const statusCode = message.includes("not found") ? 404 : 400;
      return reply.code(statusCode).send({
        error: statusCode === 404 ? "AI action request not found" : "Failed to complete AI action request",
        detail: message
      });
    }
  });
};
