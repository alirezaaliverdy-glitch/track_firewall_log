import {
  EventBatchStatus,
  EventSourceStatus,
  EventSourceType,
  type Prisma
} from "@prisma/client";
import type { AnalysisResult, NormalizedLog } from "../analyzer/index.js";
import { prisma } from "../db/prisma.js";

type EventFilters = {
  deviceId?: string;
  vendor?: string;
  action?: string;
  severity?: string;
  srcIp?: string;
  dstIp?: string;
  port?: number;
  protocol?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function toDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function textField(raw: NormalizedLog["raw"], keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return undefined;
}

function eventTimestamp(log: NormalizedLog) {
  const value = log.timestamp ?? [log.date, log.time].filter(Boolean).join(" ");
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferSeverity(log: NormalizedLog) {
  const action = log.action?.toLowerCase() ?? "";
  if (log.isRiskyServiceTraffic && log.trafficDirection === "inbound") return "high";
  if (log.isManagementTraffic && log.trafficDirection === "inbound") return "high";
  if (log.isDatabaseTraffic && log.trafficDirection === "inbound") return "medium";
  if (action.includes("deny") || action.includes("drop") || action.includes("block")) return "low";
  return "info";
}

function eventType(log: NormalizedLog) {
  if (log.isRiskyServiceTraffic) return "risky_service";
  if (log.isManagementTraffic) return "management_access";
  if (log.isDatabaseTraffic) return "database_access";
  return "traffic";
}

function rawMessage(log: NormalizedLog) {
  if (log.message) return log.message;
  const message = textField(log.raw, ["msg", "message", "log", "raw", "event"]);
  if (message) return message;
  return JSON.stringify(log.raw).slice(0, 2000);
}

function eventTags(log: NormalizedLog, result: AnalysisResult) {
  return {
    source: "upload_analysis",
    detectedFormat: result.logProfile.detectedFormat,
    trafficDirection: log.trafficDirection,
    srcIpCategory: log.srcIpCategory,
    dstIpCategory: log.dstIpCategory,
    serviceCategory: log.serviceCategory,
    isManagementTraffic: Boolean(log.isManagementTraffic),
    isDatabaseTraffic: Boolean(log.isDatabaseTraffic),
    isRiskyServiceTraffic: Boolean(log.isRiskyServiceTraffic)
  };
}

function buildWhere(filters: EventFilters): Prisma.SecurityEventWhereInput {
  const where: Prisma.SecurityEventWhereInput = {};

  if (filters.deviceId) where.deviceId = filters.deviceId;
  if (filters.vendor) where.vendor = { equals: filters.vendor, mode: "insensitive" };
  if (filters.action) where.action = { equals: filters.action, mode: "insensitive" };
  if (filters.severity) where.severity = { equals: filters.severity, mode: "insensitive" };
  if (filters.srcIp) where.srcIp = filters.srcIp;
  if (filters.dstIp) where.dstIp = filters.dstIp;
  if (filters.protocol) where.protocol = { equals: filters.protocol, mode: "insensitive" };
  if (filters.port) {
    where.OR = [{ srcPort: filters.port }, { dstPort: filters.port }];
  }
  if (filters.from || filters.to) {
    where.receivedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {})
    };
  }

  return where;
}

function normalizeLimit(value: unknown, fallback = 100) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 500));
}

export function parseEventFilters(query: Record<string, unknown>): EventFilters {
  const port = Number.parseInt(String(query.port ?? ""), 10);
  return {
    deviceId: typeof query.deviceId === "string" ? query.deviceId : undefined,
    vendor: typeof query.vendor === "string" ? query.vendor : undefined,
    action: typeof query.action === "string" ? query.action : undefined,
    severity: typeof query.severity === "string" ? query.severity : undefined,
    srcIp: typeof query.srcIp === "string" ? query.srcIp : undefined,
    dstIp: typeof query.dstIp === "string" ? query.dstIp : undefined,
    protocol: typeof query.protocol === "string" ? query.protocol : undefined,
    port: Number.isInteger(port) ? port : undefined,
    from: typeof query.from === "string" ? toDate(query.from) : undefined,
    to: typeof query.to === "string" ? toDate(query.to) : undefined,
    limit: normalizeLimit(query.limit)
  };
}

export async function storeUploadSecurityEvents(
  tx: Prisma.TransactionClient,
  uploadId: string,
  result: AnalysisResult
) {
  const upload = await tx.upload.findUnique({
    where: { id: uploadId }
  });

  const source = await tx.eventSource.create({
    data: {
      name: upload ? `Upload: ${upload.originalFileName}` : `Upload: ${uploadId}`,
      type: EventSourceType.upload,
      status: EventSourceStatus.active,
      lastSeenAt: new Date()
    }
  });

  const batch = await tx.eventBatch.create({
    data: {
      sourceId: source.id,
      status: EventBatchStatus.processing,
      totalEvents: result.rowCount,
      parsedEvents: 0,
      failedEvents: 0
    }
  });

  const events = result.normalizedLogs.map((log) => ({
    sourceId: source.id,
    batchId: batch.id,
    timestamp: eventTimestamp(log),
    receivedAt: new Date(),
    vendor: log.vendor ?? result.logProfile.effectiveVendor,
    eventType: eventType(log),
    action: log.action,
    severity: inferSeverity(log),
    srcIp: log.srcIp,
    srcPort: log.srcPort,
    dstIp: log.dstIp,
    dstPort: log.dstPort,
    protocol: log.protocol,
    username: log.user,
    ruleName: log.ruleName ?? log.policyName ?? log.ruleDisplayName ?? log.policyId,
    interfaceIn: textField(log.raw, ["interfaceIn", "inInterface", "in-interface", "srcintf", "in_iface"]),
    interfaceOut: textField(log.raw, ["interfaceOut", "outInterface", "out-interface", "dstintf", "out_iface"]),
    rawMessage: rawMessage(log),
    normalizedJson: toJson(log),
    tags: toJson(eventTags(log, result))
  }));

  if (events.length > 0) {
    await tx.securityEvent.createMany({
      data: events
    });
  }

  await tx.eventBatch.update({
    where: { id: batch.id },
    data: {
      status: EventBatchStatus.completed,
      parsedEvents: events.length,
      failedEvents: Math.max(0, result.rowCount - events.length),
      completedAt: new Date()
    }
  });

  return batch.id;
}

export async function listSecurityEvents(filters: EventFilters) {
  const events = await prisma.securityEvent.findMany({
    where: buildWhere(filters),
    orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
    take: filters.limit ?? 100,
    include: {
      device: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, type: true } },
      batch: { select: { id: true, status: true } }
    }
  });

  return { events };
}

export async function getSecurityEvent(id: string) {
  return prisma.securityEvent.findUnique({
    where: { id },
    include: {
      device: { select: { id: true, name: true, type: true, host: true } },
      source: { select: { id: true, name: true, type: true } },
      batch: { select: { id: true, status: true, createdAt: true, completedAt: true } }
    }
  });
}

export async function getSecurityEventsSummary(filters: EventFilters) {
  const where = buildWhere(filters);
  const [total, severityRows, actionRows, sourceIpRows, destinationPortRows, sourceRows, deviceRows] =
    await Promise.all([
      prisma.securityEvent.count({ where }),
      prisma.securityEvent.groupBy({
        by: ["severity"],
        where,
        _count: { _all: true },
        orderBy: { _count: { severity: "desc" } }
      }),
      prisma.securityEvent.groupBy({
        by: ["action"],
        where,
        _count: { _all: true },
        orderBy: { _count: { action: "desc" } },
        take: 10
      }),
      prisma.securityEvent.groupBy({
        by: ["srcIp"],
        where: { ...where, srcIp: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { srcIp: "desc" } },
        take: 10
      }),
      prisma.securityEvent.groupBy({
        by: ["dstPort"],
        where: { ...where, dstPort: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { dstPort: "desc" } },
        take: 10
      }),
      prisma.securityEvent.groupBy({
        by: ["sourceId"],
        where: { ...where, sourceId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { sourceId: "desc" } },
        take: 5
      }),
      prisma.securityEvent.groupBy({
        by: ["deviceId"],
        where: { ...where, deviceId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { deviceId: "desc" } },
        take: 5
      })
    ]);

  const topSourceIps = sourceIpRows.map((row) => ({
    value: row.srcIp ?? "unknown",
    count: row._count._all
  }));
  const topDestinationPorts = destinationPortRows.map((row) => ({
    value: row.dstPort == null ? "unknown" : String(row.dstPort),
    count: row._count._all
  }));
  const topSourceIds = sourceRows.map((row) => ({
    value: row.sourceId ?? "unknown",
    count: row._count._all
  }));
  const topDeviceIds = deviceRows.map((row) => ({
    value: row.deviceId ?? "unknown",
    count: row._count._all
  }));

  const [sources, devices] = await Promise.all([
    prisma.eventSource.findMany({
      where: { id: { in: topSourceIds.map((entry) => entry.value) } },
      select: { id: true, name: true, type: true }
    }),
    prisma.device.findMany({
      where: { id: { in: topDeviceIds.map((entry) => entry.value) } },
      select: { id: true, name: true, type: true }
    })
  ]);

  return {
    totalEvents: total,
    countBySeverity: severityRows.map((row) => ({
      severity: row.severity ?? "unknown",
      count: row._count._all
    })),
    countByAction: actionRows.map((row) => ({
      action: row.action ?? "unknown",
      count: row._count._all
    })),
    topSourceIps,
    topDestinationPorts,
    topSources: topSourceIds.map((entry) => {
      const source = sources.find((item) => item.id === entry.value);
      return {
        id: entry.value,
        name: source?.name ?? "Unknown source",
        type: source?.type ?? "upload",
        count: entry.count
      };
    }),
    topDevices: topDeviceIds.map((entry) => {
      const device = devices.find((item) => item.id === entry.value);
      return {
        id: entry.value,
        name: device?.name ?? "Unknown device",
        type: device?.type ?? "generic_firewall",
        count: entry.count
      };
    })
  };
}

export async function listEventBatches(limit = 25) {
  const batches = await prisma.eventBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
    include: {
      device: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, type: true } }
    }
  });

  return { batches };
}

export async function getEventBatch(id: string) {
  return prisma.eventBatch.findUnique({
    where: { id },
    include: {
      device: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, type: true } },
      securityEvents: {
        orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
        take: 100
      }
    }
  });
}
