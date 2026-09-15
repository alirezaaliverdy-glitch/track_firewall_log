import type { FastifyPluginAsync } from "fastify";
import {
  answerOnboardingSession,
  cancelOnboardingSession,
  commitOnboardingSession,
  createOnboardingSession,
  detectOnboardingPlatform,
  discoverOnboardingInventory,
  getOnboardingSession,
  previewOnboardingSession,
  registerUnverifiedOnboardingSession,
  retryOnboardingSession,
  testOnboardingConnection,
  OnboardingDuplicateDeviceError,
  OnboardingManagementIpConflictError,
  OnboardingCredentialInvalidError
} from "../services/device-onboarding.service.js";
import { CiscoConnectorError } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";

function statusCode(error: unknown) {
  if (error instanceof CiscoConnectorError) return error.statusCode;
  const message = error instanceof Error ? error.message : "Onboarding failed.";
  return /not found|expired/i.test(message) ? 404
    : /timeout/i.test(message) ? 504
      : /no registered onboarding connector supports|use ssh or register unverified/i.test(message) ? 400
        : /connect|authentication/i.test(message) ? 502
          : 400;
}

function conflictPayload(error: OnboardingManagementIpConflictError) {
  return {
    error: {
      code: "DEVICE_MANAGEMENT_IP_CONFLICT",
      message: error.message,
      existingDeviceId: error.deviceId,
      existingAssetId: error.assetId,
      route: error.route,
      detail: { managementIp: error.managementIp, existingDeviceId: error.deviceId, existingAssetId: error.assetId, route: error.route }
    }
  };
}
export const deviceOnboardingRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: Record<string, unknown> }>("/api/device-onboarding/sessions", async (request, reply) => {
    try { return reply.code(201).send(await createOnboardingSession(request.body ?? {})); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_SESSION_INVALID", message: error instanceof Error ? error.message : "Cannot start onboarding." } }); }
  });
  app.get<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId", async (request, reply) => {
    try { return await getOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_SESSION_NOT_FOUND", message: error instanceof Error ? error.message : "Session not found." } }); }
  });
  app.post<{ Params: { sessionId: string }; Body: Record<string, unknown> }>("/api/device-onboarding/sessions/:sessionId/answers", async (request, reply) => {
    try { return await answerOnboardingSession(request.params.sessionId, request.body ?? {}); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_ANSWERS_INVALID", message: error instanceof Error ? error.message : "Invalid answers." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/test", async (request, reply) => {
    try { return await testOnboardingConnection(request.params.sessionId); }
    catch (error) { const diagnostic = error instanceof CiscoConnectorError ? error.toDiagnostic() : null; return reply.code(statusCode(error)).send({ error: { code: error instanceof OnboardingCredentialInvalidError ? "ONBOARDING_CREDENTIAL_INVALID" : diagnostic?.code ?? "ONBOARDING_CONNECTION_FAILED", message: diagnostic?.userMessage ?? (error instanceof Error ? error.message : "Connection failed."), connectorInvoked: diagnostic?.connectorInvoked ?? false, diagnostic } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/test-connection", async (request, reply) => {
    try { return await testOnboardingConnection(request.params.sessionId); }
    catch (error) { const diagnostic = error instanceof CiscoConnectorError ? error.toDiagnostic() : null; return reply.code(statusCode(error)).send({ error: { code: error instanceof OnboardingCredentialInvalidError ? "ONBOARDING_CREDENTIAL_INVALID" : diagnostic?.code ?? "ONBOARDING_CONNECTION_FAILED", message: diagnostic?.userMessage ?? (error instanceof Error ? error.message : "Connection failed."), connectorInvoked: diagnostic?.connectorInvoked ?? false, diagnostic } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/detect", async (request, reply) => {
    try { return await detectOnboardingPlatform(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_PLATFORM_UNSUPPORTED", message: error instanceof Error ? error.message : "Detection failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/detect-platform", async (request, reply) => {
    try { return await detectOnboardingPlatform(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_PLATFORM_UNSUPPORTED", message: error instanceof Error ? error.message : "Detection failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/discover", async (request, reply) => {
    try { return await discoverOnboardingInventory(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_DISCOVERY_FAILED", message: error instanceof Error ? error.message : "Discovery failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/preview", async (request, reply) => {
    try { return await previewOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_PREVIEW_BLOCKED", message: error instanceof Error ? error.message : "Preview failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/build-preview", async (request, reply) => {
    try { return await previewOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_PREVIEW_BLOCKED", message: error instanceof Error ? error.message : "Preview failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/commit", async (request, reply) => {
    try { return await commitOnboardingSession(request.params.sessionId); }
    catch (error) {
      if (error instanceof OnboardingManagementIpConflictError) return reply.code(409).send(conflictPayload(error));
      return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_COMMIT_BLOCKED", message: error instanceof Error ? error.message : "Save failed." } });
    }
  });
  app.post<{ Params: { sessionId: string }; Body: Record<string, unknown> }>("/api/device-onboarding/sessions/:sessionId/register-unverified", async (request, reply) => {
    try { return await registerUnverifiedOnboardingSession(request.params.sessionId, request.body ?? {}); }
    catch (error) {
      if (error instanceof OnboardingManagementIpConflictError) return reply.code(409).send(conflictPayload(error));
      if (error instanceof OnboardingDuplicateDeviceError) {
        return reply.code(409).send({ error: { code: "DEVICE_MANAGEMENT_IP_CONFLICT", message: error.message, existingDeviceId: error.deviceId, route: error.route, detail: { existingDeviceId: error.deviceId, route: error.route } } });
      }
      return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_UNVERIFIED_REGISTRATION_FAILED", message: error instanceof Error ? error.message : "Unverified registration failed.", connectorInvoked: false } });
    }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/retry", async (request, reply) => {
    try { return await retryOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_RETRY_BLOCKED", message: error instanceof Error ? error.message : "Retry failed." } }); }
  });
  app.post<{ Params: { sessionId: string } }>("/api/device-onboarding/sessions/:sessionId/cancel", async (request, reply) => {
    try { return await cancelOnboardingSession(request.params.sessionId); }
    catch (error) { return reply.code(statusCode(error)).send({ error: { code: "ONBOARDING_CANCEL_FAILED", message: error instanceof Error ? error.message : "Cancel failed." } }); }
  });
};
