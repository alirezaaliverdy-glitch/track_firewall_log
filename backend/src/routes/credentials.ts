import type { FastifyPluginAsync } from "fastify";
import {
  createCredential,
  deleteCredential,
  getCredential,
  listCredentials,
  updateCredential
} from "../services/credential.service.js";

export const credentialRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/credentials", async () => ({
    credentials: await listCredentials()
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/credentials", async (request, reply) => {
    try {
      return reply.code(201).send(await createCredential(request.body ?? {}));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create credential";
      return reply.code(400).send({ error: "Failed to create credential", detail: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/credentials/:id", async (request, reply) => {
    const credential = await getCredential(request.params.id);
    if (!credential) return reply.code(404).send({ error: "Credential not found" });
    return credential;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/credentials/:id", async (request, reply) => {
    try {
      return await updateCredential(request.params.id, request.body ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update credential";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({ error: statusCode === 404 ? "Credential not found" : "Failed to update credential", detail: message });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/credentials/:id", async (request, reply) => {
    try {
      await deleteCredential(request.params.id);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Credential not found" });
    }
  });
};
