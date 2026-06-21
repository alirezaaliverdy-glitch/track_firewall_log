import type { FastifyPluginAsync } from "fastify";
import { buildSecurityContext } from "../services/ai-context.service.js";
import { chatWithAssistant, getAiChatSession, listAiChatSessions } from "../services/ai-chat.service.js";
import { getAiActionIntent, listAiActionIntents, updateAiActionIntent } from "../services/ai-intent.service.js";
import { getAiProviderStatus } from "../services/ai-provider.service.js";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { sessionId?: string; message?: string } }>("/api/ai/chat", async (request, reply) => {
    try {
      return await chatWithAssistant({
        sessionId: request.body?.sessionId,
        message: request.body?.message ?? ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI chat failed";
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

  app.get("/api/ai/context/security-summary", async () => buildSecurityContext());

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
};
