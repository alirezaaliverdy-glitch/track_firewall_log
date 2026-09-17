import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { getDeviceWorkspace } from "../services/device-workspace.service.js";
import {
  commitDeviceVerification,
  getDeviceVerification,
  retryDeviceVerification,
  testDeviceVerification
} from "../services/device-verification.service.js";

function verificationStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Device verification failed.";
  if (/not found/i.test(message)) return 404;
  if (/already in progress/i.test(message)) return 409;
  if (/connect|authentication|credential/i.test(message)) return 502;
  return 400;
}

function verificationError(reply: FastifyReply, error: unknown) {
  return reply.code(verificationStatus(error)).send({
    error: {
      code: verificationStatus(error) === 409 ? "DEVICE_VERIFICATION_IN_PROGRESS" : "DEVICE_VERIFICATION_FAILED",
      message: error instanceof Error ? error.message : "Device verification failed."
    }
  });
}

export const deviceWorkspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { reference: string } }>("/api/device-workspaces/:reference", async (request, reply) => {
    const workspace = await getDeviceWorkspace(request.params.reference);
    return workspace ?? reply.code(404).send({ error: { code: "DEVICE_WORKSPACE_NOT_FOUND", message: "Device or asset not found." } });
  });
  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/verification", async (request, reply) => {
    try { return await getDeviceVerification(request.params.deviceId); }
    catch (error) { return verificationError(reply, error); }
  });
  app.post<{ Params: { deviceId: string }; Body: Record<string, unknown> }>("/api/devices/:deviceId/connection-test", async (request, reply) => {
    try { return await testDeviceVerification(request.params.deviceId, request.body ?? {}); }
    catch (error) { return verificationError(reply, error); }
  });
  app.post<{ Params: { deviceId: string }; Body: Record<string, unknown> }>("/api/devices/:deviceId/verification/retry", async (request, reply) => {
    try { return await retryDeviceVerification(request.params.deviceId, request.body ?? {}); }
    catch (error) { return verificationError(reply, error); }
  });
  app.post<{ Params: { deviceId: string }; Body: Record<string, unknown> }>("/api/devices/:deviceId/verification/commit", async (request, reply) => {
    try { return await commitDeviceVerification(request.params.deviceId, request.body ?? {}); }
    catch (error) { return verificationError(reply, error); }
  });
};
