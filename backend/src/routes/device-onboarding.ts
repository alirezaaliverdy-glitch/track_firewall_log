import type { FastifyPluginAsync } from "fastify";
import {
  answerOnboardingSession,
  commitOnboardingSession,
  createOnboardingSession,
  detectOnboardingPlatform,
  discoverOnboardingInventory,
  getOnboardingSession,
  testOnboardingConnection
} from "../services/device-onboarding.service.js";

function statusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "Onboarding failed.";
  return /not found|expired/i.test(message) ? 404 : /timeout/i.test(message) ? 504 : /connect|authentication/i.test(message) ? 502 : 400;
}

export const deviceOnboardingRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: Record<string, unknown> }>("/api/device-onboarding/sessions", async (request, reply) => {
    try { return reply.code(201).send(await createOnboardingSession(request.body ?? {})); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_SESSION_INVALID", message: error instanceof Error ? error.message : "Cannot start onboarding." } }); }
  });
  app.get<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId", async (request, reply) => {
    try { return getOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_SESSION_NOT_FOUND", message: error instanceof Error ? error.message : "Session not found." } }); }
  });
  app.post<{ Params: { sessionId: string }; Body: Record<string, unknown> }>("/api/device-onboarding/sessions/:sessionId/answers", async (request, reply) => {
    try { return answerOnboardingSession(request.params.sessionId, request.body ?? {}); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_ANSWERS_INVALID", message: error instanceof Error ? error.message : "Invalid answers." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/test", async (request, reply) => {
    try { return await testOnboardingConnection(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_CONNECTION_FAILED", message: error instanceof Error ? error.message : "Connection failed.", connectorInvoked: false } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/detect", async (request, reply) => {
    try { return await detectOnboardingPlatform(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_PLATFORM_UNSUPPORTED", message: error instanceof Error ? error.message : "Detection failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/discover", async (request, reply) => {
    try { return await discoverOnboardingInventory(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_DISCOVERY_FAILED", message: error instanceof Error ? error.message : "Discovery failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/commit", async (request, reply) => {
    try { return await commitOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_COMMIT_BLOCKED", message: error instanceof Error ? error.message : "Save failed." } }); }
  });
};
