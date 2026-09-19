import type { FastifyPluginAsync } from "fastify";
import {
  createCredential,
  CredentialInUseError,
  deleteCredential,
  DuplicateCredentialNameError,
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
      if (error instanceof DuplicateCredentialNameError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      const message = error instanceof Error && /required|must be password or private_key/i.test(error.message)
        ? error.message
        : "Credential could not be created.";
      return reply.code(400).send({ error: { code: "CREDENTIAL_INVALID", message } });
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
      if (error instanceof DuplicateCredentialNameError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      }
      const message = error instanceof Error ? error.message : "Failed to update credential";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({ error: { code: statusCode === 404 ? "CREDENTIAL_NOT_FOUND" : "CREDENTIAL_INVALID", message: statusCode === 404 ? "Credential not found" : "Credential could not be updated." } });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>("/api/credentials/:id", async (request, reply) => {
    try {
      return await deleteCredential(request.params.id, request.query.force === "true");
    } catch (error) {
      if (error instanceof CredentialInUseError) {
        return reply.code(409).send({ error: { code: error.code, message: error.message, deviceCount: error.deviceCount } });
      }
      return reply.code(404).send({ error: { code: "CREDENTIAL_NOT_FOUND", message: "Credential not found" } });
    }
  });
};
