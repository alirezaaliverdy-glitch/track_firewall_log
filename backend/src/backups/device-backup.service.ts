import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getDeviceById } from "../services/device.service.js";
import { encryptSecret, decryptSecret } from "../services/credential-crypto.service.js";
import { SharedSshConnectionError } from "../services/shared-ssh-session.service.js";
import { collectDeviceBackup, BackupError } from "./backup-collector.js";
import { backupProfile, backupFilename, validateBackup } from "./backup-profiles.js";
export { BackupError };
export const BACKUP_SNAPSHOT_TYPE = "encrypted_configuration_backup_v1";
const active = new Set<string>();
export function backupMetadata(value: unknown) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { filename: String(data.filename ?? ""), bytes: Number(data.bytes ?? 0), sha256: String(data.sha256 ?? ""), scope: String(data.scope ?? ""), title: String(data.title ?? ""), actor: String(data.actor ?? ""), actorId: String(data.actorId ?? ""), actorName: String(data.actorName ?? data.actor ?? ""), companyName: String(data.companyName ?? ""), deviceName: String(data.deviceName ?? ""), host: String(data.host ?? ""), durationMs: Number(data.durationMs ?? 0), contentType: String(data.contentType ?? "application/octet-stream") };
}
export async function createBackup(deviceId: string, ownerId: string, actor: string, collector = collectDeviceBackup, actorName = actor) {
  if (!env.credentialEncryptionKey) throw new BackupError("BACKUP_ENCRYPTION_REQUIRED", 503);
  const device = await getDeviceById(deviceId, ownerId);
  if (!device) throw new BackupError("BACKUP_DEVICE_NOT_FOUND", 404);
  const profile = backupProfile(device.vendor, device.type);
  if (!profile.supported) throw new BackupError("BACKUP_VENDOR_UNSUPPORTED");
  if (active.has(device.id) || active.size >= 4) throw new BackupError("BACKUP_BUSY", 409);
  active.add(device.id);
  const startedAt = Date.now();
  const identity = { actor, actorId: ownerId, actorName, deviceName: device.name, companyName: device.company?.name ?? "", host: device.host };
  try {
    const buffer = await collector(device);
    validateBackup(profile, buffer);
    const metadata = { filename: backupFilename(device.name, profile.extension), bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), scope: profile.scope, title: profile.title, contentType: profile.contentType, ...identity, durationMs: Date.now() - startedAt };
    const record = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.deviceSnapshot.create({ data: { deviceId: device.id, vendor: device.vendor, snapshotType: BACKUP_SNAPSHOT_TYPE, dataJson: { ...metadata, encrypted: encryptSecret(buffer.toString("base64")) } } });
      await tx.auditLog.create({ data: { deviceId: device.id, actor, action: "device.backup.create", targetType: "device_backup", targetId: snapshot.id, dryRun: false, approvalStatus: "not_required", metadata } });
      return snapshot;
    });
    return { ...metadata, id: record.id, deviceId: device.id, vendor: device.vendor, createdAt: record.collectedAt.toISOString() };
  } catch (error) {
    // Device output can contain secrets; never expose it in an error or log.
    const known = error instanceof BackupError ? error
      : error instanceof SharedSshConnectionError ? new BackupError(error.code, 502)
      : error instanceof Error && /^BACKUP_[A-Z_]+$/.test(error.message) ? new BackupError(error.message, 502)
      : new BackupError("BACKUP_COLLECTION_FAILED", 502);
    await prisma.auditLog.create({ data: { deviceId: device.id, actor, action: "device.backup.failed", targetType: "device", targetId: device.id, dryRun: false, approvalStatus: "not_required", metadata: { code: known.code, ...identity, durationMs: Date.now() - startedAt } } }).catch(() => undefined);
    throw known;
  } finally { active.delete(device.id); }
}
export async function downloadBackup(id: string, ownerId: string, actor: string, actorName = actor) {
  const record = await prisma.deviceSnapshot.findFirst({ where: { id, snapshotType: BACKUP_SNAPSHOT_TYPE, device: { deletedAt: null, company: { ownerId, deletedAt: null } } } });
  if (!record) throw new BackupError("BACKUP_NOT_FOUND", 404);
  const metadata = backupMetadata(record.dataJson);
  const encrypted = (record.dataJson as Record<string, unknown>).encrypted;
  let content: Buffer;
  try { content = Buffer.from(decryptSecret(String(encrypted)) ?? "", "base64"); } catch { throw new BackupError("BACKUP_DECRYPTION_FAILED", 503); }
  if (content.length !== metadata.bytes || createHash("sha256").update(content).digest("hex") !== metadata.sha256) throw new BackupError("BACKUP_INTEGRITY_FAILED", 503);
  await prisma.auditLog.create({ data: { deviceId: record.deviceId, actor, action: "device.backup.download", targetType: "device_backup", targetId: id, dryRun: false, approvalStatus: "not_required", metadata: { ...metadata, actor, actorId: ownerId, actorName } } });
  return { content, metadata };
}
export async function deleteBackupFile(id: string, ownerId: string, actor: string, actorName = actor) {
  return prisma.$transaction(async tx => {
    const where = { id, snapshotType: BACKUP_SNAPSHOT_TYPE, device: { deletedAt: null, company: { ownerId, deletedAt: null } } };
    const record = await tx.deviceSnapshot.findFirst({ where });
    if (!record) throw new BackupError("BACKUP_NOT_FOUND", 404);
    const deleted = await tx.deviceSnapshot.deleteMany({ where });
    if (!deleted.count) throw new BackupError("BACKUP_NOT_FOUND", 404);
    await tx.auditLog.create({ data: { deviceId: record.deviceId, actor, action: "device.backup.delete",
      targetType: "device_backup", targetId: id, dryRun: false, approvalStatus: "not_required",
      metadata: { ...backupMetadata(record.dataJson), actor, actorId: ownerId, actorName } } });
    return { ok: true, deletedCount: deleted.count };
  });
}
