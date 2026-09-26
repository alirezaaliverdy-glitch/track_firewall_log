import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db/prisma.js";
import { listDevices } from "../services/device.service.js";
import { hasPermission } from "../security/permissions.js";
import { backupProfile } from "../backups/backup-profiles.js";
import { BackupError, BACKUP_SNAPSHOT_TYPE, backupMetadata, createBackup, downloadBackup } from "../backups/device-backup.service.js";
export async function backupRoutes(app: FastifyInstance) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) return reply.code(401).send({ error: "AUTH_REQUIRED" });
    if (!hasPermission(request.authUser.role, "devices.manage")) return reply.code(403).send({ error: "BACKUP_ACCESS_DENIED" });
    reply.header("Cache-Control", "no-store");
  };
  app.get("/api/backups", { preHandler: guard }, async (request) => {
    const ownerId = request.authUser!.id;
    const devices = await listDevices(ownerId);
    const records = await prisma.deviceSnapshot.findMany({
      where: { snapshotType: BACKUP_SNAPSHOT_TYPE, device: { deletedAt: null, company: { ownerId, deletedAt: null } } },
      orderBy: { collectedAt: "desc" }, take: 100, include: { device: { select: { name: true } } }
    });
    return {
      devices: devices.map((device) => ({ id: device.id, name: device.name, vendor: device.vendor, host: device.host, company: device.company, profile: backupProfile(device.vendor, device.type) })),
      history: records.map((record) => ({ id: record.id, deviceId: record.deviceId, deviceName: record.device.name, vendor: record.vendor, createdAt: record.collectedAt.toISOString(), ...backupMetadata(record.dataJson) }))
    };
  });
  app.post<{ Body: { deviceId: string } }>("/api/backups", { preHandler: guard, schema: { body: { type: "object", required: ["deviceId"], additionalProperties: false, properties: { deviceId: { type: "string", minLength: 1, maxLength: 100 } } } } }, async (request, reply) => {
    try { return reply.code(201).send(await createBackup(request.body.deviceId, request.authUser!.id, request.authUser!.username)); }
    catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
  app.get<{ Params: { id: string } }>("/api/backups/:id/download", { preHandler: guard }, async (request, reply) => {
    try {
      const { content, metadata } = await downloadBackup(request.params.id, request.authUser!.id, request.authUser!.username);
      return reply.header("Content-Type", metadata.contentType).header("Content-Disposition", `attachment; filename="${metadata.filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`).header("X-Backup-SHA256", metadata.sha256).send(content);
    } catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
}
