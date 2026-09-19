import { prisma } from "../db/prisma.js";
import { mergeCiscoWorkspaceInterfaces, projectCiscoWorkspaceDetails, safeCiscoDetail } from "./device-workspace-cisco.js";

const PENDING_ACTION_STATES = ["proposed", "validation_failed", "dry_run_ready", "pending_approval", "approved", "executing", "rollback_pending"] as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectedRows(value: unknown) {
  return asArray(value).map((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return entry;
    const raw = String(entry ?? "").trim();
    const name = raw.match(/(?:^|\s)(?:name|default-name)=([^\s]+)/i)?.[1] ?? raw;
    return { name, raw };
  });
}

function timestamp(value: unknown) {
  const parsed = value ? new Date(String(value)).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveWorkspaceConnectionState(
  latestStatus: { status: string; checkedAt: Date | string } | null | undefined,
  persistedStatus: string | null | undefined,
  successfulEvidence: unknown[]
) {
  const latestSuccessAt = successfulEvidence
    .map(timestamp)
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0] ?? null;
  const latestCheckAt = timestamp(latestStatus?.checkedAt);
  if (latestSuccessAt !== null && (latestCheckAt === null || latestSuccessAt >= latestCheckAt)) {
    return { availability: "online", verificationStatus: "verified", lastContact: new Date(latestSuccessAt) };
  }
  const availability = latestStatus?.status ?? persistedStatus ?? "unknown";
  return {
    availability,
    verificationStatus: availability === "online" ? "verified" : latestStatus ? "needs_review" : "not_verified",
    lastContact: latestStatus?.checkedAt ?? null
  };
}

export function liveVendorProjection(vendorKey: string, capabilities: Record<string, unknown>, refreshedAt: Date | string | null) {
  const statusKey = vendorKey === "mikrotik" ? "mikrotikStatus" : vendorKey === "fortigate" ? "fortigateStatus" : vendorKey === "sophos" ? "sophosStatus" : vendorKey === "linux" ? "linuxStatus" : "";
  const status = statusKey ? asObject(capabilities[statusKey]) : {};
  if (status.connected !== true) return null;
  const connectorCapabilities = asObject(status.capabilities);
  const capabilityList = Object.entries(connectorCapabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => ({ domain: key, key, state: "read_only", mode: "read" }));
  const section = (key: string, titleFa: string, titleEn: string, value: unknown) => {
    const hasData = Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
    return hasData ? { key, titleFa, titleEn, state: "available" as const, reason: null, requirement: "", nextAction: "" } : null;
  };

  if (vendorKey === "mikrotik") {
    const data = asObject(status.mikrotik);
    return {
      connectorType: "mikrotik",
      facts: {
        hostname: data.identity ?? null,
        version: data.routerosVersion ?? null,
        uptime: data.uptime ?? null,
        architecture: data.architecture ?? null,
        interfaces: collectedRows(data.interfaces),
        health: { cpuLoad: data.cpuLoad ?? null, memoryFree: data.memoryFree ?? null },
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.identity ?? data.routerosVersion),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("routing", "مسیریابی", "Routing", data.routes),
        section("firewall", "فایروال", "Firewall", data.firewallFilterRules),
        section("nat", "NAT", "NAT", data.natRules),
        section("services", "سرویس‌ها", "Services", data.services),
        section("logs", "رویدادها", "Logs", data.recentLogs)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  if (vendorKey === "fortigate") {
    const data = asObject(status.fortigate);
    return {
      connectorType: "fortigate",
      facts: {
        hostname: data.hostname ?? status.hostname ?? null,
        model: data.model ?? null,
        serialNumber: data.serial ?? null,
        version: data.version ?? null,
        interfaces: collectedRows(data.interfaces),
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.hostname ?? data.version),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("routing", "مسیریابی", "Routing", data.routes),
        section("firewall", "Policy و فایروال", "Firewall and policy", data.policies),
        section("services", "سرویس‌ها", "Services", data.services),
        section("ha", "دسترس‌پذیری بالا", "High availability", data.haStatus)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  if (vendorKey === "sophos") {
    const data = asObject(status.sophos);
    return {
      connectorType: "sophos-api",
      facts: {
        product: data.product ?? "Sophos Firewall",
        apiVersion: data.apiVersion ?? null,
        interfaces: collectedRows(data.interfaces),
        zones: data.zones ?? [],
        gateways: data.gateways ?? [],
        firewallRules: data.firewallRules ?? [],
        ipHosts: data.ipHosts ?? [],
        services: data.services ?? [],
        vpnConnections: data.vpnConnections ?? [],
        collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
      },
      capabilities: capabilityList,
      warnings: asArray(status.warnings),
      refreshedAt: data.collectedAt ?? status.collectedAt ?? refreshedAt,
      sections: [
        section("system", "سامانه", "System", data.product ?? data.apiVersion),
        section("interfaces", "اینترفیس‌ها", "Interfaces", data.interfaces),
        section("zones", "ناحیه‌ها", "Zones", data.zones),
        section("routing", "درگاه‌ها و مسیریابی", "Gateways and routing", data.gateways),
        section("firewall", "قوانین فایروال", "Firewall rules", data.firewallRules),
        section("objects", "میزبان‌ها و سرویس‌ها", "Hosts and services", [...asArray(data.ipHosts), ...asArray(data.services)]),
        section("vpn", "اتصال‌های VPN", "VPN connections", data.vpnConnections)
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    };
  }

  return {
    connectorType: "linux_edge",
    facts: {
      hostname: status.hostname ?? null,
      version: status.os ?? null,
      listeningPorts: status.listeningPorts ?? null,
      firewallStatus: status.ufwStatus ?? null,
      sshServiceStatus: status.sshServiceStatus ?? null,
      collection: { inventoryStatus: "collected", capabilityStatus: asArray(status.warnings).length ? "partial" : "available" }
    },
    capabilities: capabilityList,
    warnings: asArray(status.warnings),
    refreshedAt: status.collectedAt ?? status.listeningPortsCheckedAt ?? refreshedAt,
    sections: [
      section("system", "سامانه", "System", status.hostname ?? status.os),
      section("ports", "پورت‌های شنونده", "Listening ports", status.listeningPorts),
      section("firewall", "فایروال", "Firewall", status.ufwStatus),
      section("services", "سرویس‌ها", "Services", status.sshServiceStatus)
    ].filter((item): item is NonNullable<typeof item> => item !== null)
  };
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
  const normalizedVendor = String(device?.vendor ?? device?.type ?? directAsset?.vendor?.slug ?? "unknown").toLowerCase();
  const vendorKey = normalizedVendor.includes("cisco") ? "cisco"
    : normalizedVendor.includes("mikrotik") ? "mikrotik"
      : normalizedVendor.includes("forti") ? "fortigate"
        : device?.type === "linux_edge" || normalizedVendor.includes("linux") ? "linux"
          : normalizedVendor;
  const cisco = asObject(deviceCapabilities.cisco);
  const ciscoCollection = asObject(cisco.collection);
  const ciscoSystem = asObject(ciscoCollection.system);
  const ciscoInterfaces = asObject(ciscoCollection.interfaces);
  const ciscoHealth = asObject(ciscoCollection.health);
  const ciscoNetwork = asObject(ciscoCollection.network);
  const ciscoProfile = asObject(cisco.capabilityProfile ?? ciscoCollection.capabilityProfile);
  const ciscoCapabilityGroups = asObject(ciscoProfile.groups);
  const ciscoFacts = Object.keys(ciscoCollection).length > 0
    ? {
      ...ciscoSystem,
      inventory: safeCiscoDetail(asArray(ciscoSystem.inventory)),
      interfaces: safeCiscoDetail(mergeCiscoWorkspaceInterfaces(ciscoInterfaces.summary, ciscoInterfaces.switchports)),
      switchports: safeCiscoDetail(asArray(ciscoInterfaces.switchports)),
      health: safeCiscoDetail(ciscoHealth),
      network: safeCiscoDetail(ciscoNetwork),
      configuration: safeCiscoDetail(asObject(ciscoCollection.configuration)),
      securityServices: safeCiscoDetail(asObject(ciscoCollection.securityServices)),
      collection: {
        collectedAt: ciscoCollection.collectedAt ?? null,
        inventoryStatus: ciscoCollection.inventoryStatus ?? "unknown",
        capabilityStatus: ciscoCollection.capabilityStatus ?? "unknown"
      }
    }
    : asObject(cisco.facts);
  const liveProjection = liveVendorProjection(vendorKey, deviceCapabilities, latestStatus?.checkedAt ?? null);
  const latestSuccessfulCollection = collections.find((item) => successfulCollection(item.status))?.completedAt ?? null;
  const connectionState = resolveWorkspaceConnectionState(latestStatus, device?.status ?? directAsset?.healthState, [
    latestSuccessfulCollection,
    ciscoCollection.collectedAt,
    onboarding.verifiedAt,
    liveProjection?.refreshedAt
  ]);
  const workspaceFacts = liveProjection?.facts ?? capabilityCache?.factsJson ?? (Object.keys(ciscoFacts).length > 0 ? ciscoFacts : null);
  const workspaceDetection = capabilityCache?.detectionJson ?? (Object.keys(ciscoDetection).length > 0 ? ciscoDetection : null);
  const workspaceCapabilityList = liveProjection?.capabilities ?? (Array.isArray(capabilityCache?.capabilitiesJson)
    ? capabilityCache.capabilitiesJson.map((item) => asObject(item))
    : Object.entries(ciscoCapabilityGroups).map(([domain, state]) => ({ domain, key: String(domain).toLowerCase(), state, mode: state === "read_only" ? "read" : "capability" })));
  const section = (key: string, titleFa: string, titleEn: string, hasData: boolean, requirement: string, nextAction: string) => ({ key, titleFa, titleEn, state: hasData ? "available" : "no_data", reason: hasData ? null : "No verified collection has been stored for this capability.", requirement, nextAction });
  const ciscoSection = (key: string, group: string, titleFa: string, titleEn: string) => {
    const capabilityState = String(ciscoCapabilityGroups[group] ?? "unknown");
    return { ...section(key, titleFa, titleEn, capabilityState !== "unknown", "Refresh verified Cisco capabilities.", "Run safe read-only Cisco validation."), capabilityState };
  };
  const vendorSections = liveProjection?.sections ?? (vendorKey === "cisco" ? [
    ciscoSection("system", "System", "سامانه", "System"),
    ciscoSection("inventory", "Inventory", "موجودی سخت‌افزار", "Inventory"),
    ciscoSection("interfaces", "Interfaces", "اینترفیس‌ها", "Interfaces"),
    ciscoSection("switching", "Switching", "سوئیچینگ", "Switching"),
    ciscoSection("vlan", "VLAN", "VLAN", "VLAN"),
    ciscoSection("routing", "Routing", "مسیریابی", "Routing"),
    ciscoSection("acl", "ACL", "کنترل دسترسی (ACL)", "ACL"),
    ciscoSection("nat", "NAT", "NAT", "NAT"),
    ciscoSection("dhcp", "DHCP", "DHCP", "DHCP"),
    ciscoSection("aaa", "AAA", "احراز هویت (AAA)", "AAA"),
    ciscoSection("monitoring", "Monitoring", "پایش", "Monitoring"),
    ciscoSection("backup", "Backup", "پشتیبان تنظیمات", "Backup"),
    ciscoSection("diagnostics", "Diagnostics", "عیب‌یابی", "Diagnostics"),
    ciscoSection("security", "Security", "امنیت", "Security"),
    ciscoSection("services", "Services", "سرویس‌ها", "Services")
  ].filter((item) => item.capabilityState !== "unknown") : []);
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
      availability: connectionState.availability,
      healthScore: health?.score ?? null,
      healthState: health?.state ?? directAsset?.healthState ?? device?.status ?? "unknown",
      connectorState: onboarding.connectorType && connectionState.verificationStatus === "verified" ? "verified" : connectionState.availability,
      connectorType: liveProjection?.connectorType ?? onboarding.connectorType ?? capabilityCache?.connectorType ?? (Object.keys(ciscoCollection).length > 0 ? "cisco-ios-xe-ssh" : null),
      lastContact: connectionState.lastContact ?? directAsset?.lastSeenAt ?? null,
      lastSuccessfulCollection: latestSuccessfulCollection ?? ciscoCollection.collectedAt ?? null,
      findingsBySeverity: severityCounts,
      pendingActions: actions.filter((item) => PENDING_ACTION_STATES.includes(item.status as typeof PENDING_ACTION_STATES[number])).length,
      recentChanges: audit.slice(0, 5),
      configBackup: configBackup ? { state: "available", collectedAt: configBackup.collectedAt, snapshotType: configBackup.snapshotType } : { state: "not_available", collectedAt: null },
      verificationStatus: connectionState.verificationStatus
    },
    statusChecks,
    health,
    findings,
    actions,
    audit,
    capabilities: liveProjection ? {
      vendorKey,
      platformKey: String(onboarding.platform ?? directAsset?.platform?.name ?? device?.type ?? vendorKey),
      connectorType: liveProjection.connectorType,
      detection: workspaceDetection,
      capabilities: liveProjection.capabilities,
      facts: liveProjection.facts,
      warnings: liveProjection.warnings,
      refreshedAt: liveProjection.refreshedAt,
      expiresAt: undefined
    } : capabilityCache ? {
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
    vendor: { key: vendorKey, sections: vendorSections },
    vendorDetails: vendorKey === "cisco" ? projectCiscoWorkspaceDetails(ciscoCollection) : null
  };
}
