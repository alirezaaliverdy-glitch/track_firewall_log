import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { BackupError } from "../backups/backup-collector.js";
import { uploadRestoreArtifact, listRestoreVault, reviewRestoreArtifact, deleteUploadedArtifact, readRestoreArtifact } from "../backups/restore-vault.service.js";
import { buildRestorePlan, executeRestorePlan, listRestorePlans, verifyRestorePlan } from "../backups/restore-plan.service.js";
import { hasPermission } from "../security/permissions.js";
import { prisma } from "../db/prisma.js";
export async function backupRestoreRoutes(app: FastifyInstance) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    if (!request.authUser) return reply.code(401).send({ error: "AUTH_REQUIRED" });
    if (!hasPermission(request.authUser.role, "devices.manage")) return reply.code(403).send({ error: "BACKUP_ACCESS_DENIED" });
  };
  const admin = async (request: FastifyRequest, reply: FastifyReply) => {
    const blocked = await guard(request, reply);
    if (reply.sent) return blocked;
    if (request.authUser!.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  };
  const failure = (error: unknown, reply: FastifyReply) => {
    const known = error instanceof BackupError ? error : new BackupError("RESTORE_REQUEST_FAILED", 502);
    return reply.code(known.statusCode).send({ error: known.code });
  };
  app.get("/api/backups/vault", { preHandler: guard }, async request => ({ files: await listRestoreVault(request.authUser!.id) }));
  app.get("/api/backups/restores", { preHandler: guard }, async request => ({ items: await listRestorePlans(request.authUser!.id) }));
  app.post<{ Querystring: { deviceId: string } }>("/api/backups/vault", { preHandler: admin,
    schema: { querystring: { type: "object", additionalProperties: false, required: ["deviceId"], properties: { deviceId: { type: "string", minLength: 1, maxLength: 100 } } } }
  }, async (request, reply) => {
    try {
      const part = await request.file({ limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 } });
      if (!part) throw new BackupError("RESTORE_FILE_REQUIRED");
      const content = await part.toBuffer();
      if (part.file.truncated) throw new BackupError("BACKUP_TOO_LARGE", 413);
      return reply.code(201).send(await uploadRestoreArtifact(request.query.deviceId, request.authUser!.id, request.authUser!.displayName || request.authUser!.username, part.filename, content));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") return failure(new BackupError("BACKUP_TOO_LARGE", 413), reply);
      return failure(error, reply);
    }
  });
  app.get<{ Params: { id: string } }>("/api/backups/vault/:id/review", { preHandler: admin }, async (request, reply) => {
    try { return await reviewRestoreArtifact(request.params.id, request.authUser!.id); } catch (error) { return failure(error, reply); }
  });
  app.get<{ Params: { id: string } }>("/api/backups/vault/:id/download", { preHandler: guard }, async (request, reply) => {
    try {
      const { content, metadata, record } = await readRestoreArtifact(request.params.id, request.authUser!.id);
      await prisma.auditLog.create({ data: { deviceId: record.deviceId, actor: request.authUser!.username, action: "device.restore.file_download", targetType: "device_backup", targetId: record.id, metadata: { filename: metadata.filename, sha256: metadata.sha256 } } });
      return reply.header("Content-Type", metadata.contentType).header("Content-Disposition", 'attachment; filename="' + metadata.filename.replace(/[^a-zA-Z0-9_.-]/g, "_") + '"').header("X-Backup-SHA256", metadata.sha256).send(content);
    } catch (error) { return failure(error, reply); }
  });
  app.delete<{ Params: { id: string }; Body: { confirmation: string } }>("/api/backups/vault/:id", { preHandler: admin,
    schema: { body: { type: "object", additionalProperties: false, required: ["confirmation"], properties: { confirmation: { type: "string", const: "DELETE UPLOADED BACKUP" } } } }
  }, async (request, reply) => {
    try { return await deleteUploadedArtifact(request.params.id, request.authUser!.id, request.authUser!.username); } catch (error) { return failure(error, reply); }
  });
  app.post<{ Body: { artifactId: string } }>("/api/backups/restores/preview", { preHandler: admin,
    schema: { body: { type: "object", additionalProperties: false, required: ["artifactId"], properties: { artifactId: { type: "string", minLength: 1, maxLength: 100 } } } }
  }, async (request, reply) => {
    try { return reply.code(201).send(await buildRestorePlan(request.body.artifactId, request.authUser!)); } catch (error) { return failure(error, reply); }
  });
  app.post<{ Params: { id: string }; Body: { intent: string; sha256: string; confirmation: string; fullEtcConfirmation?: string } }>("/api/backups/restores/:id/execute", { preHandler: admin,
    schema: { body: { type: "object", additionalProperties: false, required: ["intent", "sha256", "confirmation"], properties: {
      intent: { type: "string", const: "execute" }, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      confirmation: { type: "string", const: "RESTORE BACKUP" }, fullEtcConfirmation: { type: "string", const: "RESTORE FULL ETC" }
    } } }
  }, async (request, reply) => {
    try { return reply.code(202).send(await executeRestorePlan(request.params.id, request.authUser!, request.body)); } catch (error) { return failure(error, reply); }
  });
  app.post<{ Params: { id: string } }>("/api/backups/restores/:id/verify", { preHandler: admin }, async (request, reply) => {
    try { return await verifyRestorePlan(request.params.id, request.authUser!); } catch (error) { return failure(error, reply); }
  });
}
