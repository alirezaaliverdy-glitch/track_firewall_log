import type { FastifyPluginAsync } from "fastify";
import { buildSecurityOrchestratorContext } from "../ai/context/security-orchestrator-context.js";
import { chatWithAssistant, clearAiChatSessionMessages, getAiChatSession, listAiChatSessions } from "../services/ai-chat.service.js";
import { completeAiActionRequest, getAiActionIntent, listAiActionIntents, updateAiActionIntent } from "../services/ai-intent.service.js";
import { AiProviderFailedError, getAiProviderStatus } from "../services/ai-provider.service.js";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { sessionId?: string; message?: string; deviceId?: string } }>("/api/ai/chat", async (request, reply) => {
    try {
      return await chatWithAssistant({
        sessionId: request.body?.sessionId,
        message: request.body?.message ?? "",
        deviceId: request.body?.deviceId
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

  app.get("/api/ai/chat/sessions", async () => ({
    sessions: await listAiChatSessions()
  }));

  app.get<{ Params: { id: string } }>("/api/ai/chat/sessions/:id", async (request, reply) => {
    const session = await getAiChatSession(request.params.id);
    if (!session) return reply.code(404).send({ error: "AI chat session not found" });
    return session;
  });

  app.delete<{ Params: { id: string } }>("/api/ai/chat/sessions/:id/messages", async (request, reply) => {
    try {
      const result = await clearAiChatSessionMessages(request.params.id);
      return result ?? reply.code(404).send({ ok: false, message: "گفت‌وگو پیدا نشد." });
    } catch (error) {
      request.log.error({ err: error }, "Failed to clear AI chat messages");
      return reply.code(200).send({ ok: false, message: "پاک‌کردن سابقه سمت سرور انجام نشد؛ نمایش محلی پاک شده است." });
    }
  });

  app.get("/api/ai/context/security-summary", async () => buildSecurityOrchestratorContext());

  app.get("/api/ai/provider/status", async () => getAiProviderStatus());

  app.get("/api/ai/intents", async () => ({
    intents: await listAiActionIntents()
  }));

  app.get<{ Params: { id: string } }>("/api/ai/intents/:id", async (request, reply) => {
    const intent = await getAiActionIntent(request.params.id);
    if (!intent) return reply.code(404).send({ error: "AI action intent not found" });
    return intent;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/ai/intents/:id", async (request, reply) => {
    try {
      return await updateAiActionIntent(request.params.id, request.body ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update AI action intent";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({
        error: statusCode === 404 ? "AI action intent not found" : "Failed to update AI action intent",
        detail: message
      });
    }
  });

  app.post<{ Params: { id: string }; Body: { fields?: Record<string, unknown> } }>("/api/ai/action-requests/:id/complete", async (request, reply) => {
    try {
      return await completeAiActionRequest(request.params.id, request.body ?? {});
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
