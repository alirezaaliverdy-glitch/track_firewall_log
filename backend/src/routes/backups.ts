import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db/prisma.js";
import { listDevices } from "../services/device.service.js";
import { hasPermission } from "../security/permissions.js";
import { backupProfile } from "../backups/backup-profiles.js";
import { BackupError, BACKUP_SNAPSHOT_TYPE, backupMetadata, createBackup, downloadBackup, deleteBackupFile } from "../backups/device-backup.service.js";
import { backupHistoryWhere, clearBackupHistory, type BackupHistoryFilter } from "../backups/backup-history.service.js";
export async function backupRoutes(app: FastifyInstance) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) return reply.code(401).send({ error: "AUTH_REQUIRED" });
    if (!hasPermission(request.authUser.role, "devices.manage")) return reply.code(403).send({ error: "BACKUP_ACCESS_DENIED" });
    reply.header("Cache-Control", "no-store");
  };
  const adminGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) return reply.code(401).send({ error: "AUTH_REQUIRED" });
    if (request.authUser.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    return guard(request, reply);
  };
  app.get("/api/backups", { preHandler: guard }, async (request) => {
    const ownerId = request.authUser!.id;
    const devices = await listDevices(ownerId);
    const records = await prisma.deviceSnapshot.findMany({
      where: { snapshotType: BACKUP_SNAPSHOT_TYPE, device: { deletedAt: null, company: { ownerId, deletedAt: null } } },
      orderBy: [{ collectedAt: "desc" }, { id: "desc" }], take: 100, include: { device: { select: { name: true, host: true, company: { select: { name: true } } } } }
    });
    return {
      devices: devices.map((device) => ({ id: device.id, name: device.name, vendor: device.vendor, host: device.host, company: device.company, profile: backupProfile(device.vendor, device.type) })),
      history: records.map((record) => { const metadata = backupMetadata(record.dataJson); return { ...metadata, id: record.id, deviceId: record.deviceId, deviceName: metadata.deviceName || record.device.name, companyName: metadata.companyName || record.device.company?.name || "", host: metadata.host || record.device.host, vendor: record.vendor, createdAt: record.collectedAt.toISOString() }; })
    };
  });
  app.get<{ Querystring: { page?: number; action?: string; search?: string; companyId?: string } }>("/api/backups/activity", {
    preHandler: guard, schema: { querystring: { type: "object", additionalProperties: false, properties: {
      page: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
      action: { type: "string", enum: ["", "create", "failed", "download", "delete"] },
      search: { type: "string", maxLength: 120 }, companyId: { type: "string", maxLength: 100 }
    } } }
  }, async (request) => {
    const { page = 1, action, search, companyId } = request.query;
    const where = backupHistoryWhere(request.authUser!.id, { action, search, companyId });
    const [total, records] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, skip: (page - 1) * 20, take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { device: { select: { name: true, host: true, vendor: true, company: { select: { name: true } } } } } })
    ]);
    const available = await prisma.deviceSnapshot.findMany({
      where: { id: { in: records.filter(record => record.action === "device.backup.create" && record.targetId).map(record => record.targetId!) },
        snapshotType: BACKUP_SNAPSHOT_TYPE, device: { company: { ownerId: request.authUser!.id, deletedAt: null }, deletedAt: null } },
      select: { id: true }
    });
    const availableIds = new Set(available.map(record => record.id));
    return { page, pageSize: 20, total, items: records.map(record => {
      const metadata = backupMetadata(record.metadata);
      const raw = record.metadata as { code?: unknown } | null;
      return { ...metadata, id: record.id, backupId: record.action === "device.backup.create" && record.targetId && availableIds.has(record.targetId) ? record.targetId : null,
        deviceId: record.deviceId, action: record.action.split(".").at(-1),
        actor: record.actor || metadata.actor, actorName: metadata.actorName || record.actor || "",
        deviceName: metadata.deviceName || record.device?.name || "", host: metadata.host || record.device?.host || "",
        companyName: metadata.companyName || record.device?.company?.name || "", vendor: record.device?.vendor || "",
        createdAt: record.createdAt.toISOString(), code: typeof raw?.code === "string" ? raw.code : null };
    }) };
  });
  app.delete<{ Body: BackupHistoryFilter & { confirmation: string } }>("/api/backups/activity", {
    preHandler: adminGuard, schema: { body: { type: "object", additionalProperties: false, required: ["confirmation", "before"], properties: {
      confirmation: { type: "string", const: "DELETE BACKUP HISTORY" }, before: { type: "string", format: "date-time" },
      ids: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 100 } },
      companyId: { type: "string", maxLength: 100 }, search: { type: "string", maxLength: 120 },
      action: { type: "string", enum: ["", "create", "failed", "download", "delete"] }
    } } }
  }, async (request, reply) => {
    try { return await clearBackupHistory(request.authUser!.id, request.authUser!.username, request.body); }
    catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_HISTORY_DELETE_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
  app.delete<{ Params: { id: string }; Body: { confirmation: string } }>("/api/backups/:id", {
    preHandler: adminGuard, schema: { body: { type: "object", additionalProperties: false, required: ["confirmation"], properties: { confirmation: { type: "string", const: "DELETE BACKUP FILE" } } } }
  }, async (request, reply) => {
    try { return await deleteBackupFile(request.params.id, request.authUser!.id, request.authUser!.username, request.authUser!.displayName); }
    catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_DELETE_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
  app.post<{ Body: { deviceId: string } }>("/api/backups", { preHandler: guard, schema: { body: { type: "object", required: ["deviceId"], additionalProperties: false, properties: { deviceId: { type: "string", minLength: 1, maxLength: 100 } } } } }, async (request, reply) => {
    try { return reply.code(201).send(await createBackup(request.body.deviceId, request.authUser!.id, request.authUser!.username, undefined, request.authUser!.displayName)); }
    catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
  app.get<{ Params: { id: string } }>("/api/backups/:id/download", { preHandler: guard }, async (request, reply) => {
    try {
      const { content, metadata } = await downloadBackup(request.params.id, request.authUser!.id, request.authUser!.username, request.authUser!.displayName);
      return reply.header("Content-Type", metadata.contentType).header("Content-Disposition", `attachment; filename="${metadata.filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`).header("X-Backup-SHA256", metadata.sha256).send(content);
    } catch (error) { const known = error instanceof BackupError ? error : new BackupError("BACKUP_FAILED", 500); return reply.code(known.statusCode).send({ error: known.code }); }
  });
}
