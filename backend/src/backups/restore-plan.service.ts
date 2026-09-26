import { prisma } from "../db/prisma.js";
import { getDeviceById } from "../services/device.service.js";
import { validateActionPlan } from "../services/policy-guard.service.js";
import { BackupError, collectDeviceBackup } from "./backup-collector.js";
import { createBackup } from "./device-backup.service.js";
import { readRestoreArtifact, vaultScope } from "./restore-vault.service.js";
import { RESTORE_TEMPLATES, assertCompatible } from "./restore-profiles.js";
import { restoreParameters, restoreTargetFingerprint } from "./restore-policy.js";
import { preflightRestoreConnector, applyRestoreConnector, verifyRestoreConnector } from "./restore-connector.js";
type Actor = { id: string; username: string; displayName: string };
export const restorePlanWhere = (ownerId: string) => ({ requestedBy: ownerId, parametersJson: { path: ["source"], equals: "backup_restore" }, device: vaultScope(ownerId) });
export async function buildRestorePlan(artifactId: string, owner: Actor, dependencies = { collect: collectDeviceBackup, preflight: preflightRestoreConnector }) {
  const artifact = await readRestoreArtifact(artifactId, owner.id);
  const device = await getDeviceById(artifact.record.deviceId, owner.id);
  if (!device) throw new BackupError("BACKUP_DEVICE_NOT_FOUND", 404);
  const fingerprint = await restoreTargetFingerprint(device.id, owner.id);
  const current = await dependencies.collect(device);
  assertCompatible(artifact.vendor, artifact.content, current);
  await dependencies.preflight(device, artifact.vendor, artifact.content);
  const template = RESTORE_TEMPLATES[artifact.vendor];
  const parameters = { source: "backup_restore", ownerId: owner.id, artifactId, sha256: artifact.metadata.sha256,
    vendor: artifact.vendor, templateId: template.id, targetFingerprint: fingerprint, expiresAt: new Date(Date.now() + 10 * 60000).toISOString() };
  const plan = await prisma.$transaction(async tx => {
    const record = await tx.actionPlan.create({ data: { source: "user", requestedBy: owner.id, deviceId: device.id,
      actionType: "generic_security_action", status: "dry_run_ready", riskLevel: "critical", parametersJson: parameters,
      dryRunJson: { method: template.method, filename: artifact.metadata.filename, deviceName: device.name, host: device.host,
        sha256: artifact.metadata.sha256, actorName: owner.displayName || owner.username, connectorInvoked: false } } });
    await tx.actionAuditLog.create({ data: { actionPlanId: record.id, deviceId: device.id, eventType: "restore_preview", message: "Owned backup restore preview generated; no configuration changed.", metadataJson: { actor: owner.username, sha256: artifact.metadata.sha256 } } });
    return record;
  });
  return { id: plan.id, expiresAt: parameters.expiresAt, vendor: artifact.vendor, method: template.method,
    filename: artifact.metadata.filename, sha256: artifact.metadata.sha256, deviceName: device.name, host: device.host, connectorInvoked: false };
}
export async function executeRestorePlan(id: string, owner: Actor, input: { intent: string; sha256: string; confirmation: string; fullEtcConfirmation?: string }) {
  const plan = await prisma.actionPlan.findFirst({ where: { id, ...restorePlanWhere(owner.id) } });
  if (!plan) throw new BackupError("RESTORE_PLAN_NOT_FOUND", 404);
  const parameters = restoreParameters(plan);
  if (input.intent !== "execute" || input.sha256 !== parameters.sha256 || input.confirmation !== "RESTORE BACKUP" ||
      (parameters.vendor === "linux" && input.fullEtcConfirmation !== "RESTORE FULL ETC")) throw new BackupError("RESTORE_CONFIRMATION_REQUIRED", 409);
  const policy = await validateActionPlan(plan);
  if (!policy.valid) throw new BackupError(policy.errors[0] || "RESTORE_POLICY_FAILED", 409);
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock($1::bigint)", 26092618);
    const running = await tx.actionPlan.findMany({ where: { status: "executing", parametersJson: { path: ["source"], equals: "backup_restore" } }, select: { deviceId: true }, take: 4 });
    if (running.length >= 4 || running.some(item => item.deviceId === plan.deviceId)) throw new BackupError("RESTORE_BUSY", 409);
    const claimed = await tx.actionPlan.updateMany({ where: { id, ...restorePlanWhere(owner.id), status: "dry_run_ready" },
      data: { status: "executing", approvalJson: { actor: owner.username, actorId: owner.id, sha256: input.sha256, approvedAt: new Date().toISOString() },
        resultJson: { state: "taking_safety_backup", connectorInvoked: false } } });
    if (claimed.count !== 1) throw new BackupError("RESTORE_ALREADY_STARTED", 409);
    await tx.actionAuditLog.create({ data: { actionPlanId: id, deviceId: plan.deviceId, eventType: "restore_confirmed", message: "User confirmed this artifact and target.", metadataJson: { actor: owner.username, sha256: input.sha256, fullEtc: parameters.vendor === "linux" } } });
  });
  void runRestoreJob(id, owner).catch(() => undefined);
  return { id, status: "executing", state: "taking_safety_backup" };
}
// A restarted in-flight job is never automatically replayed against a vendor.
async function runRestoreJob(id: string, owner: Actor) {
  let connectorInvoked = false, safetyBackupId = "";
  try {
    const plan = await prisma.actionPlan.findFirst({ where: { id, ...restorePlanWhere(owner.id), status: "executing" } });
    if (!plan || !plan.deviceId) throw new BackupError("RESTORE_PLAN_NOT_FOUND", 404);
    const parameters = restoreParameters(plan);
    const policy = await validateActionPlan(plan);
    if (!policy.valid) throw new BackupError(policy.errors[0], 409);
    const artifact = await readRestoreArtifact(parameters.artifactId, owner.id);
    const device = await getDeviceById(plan.deviceId, owner.id);
    if (!device) throw new BackupError("BACKUP_DEVICE_NOT_FOUND", 404);
    const safety = await createBackup(device.id, owner.id, owner.username, undefined, owner.displayName);
    safetyBackupId = safety.id;
    const fresh = await readRestoreArtifact(safety.id, owner.id);
    assertCompatible(artifact.vendor, artifact.content, fresh.content);
    await preflightRestoreConnector(device, artifact.vendor, artifact.content);
    const finalPolicy = await validateActionPlan(plan);
    if (!finalPolicy.valid) throw new BackupError(finalPolicy.errors[0], 409);
    connectorInvoked = true;
    await prisma.actionPlan.update({ where: { id }, data: { resultJson: { state: "applying", safetyBackupId, connectorInvoked } } });
    const result = await applyRestoreConnector(device, artifact.vendor, artifact.content);
    await finishRestore(id, owner, { ...result, safetyBackupId }, result.verified);
  } catch (error) {
    const code = error instanceof Error && /^(RESTORE_|BACKUP_|SSH_|CISCO_)[A-Z_]+$/.test(error.message) ? error.message : "RESTORE_EXECUTION_FAILED";
    await finishRestore(id, owner, { state: connectorInvoked ? "needs_review" : "failed_before_apply", code, safetyBackupId, connectorInvoked }, false);
  }
}
async function finishRestore(id: string, owner: Actor, result: Record<string, string | boolean>, verified: boolean) {
  await prisma.$transaction(async tx => {
    const plan = await tx.actionPlan.update({ where: { id }, data: { status: verified ? "succeeded" : "failed", resultJson: result } });
    await tx.actionAuditLog.create({ data: { actionPlanId: id, deviceId: plan.deviceId, eventType: "restore_result", message: "Restore outcome recorded without raw configuration.", metadataJson: { actor: owner.username, ...result } } });
    await tx.auditLog.create({ data: { deviceId: plan.deviceId, actor: owner.username, action: "device.restore.result", targetType: "action_plan", targetId: id,
      dryRun: false, approvalStatus: "approved", metadata: { actorName: owner.displayName, ...result } } });
  });
}
export async function verifyRestorePlan(id: string, owner: Actor) {
  const plan = await prisma.actionPlan.findFirst({ where: { id, ...restorePlanWhere(owner.id) } });
  if (!plan) throw new BackupError("RESTORE_PLAN_NOT_FOUND", 404);
  const result = plan.resultJson as Record<string, string | boolean> | null;
  if (plan.status === "executing" || !result?.connectorInvoked || !["awaiting_verification", "applied_merge_needs_review"].includes(String(result.state))) throw new BackupError("RESTORE_REVIEW_REQUIRED", 409);
  const parameters = restoreParameters(plan), artifact = await readRestoreArtifact(parameters.artifactId, owner.id);
  if (parameters.sha256 !== artifact.metadata.sha256 || parameters.targetFingerprint !== await restoreTargetFingerprint(plan.deviceId!, owner.id)) throw new BackupError("RESTORE_TARGET_CHANGED", 409);
  const device = await getDeviceById(plan.deviceId!, owner.id);
  if (!device || !await verifyRestoreConnector(device, artifact.vendor, artifact.content)) throw new BackupError("RESTORE_VERIFICATION_FAILED", 409);
  await finishRestore(id, owner, { ...result, verified: true, state: "configuration_verified" }, true);
  return { id, verified: true };
}
export async function listRestorePlans(ownerId: string) {
  const plans = await prisma.actionPlan.findMany({ where: restorePlanWhere(ownerId), take: 50, orderBy: { createdAt: "desc" }, include: { device: { select: { name: true, host: true, vendor: true } } } });
  return plans.map(plan => ({
    id: plan.id, status: plan.status, device: plan.device, createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString(),
    preview: plan.dryRunJson, result: plan.resultJson,
    interrupted: plan.status === "executing" && Date.now() - plan.updatedAt.getTime() > 10 * 60000
  }));
}
