import { ActionPlanSource, ActionType, AiRiskLevel, DetectionRuleType, IncidentSeverity, type Device, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { proposeActionPlan } from "../services/action-plan.service.js";
import { notifySecurityFinding } from "../services/security-alert-email.service.js";
import { PRIORITY_EMAIL_RULE_KEYS, VENDOR_DETECTION_RULES, deduplicateDetectionEvents, eventMatchesVendorRule, groupSubject, normalizeDetectionVendor } from "../security/vendor-detection-rule-library.js";

const MAX_IMPORT_ASSETS = 100;
const SECRET_KEY_PATTERN = /(password|passwd|token|api[_-]?key|secret|authorization|privateKey|passphrase)/i;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
const SAFE_DSL_OPERATORS = new Set([
  "equals", "not_equals", "contains", "starts_with", "ends_with", "exists", "not_exists",
  "greater_than", "greater_or_equal", "less_than", "less_or_equal", "in", "not_in",
  "cidr_contains", "safe_regex"
]);

type ImportAssetInput = {
  name?: string;
  hostname?: string;
  managementIp?: string;
  serial?: string;
  externalId?: string;
  vendor?: string;
  platform?: string;
  role?: string;
  site?: string;
  location?: string;
  managedState?: string;
  healthState?: string;
  tags?: string[];
  interfaces?: Array<{ name?: string; ips?: string[]; macAddress?: string }>;
};

type ImportInput = {
  sourceType?: string;
  idempotencyKey?: string;
  assets?: ImportAssetInput[];
};

type SecurityEventInput = {
  deviceId?: string;
  assetId?: string;
  vendor?: string;
  eventType?: string;
  action?: string;
  severity?: string;
  srcIp?: string;
  dstIp?: string;
  dstPort?: number;
  username?: string;
  rawMessage?: string;
  normalizedJson?: Record<string, unknown>;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 200) : fallback;
}

function normalizeSeverity(value: unknown): "low" | "medium" | "high" | "critical" {
  return value === "critical" || value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function assertNoSecrets(value: unknown, path = "payload") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Secret-like field is not allowed in imports: ${path}.${key}`);
    if (nested && typeof nested === "object") assertNoSecrets(nested, `${path}.${key}`);
  }
}

function normalizeImport(input: ImportInput) {
  const sourceType = cleanText(input.sourceType, "manual_json") || "manual_json";
  const assets = Array.isArray(input.assets) ? input.assets.slice(0, MAX_IMPORT_ASSETS) : [];
  return { sourceType, idempotencyKey: cleanText(input.idempotencyKey), assets };
}

function assetIdentity(input: ImportAssetInput) {
  const managementIp = cleanText(input.managementIp);
  const serial = cleanText(input.serial);
  const hostname = cleanText(input.hostname || input.name);
  const externalId = cleanText(input.externalId);
  return { managementIp, serial, hostname, externalId };
}

function duplicateWhere(input: ImportAssetInput): Prisma.AssetWhereInput {
  const identity = assetIdentity(input);
  const OR: Prisma.AssetWhereInput[] = [];
  if (identity.externalId) OR.push({ externalId: identity.externalId });
  if (identity.serial) OR.push({ serial: identity.serial });
  if (identity.managementIp) OR.push({ managementIp: identity.managementIp });
  if (identity.hostname) OR.push({ hostname: { equals: identity.hostname, mode: "insensitive" } });
  return OR.length ? { OR } : { id: "__no_match__" };
}

async function upsertNameModel<T extends "assetRole" | "assetVendor" | "assetPlatform" | "assetSite">(
  tx: Prisma.TransactionClient,
  model: T,
  name: string | undefined
) {
  const clean = cleanText(name);
  if (!clean) return undefined;
  const data = { name: clean, slug: slug(clean) };
  if (model === "assetRole") return (await tx.assetRole.upsert({ where: { slug: data.slug }, update: { name: data.name }, create: data })).id;
  if (model === "assetVendor") return (await tx.assetVendor.upsert({ where: { slug: data.slug }, update: { name: data.name }, create: data })).id;
  if (model === "assetPlatform") return (await tx.assetPlatform.upsert({ where: { slug: data.slug }, update: { name: data.name }, create: data })).id;
  return (await tx.assetSite.upsert({ where: { slug: data.slug }, update: { name: data.name }, create: data })).id;
}

async function upsertLocation(tx: Prisma.TransactionClient, siteId: string | undefined, name: string | undefined) {
  const clean = cleanText(name);
  if (!clean) return undefined;
  const existing = await tx.assetLocation.findFirst({ where: { siteId: siteId ?? null, slug: slug(clean) } });
  const location = existing
    ? await tx.assetLocation.update({ where: { id: existing.id }, data: { name: clean } })
    : await tx.assetLocation.create({ data: { name: clean, slug: slug(clean), siteId } });
  return location.id;
}

async function upsertSource(tx: Prisma.TransactionClient, sourceType: string) {
  return tx.assetSource.upsert({
    where: { name: sourceType },
    update: { type: sourceType, enabled: true },
    create: { name: sourceType, type: sourceType, enabled: true, configJson: toJson({ mockAdapter: sourceType === "netbox" || sourceType === "wazuh" }) }
  });
}

type DeviceAssetProjection = Pick<Device, "id" | "name" | "vendor" | "type" | "host" | "protocol" | "managementPort" | "status" | "tags" | "capabilities">;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isArchivedDevice(device: Pick<Device, "capabilities">) {
  const capabilities = object(device.capabilities);
  const inventory = object(capabilities.inventory);
  return capabilities.inventoryStatus === "archived" || inventory.status === "archived" || Boolean(inventory.removedAt);
}

async function projectionCandidates(tx: Prisma.TransactionClient, device: DeviceAssetProjection) {
  return tx.asset.findMany({
    where: {
      OR: [
        { deviceId: device.id },
        {
          deviceId: null,
          OR: [
            { managementIp: device.host },
            { hostname: { equals: device.name, mode: "insensitive" } },
            { ipAddresses: { some: { address: device.host } } }
          ]
        }
      ]
    },
    orderBy: { id: "asc" }
  });
}

export async function syncDeviceRecordToAsset(tx: Prisma.TransactionClient, device: DeviceAssetProjection) {
  if (isArchivedDevice(device)) {
    const archived = await tx.asset.findUnique({ where: { deviceId: device.id } });
    if (archived && archived.managedState !== "archived") {
      return { asset: await tx.asset.update({ where: { id: archived.id }, data: { managedState: "archived", healthState: "archived" } }), created: false };
    }
    if (archived) return { asset: archived, created: false };
  }
  const candidates = await projectionCandidates(tx, device);
  const linked = candidates.filter((asset) => asset.deviceId === device.id);
  const unlinked = candidates.filter((asset) => asset.deviceId === null);
  if (linked.length > 1 || (linked.length === 0 && unlinked.length > 1)) {
    throw new Error(`Ambiguous Asset projection for Device ${device.id}; no automatic change was made.`);
  }
  const source = await upsertSource(tx, "existing_devices");
  const capabilities = object(device.capabilities);
  const cisco = object(capabilities.cisco);
  const ciscoCollection = object(cisco.collection);
  const ciscoSystem = object(ciscoCollection.system);
  const ciscoFacts = object(cisco.facts);
  const ciscoDetection = object(capabilities.ciscoDetection);
  const collectedHostname = String(ciscoSystem.hostname ?? ciscoFacts.hostname ?? ciscoDetection.hostname ?? device.name).trim() || device.name;
  const collectedSerial = String(ciscoSystem.serialNumber ?? ciscoFacts.serialNumber ?? "").trim() || null;
  const collectedPlatform = String(ciscoCollection.platform ?? ciscoDetection.platform ?? device.type).trim() || device.type;
  const vendorId = await upsertNameModel(tx, "assetVendor", device.vendor);
  const platformId = await upsertNameModel(tx, "assetPlatform", collectedPlatform);
  const roleId = await upsertNameModel(tx, "assetRole", device.type === "linux_edge" ? "Linux Server" : "Network Device");
  const existing = linked[0] ?? unlinked[0];
  const data = {
    name: device.name,
    hostname: collectedHostname,
    managementIp: device.host,
    serial: collectedSerial,
    managedState: "managed",
    healthState: device.status,
    deviceId: device.id,
    vendorId,
    platformId,
    roleId,
    sourceId: source.id,
    lastSeenAt: new Date(),
    tagsJson: toJson(device.tags),
    metadataJson: toJson({ deviceType: device.type, protocol: device.protocol, managementPort: device.managementPort, cisco: { inventoryStatus: cisco.inventoryStatus ?? null, capabilityStatus: cisco.capabilityStatus ?? null, platform: collectedPlatform } })
  };
  const asset = existing ? await tx.asset.update({ where: { id: existing.id }, data }) : await tx.asset.create({ data });
  await tx.assetIpAddress.upsert({
    where: { address: device.host },
    update: { assetId: asset.id, role: "management" },
    create: { address: device.host, assetId: asset.id, role: "management" }
  });
  return { asset, created: !existing };
}

export async function auditDeviceAssetReconciliation() {
  const [devices, assets] = await Promise.all([
    prisma.device.findMany({ orderBy: { id: "asc" } }),
    prisma.asset.findMany({ orderBy: { id: "asc" }, include: { ipAddresses: { select: { address: true } } } })
  ]);
  const deviceResults = devices.map((device) => {
    const linked = assets.filter((asset) => asset.deviceId === device.id);
    const candidates = assets.filter((asset) => asset.deviceId === null && (
      asset.managementIp === device.host ||
      asset.hostname?.localeCompare(device.name, undefined, { sensitivity: "accent" }) === 0 ||
      asset.ipAddresses.some((address) => address.address === device.host)
    ));
    return {
      deviceId: device.id,
      name: device.name,
      type: device.type,
      host: device.host,
      state: linked.length === 1 ? "linked" : linked.length > 1 || candidates.length > 1 ? "ambiguous" : candidates.length === 1 ? "unambiguous_match" : "missing_projection",
      assetIds: linked.length ? linked.map((asset) => asset.id) : candidates.map((asset) => asset.id)
    };
  });
  return {
    controlEntity: "Device" as const,
    projectionEntity: "Asset" as const,
    counts: { devices: devices.length, assets: assets.length },
    devices: deviceResults,
    devicesWithoutAsset: deviceResults.filter((item) => item.state !== "linked"),
    assetsWithoutDevice: assets.filter((asset) => asset.deviceId === null).map((asset) => ({ id: asset.id, name: asset.name, hostname: asset.hostname, managementIp: asset.managementIp })),
    ambiguous: deviceResults.filter((item) => item.state === "ambiguous")
  };
}

export async function repairDeviceAssetReconciliation(apply = false) {
  const audit = await auditDeviceAssetReconciliation();
  if (!apply) return { mode: "dry-run" as const, audit, changed: 0 };
  if (audit.ambiguous.length > 0) {
    throw new Error(`Refusing reconciliation: ${audit.ambiguous.length} ambiguous Device/Asset match(es) require manual resolution.`);
  }
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    const devices = await tx.device.findMany({ orderBy: { id: "asc" } });
    for (const device of devices) {
      if (isArchivedDevice(device)) continue;
      const result = await syncDeviceRecordToAsset(tx, device);
      if (result.created || audit.devicesWithoutAsset.some((item) => item.deviceId === device.id)) changed += 1;
    }
  });
  return { mode: "apply" as const, audit: await auditDeviceAssetReconciliation(), changed };
}

export async function syncExistingDevicesToAssets() {
  const devices = await prisma.device.findMany({ orderBy: { id: "asc" } });
  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const device of devices) {
      if (isArchivedDevice(device)) continue;
      const result = await syncDeviceRecordToAsset(tx, device);
      if (result.created) created += 1;
      else updated += 1;
    }
  });
  return { scanned: devices.length, created, updated };
}

export async function syncDeviceToAsset(deviceId: string) {
  return prisma.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id: deviceId } });
    return device ? (await syncDeviceRecordToAsset(tx, device)).asset : null;
  });
}

export async function previewAssetImport(input: ImportInput) {
  assertNoSecrets(input);
  const normalized = normalizeImport(input);
  const rows = [];
  for (const item of normalized.assets) {
    const identity = assetIdentity(item);
    if (identity.managementIp && !IPV4_PATTERN.test(identity.managementIp)) throw new Error(`Invalid management IP: ${identity.managementIp}`);
    const existing = await prisma.asset.findFirst({ where: duplicateWhere(item), select: { id: true, name: true } });
    rows.push({
      input: item,
      action: existing ? "update" : "create",
      duplicateOf: existing?.id ?? null,
      matchName: existing?.name ?? null,
      identity
    });
  }
  return {
    sourceType: normalized.sourceType,
    idempotencyKey: normalized.idempotencyKey || null,
    total: rows.length,
    creates: rows.filter((row) => row.action === "create").length,
    updates: rows.filter((row) => row.action === "update").length,
    rows
  };
}

export async function applyAssetImport(input: ImportInput) {
  assertNoSecrets(input);
  const normalized = normalizeImport(input);
  const preview = await previewAssetImport(input);
  const existingRun = normalized.idempotencyKey ? await prisma.assetSyncRun.findUnique({ where: { sourceType_idempotencyKey: { sourceType: normalized.sourceType, idempotencyKey: normalized.idempotencyKey } } }) : null;
  if (existingRun) return { ...preview, applied: existingRun.appliedJson, idempotentReplay: true };

  let created = 0;
  let updated = 0;
  const run = await prisma.$transaction(async (tx) => {
    const source = await upsertSource(tx, normalized.sourceType);
    for (const item of normalized.assets) {
      const siteId = await upsertNameModel(tx, "assetSite", item.site);
      const locationId = await upsertLocation(tx, siteId, item.location);
      const vendorId = await upsertNameModel(tx, "assetVendor", item.vendor);
      const platformId = await upsertNameModel(tx, "assetPlatform", item.platform);
      const roleId = await upsertNameModel(tx, "assetRole", item.role);
      const identity = assetIdentity(item);
      const existing = await tx.asset.findFirst({ where: duplicateWhere(item) });
      const data = {
        name: cleanText(item.name || item.hostname || item.managementIp, "Unnamed asset"),
        hostname: identity.hostname || null,
        managementIp: identity.managementIp || null,
        serial: identity.serial || null,
        externalId: identity.externalId || null,
        managedState: cleanText(item.managedState, "unmanaged") || "unmanaged",
        healthState: cleanText(item.healthState, "unknown") || "unknown",
        lastSeenAt: new Date(),
        siteId,
        locationId,
        vendorId,
        platformId,
        roleId,
        sourceId: source.id,
        tagsJson: toJson(Array.isArray(item.tags) ? item.tags : []),
        metadataJson: toJson({ importedFrom: normalized.sourceType })
      };
      const asset = existing ? await tx.asset.update({ where: { id: existing.id }, data }) : await tx.asset.create({ data });
      if (existing) updated += 1; else created += 1;
      if (identity.managementIp) await tx.assetIpAddress.upsert({ where: { address: identity.managementIp }, update: { assetId: asset.id, role: "management" }, create: { address: identity.managementIp, assetId: asset.id, role: "management" } });
      for (const iface of Array.isArray(item.interfaces) ? item.interfaces : []) {
        const name = cleanText(iface.name);
        if (!name) continue;
        const saved = await tx.assetInterface.upsert({ where: { assetId_name: { assetId: asset.id, name } }, update: { macAddress: cleanText(iface.macAddress) || null }, create: { assetId: asset.id, name, macAddress: cleanText(iface.macAddress) || null } });
        for (const ip of Array.isArray(iface.ips) ? iface.ips : []) {
          if (IPV4_PATTERN.test(ip)) await tx.assetIpAddress.upsert({ where: { address: ip }, update: { assetId: asset.id, interfaceId: saved.id }, create: { address: ip, assetId: asset.id, interfaceId: saved.id } });
        }
      }
    }
    return tx.assetSyncRun.create({
      data: {
        sourceId: source.id,
        sourceType: normalized.sourceType,
        status: "completed",
        idempotencyKey: normalized.idempotencyKey || null,
        previewJson: toJson(preview),
        appliedJson: toJson({ created, updated }),
        completedAt: new Date()
      }
    });
  });
  return { ...preview, applied: { created, updated }, syncRunId: run.id, idempotentReplay: false };
}

export async function listAssets(view: "active" | "archived" | "all" = "active") {
  await syncExistingDevicesToAssets();
  const where = view === "all" ? {} : view === "archived" ? { managedState: "archived" } : { managedState: { not: "archived" } };
  const [assets, total, active, archived, byHealth, byManaged] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: [{ healthState: "asc" }, { name: "asc" }],
      take: 100,
      include: { site: true, vendor: true, platform: true, device: { select: { id: true, name: true, type: true, host: true } }, ipAddresses: { take: 5 } }
    }),
    prisma.asset.count({ where }),
    prisma.asset.count({ where: { managedState: { not: "archived" } } }),
    prisma.asset.count({ where: { managedState: "archived" } }),
    prisma.asset.groupBy({ by: ["healthState"], where, _count: { _all: true } }),
    prisma.asset.groupBy({ by: ["managedState"], _count: { _all: true } })
  ]);
  return { assets, summary: { total, active, archived, view, byHealth, byManaged } };
}

export async function getAsset(id: string) {
  return prisma.asset.findUnique({
    where: { id },
    include: {
      site: true, location: true, role: true, vendor: true, platform: true, source: true,
      device: { select: { id: true, name: true, vendor: true, type: true, host: true, managementPort: true, status: true } },
      interfaces: { include: { ipAddresses: true } },
      ipAddresses: true,
      relationshipsFrom: { include: { toAsset: true } },
      relationshipsTo: { include: { fromAsset: true } },
      findings: { orderBy: { lastSeen: "desc" }, take: 20 },
      actionPlans: { orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
}

export async function getAssetTopology(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: { relationshipsFrom: { include: { toAsset: true } }, relationshipsTo: { include: { fromAsset: true } } } });
  if (!asset) return null;
  return {
    assetId: id,
    nodes: [asset, ...asset.relationshipsFrom.map((item) => item.toAsset), ...asset.relationshipsTo.map((item) => item.fromAsset)].map((item) => ({ id: item.id, name: item.name, healthState: item.healthState })),
    edges: [...asset.relationshipsFrom.map((item) => ({ from: item.fromAssetId, to: item.toAssetId, type: item.type })), ...asset.relationshipsTo.map((item) => ({ from: item.fromAssetId, to: item.toAssetId, type: item.type }))]
  };
}

export async function ensureSeededSecurityRules() {
  for (const definition of VENDOR_DETECTION_RULES) {
    const query = { ruleKey: definition.key, vendor: definition.vendor, category: definition.category, mitreTags: definition.mitreTags, standards: definition.standards, sourceUrl: definition.sourceUrl, implementation: "event_backed", priorityEmail: PRIORITY_EMAIL_RULE_KEYS.has(definition.key) };
    await prisma.detectionRule.upsert({
      where: { ruleType_name: { ruleType: definition.ruleType as DetectionRuleType, name: definition.name } },
      update: { description: definition.description, severity: definition.severity as IncidentSeverity, queryJson: toJson(query), thresholdJson: toJson({ count: definition.threshold, windowMinutes: definition.windowMinutes }) },
      create: { name: definition.name, description: definition.description, ruleType: definition.ruleType as DetectionRuleType, severity: definition.severity as IncidentSeverity, enabled: true, queryJson: toJson(query), thresholdJson: toJson({ count: definition.threshold, windowMinutes: definition.windowMinutes }) }
    });
  }
}

function normalizedLegacyEventType(event: { eventType: string; rawMessage: string | null; action: string | null }) {
  const text = `${event.eventType} ${event.action ?? ""} ${event.rawMessage ?? ""}`.toLowerCase();
  if (/failed password|auth_failure|login failed|denied ssh/.test(text)) return "auth_failure";
  if (/accepted password|login_success_new_source/.test(text)) return "login_success_new_source";
  if (/admin.*created|admin_created/.test(text)) return "admin_created";
  if (/policy.*change|firewall.*change|policy_change/.test(text)) return "policy_change";
  if (/nat.*change|nat_change/.test(text)) return "nat_change";
  if (/management.*enabled|management_service_enabled/.test(text)) return "management_service_enabled";
  if (/interface.*down|interface_down/.test(text)) return "interface_down";
  if (/vpn.*fail|vpn_auth_failure/.test(text)) return "vpn_auth_failure";
  if (/new.*listening|new_listening_port/.test(text)) return "new_listening_port";
  if (/firewall.*disabled|firewall_disabled/.test(text)) return "firewall_disabled";
  if (/critical.*service.*stopped|service.*failed|critical_service_stopped/.test(text)) return "critical_service_stopped";
  if (/daily.*check.*fail|daily_check_failed/.test(text)) return "daily_check_failed";
  return event.eventType;
}

export async function createSecurityEvent(input: SecurityEventInput) {
  const device = input.deviceId ? await prisma.device.findUnique({ where: { id: input.deviceId }, select: { host: true } }) : null;
  const assetId = input.assetId ??
    (input.deviceId ? (await prisma.asset.findUnique({ where: { deviceId: input.deviceId }, select: { id: true } }))?.id : undefined) ??
    (device?.host ? (await prisma.asset.findUnique({ where: { managementIp: device.host }, select: { id: true } }))?.id : undefined);
  return prisma.securityEvent.create({
    data: {
      deviceId: input.deviceId,
      assetId,
      vendor: cleanText(input.vendor, "generic"),
      eventType: cleanText(input.eventType, "security_event"),
      action: cleanText(input.action) || null,
      severity: cleanText(input.severity, "info"),
      srcIp: cleanText(input.srcIp) || null,
      dstIp: cleanText(input.dstIp) || null,
      dstPort: Number.isInteger(input.dstPort) ? input.dstPort : null,
      username: cleanText(input.username) || null,
      rawMessage: cleanText(input.rawMessage).replace(SECRET_KEY_PATTERN, "[REDACTED]") || null,
      normalizedJson: toJson(input.normalizedJson ?? {}),
      timestamp: new Date()
    }
  });
}

async function executeSecurityDetection(input: { deviceId?: string; assetId?: string } = {}) {
  await ensureSeededSecurityRules();
  const rules = await prisma.detectionRule.findMany({ where: { enabled: true } });
  const longestWindowMinutes = rules.reduce((longest, rule) => {
    const threshold = rule.thresholdJson && typeof rule.thresholdJson === "object" ? rule.thresholdJson as Record<string, unknown> : {};
    return Math.max(longest, Number(threshold.windowMinutes) || 15);
  }, 15);
  const cutoff = new Date(Date.now() - Math.min(1440, Math.max(1, longestWindowMinutes)) * 60_000);
  const events = await prisma.securityEvent.findMany({
    where: {
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ...(input.assetId ? { assetId: input.assetId } : {}),
      OR: [{ timestamp: { gte: cutoff } }, { receivedAt: { gte: cutoff } }]
    },
    orderBy: { receivedAt: "desc" },
    take: 5000
  });
  const definitionsByKey = new Map(VENDOR_DETECTION_RULES.map((definition) => [definition.key, definition]));
  const eventsByVendor = new Map<string, typeof events>();
  for (const event of events) {
    const vendor = normalizeDetectionVendor(event.vendor);
    const bucket = eventsByVendor.get(vendor);
    if (bucket) bucket.push(event);
    else eventsByVendor.set(vendor, [event]);
  }
  const deviceIds = [...new Set(events.map((event) => event.deviceId).filter((id): id is string => Boolean(id)))];
  const devices = deviceIds.length ? await prisma.device.findMany({ where: { id: { in: deviceIds } }, select: { id: true, host: true } }) : [];
  const deviceHosts = new Map(devices.map((device) => [device.id, device.host]));
  const managementIps = [...new Set(devices.map((device) => device.host).filter(Boolean))];
  const assets = deviceIds.length ? await prisma.asset.findMany({ where: { OR: [{ deviceId: { in: deviceIds } }, { managementIp: { in: managementIps } }] }, select: { id: true, deviceId: true, managementIp: true } }) : [];
  const assetByDevice = new Map(assets.filter((asset) => asset.deviceId).map((asset) => [asset.deviceId as string, asset.id]));
  const assetByManagementIp = new Map(assets.filter((asset) => asset.managementIp).map((asset) => [asset.managementIp as string, asset.id]));
  let created = 0;
  let updated = 0;
  for (const rule of rules) {
    const query = rule.queryJson && typeof rule.queryJson === "object" ? rule.queryJson as Record<string, unknown> : {};
    const ruleKey = String(query.ruleKey ?? "");
    const definition = definitionsByKey.get(ruleKey);
    const wanted = String(query.eventType ?? "");
    if (!definition && !wanted) continue;
    const thresholdConfig = rule.thresholdJson as Record<string, unknown> | null;
    const threshold = Number(thresholdConfig?.count ?? definition?.threshold ?? query.threshold ?? 1);
    const windowMinutes = Number(thresholdConfig?.windowMinutes ?? definition?.windowMinutes ?? 15);
    const cutoff = Date.now() - Math.max(1, windowMinutes) * 60_000;
    const vendors = Array.isArray(query.vendors) ? query.vendors.map((item) => String(item).toLowerCase()) : [];
    const candidateEvents = definition ? (eventsByVendor.get(definition.vendor) ?? []) : events;
    const matched = candidateEvents.filter((event) => (event.timestamp ?? event.receivedAt).getTime() >= cutoff && (definition ? eventMatchesVendorRule(ruleKey, event) : normalizedLegacyEventType(event) === wanted && (!vendors.length || vendors.includes(String(event.vendor ?? "").toLowerCase()))));
    const subjectFor = (event: (typeof events)[number]) => definition ? groupSubject(definition, event) : event.srcIp ?? event.username ?? String(event.dstPort ?? "device");
    const grouped = new Map<string, typeof matched>();
    for (const event of matched) {
      const key = [event.deviceId ?? "none", event.assetId ?? "none", subjectFor(event)].join("|");
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    for (const rawGroup of grouped.values()) {
      const group = definition ? deduplicateDetectionEvents(definition, rawGroup) : rawGroup;
      if (group.length < threshold || !group[0].deviceId) continue;
      const first = group[0];
      const deviceId = first.deviceId;
      if (!deviceId) continue;
      const assetId = first.assetId ??
        assetByDevice.get(deviceId) ??
        assetByManagementIp.get(deviceHosts.get(deviceId) ?? "");
      const subject = subjectFor(first);
      const fingerprint = `detection:${rule.id}:${deviceId}:${assetId ?? "none"}:${ruleKey || wanted}:${subject}`;
      const existing = await prisma.finding.findUnique({ where: { deviceId_fingerprint: { deviceId, fingerprint } } });
      const existingRefs = new Set(Array.isArray(existing?.rawRefsJson) ? existing.rawRefsJson.map(String) : []);
      const newEvents = group.filter((event) => !existingRefs.has(event.id));
      if (existing && newEvents.length === 0) continue;
      const mergedRefs = Array.from(new Set([...existingRefs, ...group.map((event) => event.id)])).slice(-100);
      const data = {
        deviceId,
        assetId,
        vendor: first.vendor ?? "generic",
        title: rule.name,
        severity: normalizeSeverity(rule.severity),
        category: definition?.category ?? "general-detection",
        status: "active",
        confidence: definition?.key === "fortigate.security-threat" ? 0.98 : definition?.logicalEventFamily === "authentication_failure" ? 0.9 : definition?.ruleType === "deny_drop_spike" ? 0.84 : 0.82,
        summary: `${rule.description} (${group.length} matching events in ${windowMinutes} minutes)`,
        evidenceJson: toJson(group.slice(0, 10).map((event) => ({ id: event.id, message: event.rawMessage, srcIp: event.srcIp, dstPort: event.dstPort }))),
        source: "seeded_detection_rule",
        rawRefsJson: toJson(mergedRefs),
        firstSeen: group.reduce((min, event) => (event.timestamp ?? event.receivedAt) < min ? (event.timestamp ?? event.receivedAt) : min, group[0].timestamp ?? group[0].receivedAt),
        lastSeen: group.reduce((max, event) => (event.timestamp ?? event.receivedAt) > max ? (event.timestamp ?? event.receivedAt) : max, group[0].timestamp ?? group[0].receivedAt),
        count: existing ? existing.count + newEvents.length : group.length,
        mitreTags: definition?.mitreTags ?? [],
        srcIp: first.srcIp,
        dstIp: first.dstIp,
        dstPort: first.dstPort,
        actor: first.username,
        recommendedActions: toJson([{
          intent: definition?.vendor === "fortigate" && first.srcIp ? "fortigate_create_deny_policy" : definition?.vendor === "mikrotik" && first.srcIp ? "mikrotik_block_ip" : definition?.vendor === "linux" && first.srcIp ? "linux_block_ip" : "generic_security_action",
          label: definition?.vendor === "fortigate" ? "Create reviewed FortiGate deny policy" : "Create reviewed ActionPlan"
        }]),
        fingerprint
      };
      let saved;
      if (existing) {
        saved = await prisma.finding.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        saved = await prisma.finding.create({ data });
        created += 1;
      }
      await notifySecurityFinding({ finding: saved, rule, eventIds: existing ? newEvents.map((event) => event.id) : group.map((event) => event.id) });
    }
  }
  return { rulesEvaluated: rules.length, eventsEvaluated: events.length, findingsCreated: created, findingsUpdated: updated };
}

const detectionQueues = new Map<string, Promise<unknown>>();

export function runSecurityDetection(input: { deviceId?: string; assetId?: string } = {}) {
  const key = input.deviceId ? `device:${input.deviceId}` : input.assetId ? `asset:${input.assetId}` : "global";
  const previous = detectionQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => executeSecurityDetection(input));
  detectionQueues.set(key, run);
  void run.finally(() => {
    if (detectionQueues.get(key) === run) detectionQueues.delete(key);
  }).catch(() => undefined);
  return run;
}

export async function listSecurityFindings(filters: { vendor?: string; deviceId?: string; status?: string } = {}) {
  const vendor = cleanText(filters.vendor).toLowerCase();
  const deviceId = cleanText(filters.deviceId);
  const status = cleanText(filters.status);
  return {
    findings: await prisma.finding.findMany({
      where: {
        ...(vendor ? { vendor: { equals: vendor, mode: "insensitive" as const } } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(status ? { status } : {})
      },
      orderBy: [{ severity: "desc" }, { lastSeen: "desc" }],
      take: 100,
      include: { asset: { select: { id: true, name: true, managementIp: true, healthState: true } }, device: { select: { id: true, name: true, vendor: true, host: true } } }
    })
  };
}

export async function createFindingActionPlan(id: string) {
  const finding = await prisma.finding.findUnique({ where: { id }, include: { asset: true, device: true } });
  if (!finding) return null;
  const actions = Array.isArray(finding.recommendedActions) ? finding.recommendedActions as Array<Record<string, unknown>> : [];
  const vendor = normalizeDetectionVendor(finding.vendor || finding.device.vendor);
  const latestEvent = finding.srcIp ? await prisma.securityEvent.findFirst({
    where: { deviceId: finding.deviceId, srcIp: finding.srcIp },
    orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
    select: { interfaceIn: true, interfaceOut: true, dstIp: true, dstPort: true, protocol: true }
  }) : null;
  const sourceIp = finding.srcIp ?? undefined;
  const responseAction = vendor === "linux" && sourceIp
    ? ActionType.linux_block_ip
    : vendor === "mikrotik" && sourceIp
      ? ActionType.mikrotik_block_ip
      : vendor === "fortigate" && sourceIp
        ? ActionType.fortigate_create_deny_policy
        : ActionType.custom_vendor_action;
  const responseParameters: Record<string, unknown> = responseAction === ActionType.linux_block_ip
    ? { ipAddress: sourceIp, durationMinutes: 60 }
    : responseAction === ActionType.mikrotik_block_ip
      ? { sourceIp, address: sourceIp, timeout: "1h", listName: "firewall-log-analyzer-blocked", comment: `finding:${finding.id}` }
      : responseAction === ActionType.fortigate_create_deny_policy
        ? {
            sourceIp,
            ...(latestEvent?.interfaceIn ? { srcintf: latestEvent.interfaceIn } : {}),
            ...(latestEvent?.interfaceOut ? { dstintf: latestEvent.interfaceOut } : {}),
            dstaddr: ["all"],
            services: ["ALL"],
            schedule: "always",
            disabled: false,
            name: `fla-block-${String(sourceIp).replace(/[^A-Za-z0-9]/g, "-")}`.slice(0, 35),
            comment: `Threat response for finding ${finding.id}`
          }
        : {};
  const plan = await proposeActionPlan({
    source: ActionPlanSource.detection,
    requestedBy: `finding:${finding.id}`,
    deviceId: finding.deviceId,
    actionType: responseAction,
    riskLevel: responseAction === ActionType.fortigate_create_deny_policy ? AiRiskLevel.high : finding.severity as AiRiskLevel,
    parametersJson: {
      ...responseParameters,
      findingId: finding.id,
      assetId: finding.assetId,
      assetContext: finding.asset ? { id: finding.asset.id, name: finding.asset.name, managementIp: finding.asset.managementIp, siteId: finding.asset.siteId } : null,
      vendor,
      title: finding.title,
      evidence: finding.evidenceJson,
      recommendedIntent: String(actions[0]?.intent ?? "generic_security_action"),
      executionSupport: responseAction === ActionType.custom_vendor_action ? "manual_or_not_implemented" : "connector",
      responseSourceIp: sourceIp,
      observedTarget: latestEvent,
      requiresExplicitReview: true
    }
  });
  const updated = await prisma.actionPlan.update({ where: { id: plan.id }, data: { assetId: finding.assetId ?? undefined }, include: { device: true, asset: true } });
  return { findingId: finding.id, actionPlan: updated };
}

export function validateRuleDsl(rule: unknown) {
  const body = rule && typeof rule === "object" ? rule as Record<string, unknown> : {};
  const conditions = Array.isArray(body.conditions) ? body.conditions as Record<string, unknown>[] : [];
  if (conditions.length === 0) return { valid: false, errors: ["conditions must be a non-empty array"] };
  const errors: string[] = [];
  for (const condition of conditions.slice(0, 50)) {
    const operator = String(condition.operator ?? "");
    const field = String(condition.field ?? "");
    if (!field || /[^a-zA-Z0-9_.-]/.test(field)) errors.push(`Invalid field: ${field}`);
    if (!SAFE_DSL_OPERATORS.has(operator)) errors.push(`Invalid operator: ${operator}`);
    if (operator === "safe_regex" && String(condition.value ?? "").length > 120) errors.push("safe_regex pattern is too long");
  }
  return { valid: errors.length === 0, errors };
}

export async function removeAssetFromInventory(id: string) {
  const removedAt = new Date();
  const asset = await prisma.asset.findUnique({ where: { id }, include: { device: true } });
  if (!asset) return null;
  const alreadyArchived = asset.managedState === "archived";
  if (!alreadyArchived) {
    await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id },
        data: {
          managedState: "archived",
          healthState: "archived",
          metadataJson: toJson({ ...object(asset.metadataJson), inventoryStatus: "archived", removedAt: removedAt.toISOString(), removedReason: "removed_from_inventory" })
        }
      });
      if (asset.deviceId && asset.device) {
        const capabilities = object(asset.device.capabilities);
        await tx.device.update({
          where: { id: asset.deviceId },
          data: { status: "unknown", capabilities: toJson({ ...capabilities, inventoryStatus: "archived", inventory: { ...object(capabilities.inventory), status: "archived", removedAt: removedAt.toISOString(), reason: "removed_from_inventory" } }) }
        });
        await tx.deviceOnboardingSession.updateMany({ where: { deviceId: asset.deviceId, status: { notIn: ["completed", "cancelled"] } }, data: { status: "cancelled", step: "removed", expiresAt: removedAt } });
      }
      await tx.auditLog.create({
        data: {
          deviceId: asset.deviceId,
          action: "asset.inventory_archived",
          targetType: "asset",
          targetId: id,
          dryRun: false,
          approvalStatus: "not_required",
          metadata: toJson({ assetId: id, deviceId: asset.deviceId, name: asset.name, reason: "removed_from_inventory" })
        }
      });
    });
  }
  return { ok: true, idempotent: alreadyArchived, assetId: id, deviceId: asset.deviceId, inventoryStatus: "archived", visibleInActiveInventory: false, archivedAt: removedAt.toISOString() };
}
