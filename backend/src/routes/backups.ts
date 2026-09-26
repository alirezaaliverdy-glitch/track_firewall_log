import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Prisma } from "@prisma/client";
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
      action: { type: "string", enum: ["", "create", "failed", "download"] },
      search: { type: "string", maxLength: 120 }, companyId: { type: "string", maxLength: 100 }
    } } }
  }, async (request) => {
    const { page = 1, action, search, companyId } = request.query;
    const term = search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      action: action ? "device.backup." + action : { in: ["device.backup.create", "device.backup.failed", "device.backup.download"] },
      device: { deletedAt: null, ...(companyId ? { companyId } : {}), company: { ownerId: request.authUser!.id, deletedAt: null } },
      ...(term ? { OR: [
        { actor: { contains: term, mode: "insensitive" } },
        { device: { name: { contains: term, mode: "insensitive" } } },
        { device: { host: { contains: term, mode: "insensitive" } } },
        { device: { vendor: { contains: term, mode: "insensitive" } } },
        { metadata: { path: ["actorName"], string_contains: term } },
        { metadata: { path: ["deviceName"], string_contains: term } }
      ] } : {})
    };
    const [total, records] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, skip: (page - 1) * 20, take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { device: { select: { name: true, host: true, vendor: true, company: { select: { name: true } } } } } })
    ]);
    return { page, pageSize: 20, total, items: records.map(record => {
      const metadata = backupMetadata(record.metadata);
      const raw = record.metadata as { code?: unknown } | null;
      return { ...metadata, id: record.id, backupId: record.action !== "device.backup.failed" ? record.targetId : null,
        deviceId: record.deviceId, action: record.action.split(".").at(-1),
        actor: record.actor || metadata.actor, actorName: metadata.actorName || record.actor || "",
        deviceName: metadata.deviceName || record.device?.name || "", host: metadata.host || record.device?.host || "",
        companyName: metadata.companyName || record.device?.company?.name || "", vendor: record.device?.vendor || "",
        createdAt: record.createdAt.toISOString(), code: typeof raw?.code === "string" ? raw.code : null };
    }) };
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
