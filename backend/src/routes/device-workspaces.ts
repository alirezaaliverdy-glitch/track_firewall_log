import type { FastifyPluginAsync } from "fastify";
import { getDeviceWorkspace } from "../services/device-workspace.service.js";

export const deviceWorkspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { reference: string } }>("/api/device-workspaces/:reference", async (request, reply) => {
    const workspace = await getDeviceWorkspace(request.params.reference);
    return workspace ?? reply.code(404).send({ error: { code: "DEVICE_WORKSPACE_NOT_FOUND", message: "Device or asset not found." } });
  });
};
