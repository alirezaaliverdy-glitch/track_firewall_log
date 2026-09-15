import {
  DetectionRuleType,
  IncidentSeverity,
  IncidentStatus,
  type Prisma
} from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type IncidentFilters = {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  deviceId?: string;
  sourceId?: string;
  ruleType?: DetectionRuleType;
  from?: Date;
  to?: Date;
  limit?: number;
};

function toDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeLimit(value: unknown, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 200));
}

export function parseIncidentFilters(query: Record<string, unknown>): IncidentFilters {
  const status = typeof query.status === "string" && query.status in IncidentStatus
    ? query.status as IncidentStatus
    : undefined;
  const severity = typeof query.severity === "string" && query.severity in IncidentSeverity
    ? query.severity as IncidentSeverity
    : undefined;
  const ruleType = typeof query.ruleType === "string" && query.ruleType in DetectionRuleType
    ? query.ruleType as DetectionRuleType
    : undefined;

  return {
    status,
    severity,
    ruleType,
    deviceId: typeof query.deviceId === "string" ? query.deviceId : undefined,
    sourceId: typeof query.sourceId === "string" ? query.sourceId : undefined,
    from: typeof query.from === "string" ? toDate(query.from) : undefined,
    to: typeof query.to === "string" ? toDate(query.to) : undefined,
    limit: normalizeLimit(query.limit)
  };
}

function buildWhere(filters: IncidentFilters): Prisma.IncidentWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.ruleType ? { rule: { ruleType: filters.ruleType } } : {}),
    ...(filters.from || filters.to
      ? {
          lastSeenAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {})
          }
        }
      : {})
  };
}

export async function listIncidents(filters: IncidentFilters) {
  const incidents = await prisma.incident.findMany({
    where: buildWhere(filters),
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    take: filters.limit ?? 50,
    include: {
      device: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, type: true } },
      rule: { select: { id: true, name: true, ruleType: true } }
    }
  });

  return { incidents };
}

export async function getIncident(id: string) {
  return prisma.incident.findUnique({
    where: { id },
    include: {
      device: { select: { id: true, name: true, type: true, host: true } },
      source: { select: { id: true, name: true, type: true } },
      rule: { select: { id: true, name: true, ruleType: true, severity: true } }
    }
  });
}

export async function getIncidentEvents(id: string) {
  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!incident) return null;

  const events = await prisma.incidentEvent.findMany({
    where: { incidentId: id },
    orderBy: { createdAt: "asc" },
    include: {
      securityEvent: {
        include: {
          device: { select: { id: true, name: true, type: true } },
          source: { select: { id: true, name: true, type: true } },
          batch: { select: { id: true, status: true } }
        }
      }
    }
  });

  return {
    incidentId: id,
    events: events.map((entry) => entry.securityEvent)
  };
}

export async function updateIncidentStatus(id: string, status: IncidentStatus) {
  return prisma.incident.update({
    where: { id },
    data: { status },
    include: {
      device: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, type: true } },
      rule: { select: { id: true, name: true, ruleType: true } }
    }
  });
}
