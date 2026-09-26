import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { BackupError } from "./backup-collector.js";
export type BackupHistoryFilter = { companyId?: string; action?: string; search?: string; ids?: string[]; before?: string };
const actions = ["create", "failed", "download", "delete"];
export function backupHistoryWhere(ownerId: string, filter: BackupHistoryFilter): Prisma.AuditLogWhereInput {
  if (filter.action && !actions.includes(filter.action)) throw new BackupError("BACKUP_HISTORY_FILTER_INVALID");
  const term = filter.search?.trim();
  return {
    action: filter.action ? "device.backup." + filter.action : { in: actions.map(action => "device.backup." + action) },
    device: { deletedAt: null, ...(filter.companyId ? { companyId: filter.companyId } : {}), company: { ownerId, deletedAt: null } },
    ...(filter.ids ? { id: { in: filter.ids } } : {}),
    ...(filter.before ? { createdAt: { lte: new Date(Math.min(new Date(filter.before).getTime(), Date.now())) } } : {}),
    ...(term ? { OR: [
      { actor: { contains: term, mode: "insensitive" } },
      { device: { name: { contains: term, mode: "insensitive" } } },
      { device: { host: { contains: term, mode: "insensitive" } } },
      { device: { vendor: { contains: term, mode: "insensitive" } } },
      { metadata: { path: ["actorName"], string_contains: term } },
      { metadata: { path: ["deviceName"], string_contains: term } }
    ] } : {})
  };
}
export async function clearBackupHistory(ownerId: string, actor: string, filter: BackupHistoryFilter) {
  if (!filter.before || !Number.isFinite(Date.parse(filter.before))) throw new BackupError("CONFIRMATION_REQUIRED");
  return prisma.$transaction(async tx => {
    const deleted = await tx.auditLog.deleteMany({ where: backupHistoryWhere(ownerId, filter) });
    await tx.auditLog.create({ data: {
      actor, action: "device.backup.history.clear", targetType: "user", targetId: ownerId,
      dryRun: false, approvalStatus: "not_required",
      metadata: { deletedCount: deleted.count, companyId: filter.companyId ?? null, action: filter.action ?? null, singleSelection: Boolean(filter.ids) }
    } });
    return { ok: true, deletedCount: deleted.count, filesDeleted: false };
  });
}
