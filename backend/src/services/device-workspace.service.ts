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
      AND table_name IN ('HealthSnapshot', 'CollectionRun', 'MetricSample', 'DeviceCapabilityCache', 'DeviceSnapshot')
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
  const relatedRecords = { OR: [deviceId ? { deviceId } : null, assetId ? { assetId } : null].filter((item): item is { deviceId: string } | { assetId: string } => item !== null) };
  const tables = await optionalTables();
  const [statusChecks, healthHistory, metricSamples, findings, actions, audit, capabilityCache, configBackup, collections] = await Promise.all([
    deviceId ? prisma.deviceStatusCheck.findMany({ where: { deviceId }, orderBy: { checkedAt: "desc" }, take: 240 }) : [],
    tables.has("HealthSnapshot") ? prisma.healthSnapshot.findMany({ where: { OR: [{ ...(deviceId ? { deviceId } : { deviceId: "__none__" }) }, { ...(assetId ? { assetId } : { assetId: "__none__" }) }] }, orderBy: { collectedAt: "desc" }, take: 240 }) : [],
    deviceId && tables.has("MetricSample") ? prisma.metricSample.findMany({ where: { deviceId }, orderBy: { timestamp: "desc" }, take: 500, select: { metricKey: true, value: true, unit: true, timestamp: true, source: true } }) : [],
    prisma.finding.findMany({ where: relatedRecords, orderBy: { lastSeen: "desc" }, take: 250 }),
    prisma.actionPlan.findMany({ where: relatedRecords, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, actionType: true, status: true, riskLevel: true, createdAt: true, updatedAt: true } }),
    deviceId ? prisma.auditLog.findMany({ where: { deviceId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, action: true, dryRun: true, approvalStatus: true, createdAt: true } }) : [],
    deviceId && tables.has("DeviceCapabilityCache") ? prisma.deviceCapabilityCache.findFirst({ where: { deviceId }, orderBy: { refreshedAt: "desc" } }) : null,
    deviceId && tables.has("DeviceSnapshot") ? prisma.deviceSnapshot.findFirst({ where: { deviceId, snapshotType: { contains: "config", mode: "insensitive" } }, orderBy: { collectedAt: "desc" }, select: { collectedAt: true, snapshotType: true } }) : null,
    tables.has("CollectionRun") ? prisma.collectionRun.findMany({ where: relatedRecords, orderBy: { startedAt: "desc" }, take: 100, select: { id: true, provider: true, status: true, startedAt: true, completedAt: true, durationMs: true, errorCode: true } }) : []
  ]);
  const health = healthHistory[0] ?? null;
  const severityCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  const deviceCapabilities = asObject(device?.capabilities);
  const onboarding = asObject(deviceCapabilities.onboarding);
  const ciscoDetection = asObject(deviceCapabilities.ciscoDetection);
  const latestStatus = statusChecks[0];
  const point = (timestamp: Date | string, value: number, label?: string) => ({ timestamp, value, ...(label ? { label } : {}) });
  const successfulCollection = (status: string) => status === "succeeded" || status === "completed";
  const charts = {
    healthScore: healthHistory.map((item) => point(item.collectedAt, item.score, item.state)).reverse(),
    connectorResults: collections.map((item) => point(item.completedAt ?? item.startedAt, successfulCollection(item.status) ? 1 : 0, item.status)).reverse(),
    availability: statusChecks.map((item) => point(item.checkedAt, item.status === "online" ? 1 : item.status === "offline" || item.status === "error" ? 0 : 0.5, item.status)).reverse(),
    resources: metricSamples.filter((item) => /cpu|memory|mem|load/i.test(item.metricKey)).map((item) => ({ timestamp: item.timestamp, value: item.value, label: item.metricKey, unit: item.unit })).reverse(),
    findings: findings.map((item) => point(item.lastSeen, item.count, item.severity)).reverse(),
    actions: actions.map((item) => point(item.updatedAt, item.status === "succeeded" ? 1 : item.status === "failed" ? 0 : 0.5, item.status)).reverse(),
    recentChanges: audit.map((item) => ({ timestamp: item.createdAt, label: item.action })).reverse()
  };
  const vendorKey = device?.vendor === "cisco" ? "cisco" : device?.type === "linux_edge" ? "linux" : String(device?.type ?? directAsset?.vendor?.slug ?? "unknown");
  const cisco = asObject(deviceCapabilities.cisco);
  const ciscoCollection = asObject(cisco.collection);
  const ciscoSystem = asObject(ciscoCollection.system);
  const ciscoInterfaces = asObject(ciscoCollection.interfaces);
  const ciscoHealth = asObject(ciscoCollection.health);
  const ciscoNetwork = asObject(ciscoCollection.network);
  const ciscoProfile = asObject(cisco.capabilityProfile ?? ciscoCollection.capabilityProfile);
  const ciscoCapabilityGroups = asObject(ciscoProfile.groups);
  const ciscoFacts = Object.keys(ciscoCollection).length > 0
    ? { ...ciscoSystem, interfaces: asObject(ciscoInterfaces).summary ?? [], switchports: asObject(ciscoInterfaces).switchports ?? [], health: ciscoHealth, network: ciscoNetwork, collection: ciscoCollection }
    : asObject(cisco.facts);
  const workspaceFacts = capabilityCache?.factsJson ?? (Object.keys(ciscoFacts).length > 0 ? ciscoFacts : null);
  const workspaceDetection = capabilityCache?.detectionJson ?? (Object.keys(ciscoDetection).length > 0 ? ciscoDetection : null);
  const workspaceCapabilityList = Array.isArray(capabilityCache?.capabilitiesJson)
    ? capabilityCache.capabilitiesJson.map((item) => asObject(item))
    : Object.entries(ciscoCapabilityGroups).map(([domain, state]) => ({ domain, key: String(domain).toLowerCase(), state, mode: state === "read_only" ? "read" : "capability" }));
  const section = (key: string, titleFa: string, titleEn: string, hasData: boolean, requirement: string, nextAction: string) => ({ key, titleFa, titleEn, state: hasData ? "available" : "no_data", reason: hasData ? null : "No verified collection has been stored for this capability.", requirement, nextAction });
  const ciscoSection = (key: string, group: string, titleFa: string, titleEn: string) => {
    const capabilityState = String(ciscoCapabilityGroups[group] ?? "unknown");
    return { ...section(key, titleFa, titleEn, capabilityState !== "unknown", "Refresh verified Cisco capabilities.", "Run safe read-only Cisco validation."), capabilityState };
  };
  const vendorSections = vendorKey === "linux" ? [
    section("cpu", "پردازنده و بار", "CPU and load", metricSamples.some((item) => /cpu|load/i.test(item.metricKey)), "Run a verified Linux health collection.", "Refresh Linux monitoring."),
    section("memory", "حافظه و Swap", "Memory and swap", metricSamples.some((item) => /memory|mem|swap/i.test(item.metricKey)), "Run a verified Linux health collection.", "Refresh Linux monitoring."),
    section("disk", "دیسک و inode", "Disk and inode", metricSamples.some((item) => /disk|inode|filesystem/i.test(item.metricKey)), "Collect Linux disk metrics.", "Open Linux monitoring and refresh."),
    section("services", "سرویس‌ها", "Services", actions.some((item) => /service/i.test(item.actionType)), "Run a registered service-status template.", "Create a service check from the catalog."),
    section("ports", "پورت‌های شنونده", "Listening ports", actions.some((item) => /port/i.test(item.actionType)), "Run the registered listening-port template.", "Create a listening-port check."),
    section("firewall", "فایروال", "Firewall", actions.some((item) => /firewall|port|block/i.test(item.actionType)), "Run a registered firewall inspection.", "Open Action Center or the command catalog."),
    section("authentication", "احراز هویت", "Authentication", findings.some((item) => /auth|login|ssh/i.test(`${item.category} ${item.title}`)), "Collect authentication telemetry.", "Start Linux monitoring."),
  ] : vendorKey === "cisco" ? [
    ciscoSection("system", "System", "System", "System"),
    ciscoSection("inventory", "Inventory", "Inventory", "Inventory"),
    ciscoSection("interfaces", "Interfaces", "Interfaces", "Interfaces"),
    ciscoSection("switching", "Switching", "Switching", "Switching"),
    ciscoSection("vlan", "VLAN", "VLAN", "VLAN"),
    ciscoSection("routing", "Routing", "Routing", "Routing"),
    ciscoSection("acl", "ACL", "ACL", "ACL"),
    ciscoSection("nat", "NAT", "NAT", "NAT"),
    ciscoSection("dhcp", "DHCP", "DHCP", "DHCP"),
    ciscoSection("aaa", "AAA", "AAA", "AAA"),
    ciscoSection("monitoring", "Monitoring", "Monitoring", "Monitoring"),
    ciscoSection("backup", "Backup", "Backup", "Backup"),
    ciscoSection("diagnostics", "Diagnostics", "Diagnostics", "Diagnostics"),
    ciscoSection("security", "Security", "Security", "Security"),
    ciscoSection("services", "Services", "Services", "Services")
  ] : [
    section("interfaces", "اینترفیس‌ها", "Interfaces", actions.some((item) => /interface/i.test(item.actionType)), "Run a verified interface read.", "Use the registered vendor catalog."),
    section("routing", "مسیریابی", "Routing", actions.some((item) => /route/i.test(item.actionType)), "Run a verified routing read.", "Use the registered vendor catalog."),
    section("firewall", "فایروال و Policy", "Firewall and policy", actions.some((item) => /firewall|policy|nat|address/i.test(item.actionType)), "Run a verified policy inspection.", "Use the registered vendor catalog."),
    section("vpn", "VPN", "VPN", actions.some((item) => /vpn/i.test(item.actionType)), "Run a verified VPN status check.", "Use the registered vendor catalog.")
  ];
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
      platform: capabilityCache?.platformKey ?? ciscoCollection.platform ?? onboarding.platform ?? ciscoDetection.platform ?? directAsset?.platform?.name ?? device?.type ?? "unknown",
      version: asObject(workspaceFacts).iosVersion ?? asObject(workspaceFacts).version ?? ciscoDetection.version ?? null,
      site: directAsset?.site?.name ?? null,
      location: directAsset?.location?.name ?? null,
      managementIp: directAsset?.managementIp ?? device?.host ?? null,
      availability: latestStatus?.status ?? device?.status ?? directAsset?.healthState ?? "unknown",
      healthScore: health?.score ?? null,
      healthState: health?.state ?? directAsset?.healthState ?? device?.status ?? "unknown",
      connectorState: onboarding.connectorType ? "verified" : latestStatus?.status ?? "unknown",
      connectorType: onboarding.connectorType ?? capabilityCache?.connectorType ?? (Object.keys(ciscoCollection).length > 0 ? "cisco-ios-xe-ssh" : null),
      lastContact: latestStatus?.checkedAt ?? directAsset?.lastSeenAt ?? null,
      lastSuccessfulCollection: collections.find((item) => item.status === "succeeded" || item.status === "completed")?.completedAt ?? ciscoCollection.collectedAt ?? null,
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
    } : Object.keys(cisco).length > 0 ? {
      vendorKey: "cisco",
      platformKey: String(ciscoCollection.platform ?? ciscoDetection.platform ?? "cisco-unknown"),
      connectorType: Object.keys(ciscoCollection).length > 0 ? "cisco-ios-xe-ssh" : undefined,
      detection: workspaceDetection,
      capabilities: workspaceCapabilityList,
      facts: workspaceFacts,
      warnings: asObject(ciscoCollection).warnings ?? [],
      refreshedAt: typeof ciscoCollection.collectedAt === "string" ? ciscoCollection.collectedAt : undefined,
      expiresAt: undefined
    } : null,
    collections,
    charts,
    vendor: { key: vendorKey, sections: vendorSections }
  };
}
