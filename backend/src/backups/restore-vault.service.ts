import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getDeviceById } from "../services/device.service.js";
import { encryptSecret, decryptSecret } from "../services/credential-crypto.service.js";
import { BACKUP_SNAPSHOT_TYPE, backupMetadata } from "./device-backup.service.js";
import { BackupError } from "./backup-collector.js";
import { backupProfile } from "./backup-profiles.js";
import { digest, restoreVendor, validateRestoreArtifact, configIdentity, linuxServiceFiles } from "./restore-profiles.js";
export const UPLOADED_BACKUP_TYPE = "encrypted_uploaded_configuration_v1";
export const vaultScope = (ownerId: string) => ({ deletedAt: null, company: { ownerId, deletedAt: null } });
export async function uploadRestoreArtifact(deviceId: string, ownerId: string, actor: string, filename: string, content: Buffer) {
  if (!env.credentialEncryptionKey) throw new BackupError("BACKUP_ENCRYPTION_REQUIRED", 503);
  const device = await getDeviceById(deviceId, ownerId);
  if (!device) throw new BackupError("BACKUP_DEVICE_NOT_FOUND", 404);
  const vendor = restoreVendor(device.vendor), profile = backupProfile(vendor);
  validateRestoreArtifact(vendor, content);
  const count = await prisma.deviceSnapshot.count({ where: { snapshotType: UPLOADED_BACKUP_TYPE, device: vaultScope(ownerId) } });
  if (count >= 100) throw new BackupError("RESTORE_VAULT_FULL", 409);
  const safeName = filename.split(/[\\/]/).at(-1)!.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "uploaded." + profile.extension;
  const metadata = { filename: safeName, bytes: content.length, sha256: digest(content), actor, actorId: ownerId,
    actorName: actor, deviceName: device.name, companyName: device.company?.name ?? "", host: device.host,
    contentType: profile.contentType, title: profile.title, scope: profile.scope };
  return prisma.$transaction(async tx => {
    const record = await tx.deviceSnapshot.create({ data: { deviceId, vendor: device.vendor, snapshotType: UPLOADED_BACKUP_TYPE,
      dataJson: { ...metadata, encrypted: encryptSecret(content.toString("base64")) } } });
    await tx.auditLog.create({ data: { deviceId, actor, action: "device.restore.upload", targetType: "device_backup", targetId: record.id, metadata } });
    return { id: record.id, deviceId, vendor, ...metadata, origin: "uploaded", createdAt: record.collectedAt.toISOString() };
  });
}
export async function readRestoreArtifact(id: string, ownerId: string) {
  const record = await prisma.deviceSnapshot.findFirst({ where: { id, snapshotType: { in: [BACKUP_SNAPSHOT_TYPE, UPLOADED_BACKUP_TYPE] }, device: vaultScope(ownerId) } });
  if (!record) throw new BackupError("BACKUP_NOT_FOUND", 404);
  const metadata = backupMetadata(record.dataJson);
  let content: Buffer;
  try { content = Buffer.from(decryptSecret(String((record.dataJson as { encrypted?: unknown }).encrypted)) ?? "", "base64"); }
  catch { throw new BackupError("BACKUP_DECRYPTION_FAILED", 503); }
  if (content.length !== metadata.bytes || digest(content) !== metadata.sha256) throw new BackupError("BACKUP_INTEGRITY_FAILED", 503);
  const vendor = restoreVendor(record.vendor);
  validateRestoreArtifact(vendor, content);
  return { record, metadata, content, vendor };
}
export async function listRestoreVault(ownerId: string) {
  const records = await prisma.deviceSnapshot.findMany({ where: { snapshotType: { in: [BACKUP_SNAPSHOT_TYPE, UPLOADED_BACKUP_TYPE] }, device: vaultScope(ownerId) },
    take: 200, orderBy: [{ collectedAt: "desc" }, { id: "desc" }] });
  return records.map(record => ({ ...backupMetadata(record.dataJson), id: record.id, deviceId: record.deviceId, vendor: record.vendor,
    origin: record.snapshotType === UPLOADED_BACKUP_TYPE ? "uploaded" : "collected", createdAt: record.collectedAt.toISOString() }));
}
export async function reviewRestoreArtifact(id: string, ownerId: string) {
  const artifact = await readRestoreArtifact(id, ownerId);
  return { id, deviceId: artifact.record.deviceId, vendor: artifact.vendor, ...artifact.metadata,
    identity: configIdentity(artifact.vendor, artifact.content),
    files: artifact.vendor === "linux" ? linuxServiceFiles(artifact.content, true).map(({ path, bytes, sha256, kind }) => ({ path, bytes, sha256, kind })) : [] };
}
export async function deleteUploadedArtifact(id: string, ownerId: string, actor: string) {
  return prisma.$transaction(async tx => {
    const record = await tx.deviceSnapshot.findFirst({ where: { id, snapshotType: UPLOADED_BACKUP_TYPE, device: vaultScope(ownerId) } });
    if (!record) throw new BackupError("BACKUP_NOT_FOUND", 404);
    const removed = await tx.deviceSnapshot.deleteMany({ where: { id, snapshotType: UPLOADED_BACKUP_TYPE, device: vaultScope(ownerId) } });
    await tx.auditLog.create({ data: { deviceId: record.deviceId, actor, action: "device.restore.file_delete", targetType: "device_backup", targetId: id,
      metadata: backupMetadata(record.dataJson) } });
    return { deletedCount: removed.count };
  });
}
