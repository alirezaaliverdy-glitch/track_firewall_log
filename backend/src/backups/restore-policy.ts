import type { ActionPlan } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { digest, RESTORE_TEMPLATES, restoreVendor } from "./restore-profiles.js";
import { readRestoreArtifact, vaultScope } from "./restore-vault.service.js";
import { ciscoCompatibilityProfile } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
export type RestoreParameters = { source: "backup_restore"; ownerId: string; artifactId: string; sha256: string; vendor: keyof typeof RESTORE_TEMPLATES; templateId: string; expiresAt: string; targetFingerprint: string };
export function restoreParameters(plan: Pick<ActionPlan, "parametersJson">) {
  return plan.parametersJson as unknown as RestoreParameters;
}
export async function restoreTargetFingerprint(deviceId: string, ownerId: string) {
  const device = await prisma.device.findFirst({ where: { id: deviceId, ...vaultScope(ownerId) }, select: {
    id: true, host: true, vendor: true, type: true, protocol: true, managementPort: true, credentialId: true, credentialRef: true, capabilities: true,
    credential: { select: { updatedAt: true } },
    connectionChannels: { orderBy: { id: "asc" }, select: { id: true, role: true, method: true, host: true, port: true, credentialId: true, credential: { select: { updatedAt: true } }, enabled: true, priority: true } }
  } });
  if (!device) throw new Error("RESTORE_DEVICE_NOT_FOUND");
  return digest(Buffer.from(JSON.stringify({ ...device, capabilities: undefined, sshCompatibility: ciscoCompatibilityProfile(device) })));
}
export async function validateRestorePolicy(plan: ActionPlan) {
  const parameters = restoreParameters(plan), errors: string[] = [];
  try {
    if (plan.actionType !== "generic_security_action" || parameters.source !== "backup_restore" || !plan.deviceId ||
      !parameters.ownerId || plan.requestedBy !== parameters.ownerId || !/^[a-f0-9]{64}$/.test(parameters.sha256)) throw new Error("RESTORE_INVALID_PLAN");
    if (!Number.isFinite(Date.parse(parameters.expiresAt)) || Date.parse(parameters.expiresAt) < Date.now() ||
      Date.parse(parameters.expiresAt) > plan.createdAt.getTime() + 11 * 60000) throw new Error("RESTORE_PREVIEW_EXPIRED");
    const artifact = await readRestoreArtifact(parameters.artifactId, parameters.ownerId);
    if (artifact.record.deviceId !== plan.deviceId || artifact.vendor !== restoreVendor(parameters.vendor) ||
      artifact.metadata.sha256 !== parameters.sha256 || parameters.templateId !== RESTORE_TEMPLATES[artifact.vendor].id) throw new Error("RESTORE_INVALID_PLAN");
    if (parameters.targetFingerprint !== await restoreTargetFingerprint(plan.deviceId, parameters.ownerId)) throw new Error("RESTORE_TARGET_CHANGED");
  } catch (error) { errors.push(error instanceof Error && /^(RESTORE_|BACKUP_)/.test(error.message) ? error.message : "RESTORE_POLICY_FAILED"); }
  return { valid: !errors.length, requiresApproval: true, riskLevel: "critical" as const, errors, fieldErrors: [],
    warnings: [], missingFields: [], normalizedParameters: parameters as unknown as Record<string, unknown>,
    policyGuardError: errors[0] ?? null, exactReason: errors[0] ?? null };
}
