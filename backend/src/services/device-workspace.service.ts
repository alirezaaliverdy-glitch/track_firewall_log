import { prisma } from "../db/prisma.js";

const PENDING_ACTION_STATES = ["proposed", "validation_failed", "dry_run_ready", "pending_approval", "approved", "executing", "rollback_pending"] as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

let optionalTablesPromise: Promise<Set<string>> | null = null;
function optionalTables() {
  optionalTablesPromise ??= prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('HealthSnapshot', 'CollectionRun', 'DeviceCapabilityCache', 'DeviceSnapshot')
  `.then((rows) => new Set(rows.map((row) => row.table_name)));
  return optionalTablesPromise;
}

export async function getDeviceWorkspace(reference: string) {
  const directDevice = await prisma.device.findUnique({ where: { id: reference } });
  const directAsset = directDevice
    ? await prisma.asset.findUnique({ where: { deviceId: directDevice.id }, include: { site: true, location: true, vendor: true, platform: true } })
    : await prisma.asset.findUnique({ where: { id: reference }, include: { site: true, location: true, vendor: true, platform: true } });
  const device = directDevice ?? (directAsset?.deviceId ? await prisma.device.findUnique({ where: { id: directAsset.deviceId } }) : null);
  if (!device && !directAsset) return null;
  const deviceId = device?.id;
  const assetId = directAsset?.id;
  const tables = await optionalTables();
  const [statusChecks, health, findings, actions, audit, capabilityCache, configBackup, collections] = await Promise.all([
    deviceId ? prisma.deviceStatusCheck.findMany({ where: { deviceId }, orderBy: { checkedAt: "desc" }, take: 10 }) : [],
    tables.has("HealthSnapshot") ? prisma.healthSnapshot.findFirst({ where: { OR: [{ ...(deviceId ? { deviceId } : { deviceId: "__none__" }) }, { ...(assetId ? { assetId } : { assetId: "__none__" }) }] }, orderBy: { collectedAt: "desc" } }) : null,
    prisma.finding.findMany({ where: { ...(deviceId ? { deviceId } : {}), ...(assetId ? { assetId } : {}) }, orderBy: { lastSeen: "desc" }, take: 100 }),
    prisma.actionPlan.findMany({ where: { ...(deviceId ? { deviceId } : {}), ...(assetId ? { assetId } : {}) }, orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, actionType: true, status: true, riskLevel: true, createdAt: true, updatedAt: true } }),
    deviceId ? prisma.auditLog.findMany({ where: { deviceId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, dryRun: true, approvalStatus: true, createdAt: true } }) : [],
    deviceId && tables.has("DeviceCapabilityCache") ? prisma.deviceCapabilityCache.findFirst({ where: { deviceId }, orderBy: { refreshedAt: "desc" } }) : null,
    deviceId && tables.has("DeviceSnapshot") ? prisma.deviceSnapshot.findFirst({ where: { deviceId, snapshotType: { contains: "config", mode: "insensitive" } }, orderBy: { collectedAt: "desc" }, select: { collectedAt: true, snapshotType: true } }) : null,
    tables.has("CollectionRun") ? prisma.collectionRun.findMany({ where: { ...(deviceId ? { deviceId } : {}), ...(assetId ? { assetId } : {}) }, orderBy: { startedAt: "desc" }, take: 10, select: { id: true, provider: true, status: true, startedAt: true, completedAt: true, durationMs: true, errorCode: true } }) : []
  ]);
  const severityCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  const deviceCapabilities = asObject(device?.capabilities);
  const onboarding = asObject(deviceCapabilities.onboarding);
  const ciscoDetection = asObject(deviceCapabilities.ciscoDetection);
  const latestStatus = statusChecks[0];
  return {
    reference,
    device: device ? {
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      type: device.type,
      host: device.host,
      managementPort: device.managementPort,
      protocol: device.protocol,
      environment: device.environment,
      status: device.status,
      credentialConfigured: Boolean(device.credentialId || device.credentialRef),
      tags: device.tags,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt
    } : null,
    asset: directAsset ? {
      id: directAsset.id,
      name: directAsset.name,
      hostname: directAsset.hostname,
      managementIp: directAsset.managementIp,
      managedState: directAsset.managedState,
      healthState: directAsset.healthState,
      lastSeenAt: directAsset.lastSeenAt,
      site: directAsset.site?.name ?? null,
      location: directAsset.location?.name ?? null,
      vendor: directAsset.vendor?.name ?? null,
      platform: directAsset.platform?.name ?? null
    } : null,
    overview: {
      name: device?.name ?? directAsset?.name,
      vendor: device?.vendor ?? directAsset?.vendor?.name ?? "unknown",
      platform: capabilityCache?.platformKey ?? onboarding.platform ?? ciscoDetection.platform ?? directAsset?.platform?.name ?? device?.type ?? "unknown",
      version: asObject(capabilityCache?.factsJson).version ?? ciscoDetection.version ?? null,
      site: directAsset?.site?.name ?? null,
      location: directAsset?.location?.name ?? null,
      managementIp: directAsset?.managementIp ?? device?.host ?? null,
      availability: latestStatus?.status ?? device?.status ?? directAsset?.healthState ?? "unknown",
      healthScore: health?.score ?? null,
      healthState: health?.state ?? directAsset?.healthState ?? device?.status ?? "unknown",
      connectorState: onboarding.connectorType ? "verified" : latestStatus?.status ?? "unknown",
      connectorType: onboarding.connectorType ?? capabilityCache?.connectorType ?? null,
      lastContact: latestStatus?.checkedAt ?? directAsset?.lastSeenAt ?? null,
      lastSuccessfulCollection: collections.find((item) => item.status === "succeeded" || item.status === "completed")?.completedAt ?? null,
      findingsBySeverity: severityCounts,
      pendingActions: actions.filter((item) => PENDING_ACTION_STATES.includes(item.status as typeof PENDING_ACTION_STATES[number])).length,
      recentChanges: audit.slice(0, 5),
      configBackup: configBackup ? { state: "available", collectedAt: configBackup.collectedAt, snapshotType: configBackup.snapshotType } : { state: "not_available", collectedAt: null },
      verificationStatus: latestStatus?.status === "online" ? "verified" : latestStatus ? "needs_review" : "not_verified"
    },
    statusChecks,
    health,
    findings,
    actions,
    audit,
    capabilities: capabilityCache ? {
      vendorKey: capabilityCache.vendorKey,
      platformKey: capabilityCache.platformKey,
      connectorType: capabilityCache.connectorType,
      detection: capabilityCache.detectionJson,
      capabilities: capabilityCache.capabilitiesJson,
      facts: capabilityCache.factsJson,
      warnings: capabilityCache.warningsJson,
      refreshedAt: capabilityCache.refreshedAt,
      expiresAt: capabilityCache.expiresAt
    } : null,
    collections
  };
}
