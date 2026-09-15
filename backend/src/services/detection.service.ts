import {
  DetectionRuleType,
  IncidentSeverity,
  IncidentStatus,
  type DetectionRule,
  type Prisma,
  type SecurityEvent
} from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { buildIncidentsFromRecentEvents } from "./incident-builder.service.js";

type DetectionRunInput = {
  batchId?: string;
  deviceId?: string;
  sourceId?: string;
  timeWindowMinutes?: number;
};

type DetectionMatch = {
  rule: DetectionRule;
  title: string;
  description: string;
  severity: IncidentSeverity;
  events: SecurityEvent[];
  summary: Record<string, unknown>;
  duplicateKey: {
    ruleType: DetectionRuleType;
    srcIp?: string;
    dstIp?: string;
    dstPort?: number;
    deviceId?: string;
    sourceId?: string;
    bucket: string;
  };
};

const DENY_ACTIONS = new Set(["deny", "denied", "drop", "dropped", "reject", "rejected", "block", "blocked"]);
const ALLOW_ACTIONS = new Set(["allow", "allowed", "accept", "accepted"]);
const SENSITIVE_PORTS = new Set([22, 23, 445, 3389, 3306, 5432, 6379, 8080, 9200, 5601]);

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function normalizeAction(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function eventTime(event: SecurityEvent) {
  return event.timestamp ?? event.receivedAt ?? event.createdAt;
}

function minDate(events: SecurityEvent[]) {
  return events.reduce((min, event) => eventTime(event) < min ? eventTime(event) : min, eventTime(events[0]));
}

function maxDate(events: SecurityEvent[]) {
  return events.reduce((max, event) => eventTime(event) > max ? eventTime(event) : max, eventTime(events[0]));
}

function scopedWhere(input: DetectionRunInput): Prisma.SecurityEventWhereInput {
  const minutes = Number.isFinite(input.timeWindowMinutes) && input.timeWindowMinutes
    ? Math.max(1, Math.min(input.timeWindowMinutes, 1440))
    : 15;
  const since = new Date(Date.now() - minutes * 60 * 1000);

  return {
    ...(input.batchId ? { batchId: input.batchId } : { receivedAt: { gte: since } }),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {})
  };
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function firstDefined<T>(items: T[]) {
  return items.find((item) => item !== undefined && item !== null);
}

function timeBucket(date: Date, minutes: number) {
  const bucketMs = minutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
}

function defaultRules() {
  return [
    {
      name: "Port Scan",
      description: "Same source IP reaches many unique destination ports in a short window.",
      enabled: true,
      severity: IncidentSeverity.medium,
      ruleType: DetectionRuleType.port_scan,
      queryJson: toJson({ groupBy: ["srcIp"], unique: "dstPort" }),
      thresholdJson: toJson({ uniqueDstPorts: 10, windowMinutes: 15 })
    },
    {
      name: "SSH Brute Force",
      description: "Repeated denied SSH attempts from the same source IP.",
      enabled: true,
      severity: IncidentSeverity.high,
      ruleType: DetectionRuleType.ssh_bruteforce,
      queryJson: toJson({ actions: Array.from(DENY_ACTIONS), dstPorts: [22, 22022], groupBy: ["srcIp"] }),
      thresholdJson: toJson({ count: 5, windowMinutes: 15 })
    },
    {
      name: "Sensitive Port Exposure",
      description: "Allowed traffic to sensitive management, database, or service ports.",
      enabled: true,
      severity: IncidentSeverity.high,
      ruleType: DetectionRuleType.sensitive_port_exposure,
      queryJson: toJson({ actions: Array.from(ALLOW_ACTIONS), dstPorts: Array.from(SENSITIVE_PORTS) }),
      thresholdJson: toJson({ count: 1 })
    },
    {
      name: "Deny/Drop Spike",
      description: "High volume of denied or dropped traffic from the same source IP.",
      enabled: true,
      severity: IncidentSeverity.medium,
      ruleType: DetectionRuleType.deny_drop_spike,
      queryJson: toJson({ actions: Array.from(DENY_ACTIONS), groupBy: ["srcIp"] }),
      thresholdJson: toJson({ count: 20, windowMinutes: 15 })
    }
  ];
}

export async function ensureDefaultDetectionRules() {
  const count = await prisma.detectionRule.count();
  if (count > 0) return;

  await prisma.detectionRule.createMany({
    data: defaultRules()
  });
}

export async function listDetectionRules() {
  await ensureDefaultDetectionRules();
  return {
    rules: await prisma.detectionRule.findMany({
      orderBy: [{ enabled: "desc" }, { ruleType: "asc" }]
    })
  };
}

export async function updateDetectionRule(id: string, input: Record<string, unknown>) {
  const data: Prisma.DetectionRuleUpdateInput = {};
  if (typeof input.name === "string" && input.name.trim()) data.name = input.name.trim();
  if (typeof input.description === "string") data.description = input.description.trim();
  if (typeof input.enabled === "boolean") data.enabled = input.enabled;
  if (typeof input.severity === "string" && input.severity in IncidentSeverity) {
    data.severity = input.severity as IncidentSeverity;
  }
  if (input.queryJson !== undefined) data.queryJson = toJson(input.queryJson);
  if (input.thresholdJson !== undefined) data.thresholdJson = toJson(input.thresholdJson);

  return prisma.detectionRule.update({
    where: { id },
    data
  });
}

async function fetchScopedEvents(input: DetectionRunInput) {
  return prisma.securityEvent.findMany({
    where: scopedWhere(input),
    orderBy: [{ timestamp: "asc" }, { receivedAt: "asc" }],
    take: 10000
  });
}

function detectPortScan(rule: DetectionRule, events: SecurityEvent[], bucket: string): DetectionMatch[] {
  const matches: DetectionMatch[] = [];
  const groups = groupBy(events.filter((event) => event.srcIp && event.dstPort), (event) =>
    [event.srcIp, event.deviceId ?? "", event.sourceId ?? ""].join("|")
  );

  for (const groupedEvents of groups.values()) {
    const uniquePorts = new Set(groupedEvents.map((event) => event.dstPort).filter((port): port is number => port !== null));
    if (uniquePorts.size < 10) continue;

    const srcIp = groupedEvents[0].srcIp ?? undefined;
    const deviceId = groupedEvents[0].deviceId ?? undefined;
    const sourceId = groupedEvents[0].sourceId ?? undefined;
    const severity = uniquePorts.size >= 20 ? IncidentSeverity.high : rule.severity;
    matches.push({
      rule,
      title: `Possible port scan from ${srcIp}`,
      description: `${srcIp} reached ${uniquePorts.size} unique destination ports.`,
      severity,
      events: groupedEvents,
      summary: {
        ruleType: rule.ruleType,
        srcIp,
        uniqueDstPorts: uniquePorts.size,
        dstPorts: Array.from(uniquePorts).sort((a, b) => a - b),
        bucket
      },
      duplicateKey: { ruleType: rule.ruleType, srcIp, deviceId, sourceId, bucket }
    });
  }

  return matches;
}

function detectSshBruteforce(rule: DetectionRule, events: SecurityEvent[], bucket: string): DetectionMatch[] {
  const sshDenied = events.filter((event) =>
    DENY_ACTIONS.has(normalizeAction(event.action)) && (event.dstPort === 22 || event.dstPort === 22022) && event.srcIp
  );
  const groups = groupBy(sshDenied, (event) =>
    [event.srcIp, event.dstIp ?? "", event.dstPort ?? "", event.deviceId ?? "", event.sourceId ?? ""].join("|")
  );

  return Array.from(groups.values())
    .filter((groupedEvents) => groupedEvents.length >= 5)
    .map((groupedEvents) => {
      const first = groupedEvents[0];
      return {
        rule,
        title: `Possible SSH brute force from ${first.srcIp}`,
        description: `${groupedEvents.length} denied SSH attempts were observed from ${first.srcIp}.`,
        severity: rule.severity,
        events: groupedEvents,
        summary: {
          ruleType: rule.ruleType,
          srcIp: first.srcIp,
          dstIp: first.dstIp,
          dstPort: first.dstPort,
          attempts: groupedEvents.length,
          bucket
        },
        duplicateKey: {
          ruleType: rule.ruleType,
          srcIp: first.srcIp ?? undefined,
          dstIp: first.dstIp ?? undefined,
          dstPort: first.dstPort ?? undefined,
          deviceId: first.deviceId ?? undefined,
          sourceId: first.sourceId ?? undefined,
          bucket
        }
      };
    });
}

function detectSensitivePortExposure(rule: DetectionRule, events: SecurityEvent[], bucket: string): DetectionMatch[] {
  return events
    .filter((event) => ALLOW_ACTIONS.has(normalizeAction(event.action)) && event.dstPort !== null && SENSITIVE_PORTS.has(event.dstPort))
    .map((event) => ({
      rule,
      title: `Sensitive port ${event.dstPort} allowed`,
      description: `Allowed traffic to sensitive destination port ${event.dstPort} was observed.`,
      severity: event.dstPort === 23 || event.dstPort === 3389 || event.dstPort === 445 ? IncidentSeverity.high : rule.severity,
      events: [event],
      summary: {
        ruleType: rule.ruleType,
        srcIp: event.srcIp,
        dstIp: event.dstIp,
        dstPort: event.dstPort,
        action: event.action,
        bucket
      },
      duplicateKey: {
        ruleType: rule.ruleType,
        srcIp: event.srcIp ?? undefined,
        dstIp: event.dstIp ?? undefined,
        dstPort: event.dstPort ?? undefined,
        deviceId: event.deviceId ?? undefined,
        sourceId: event.sourceId ?? undefined,
        bucket
      }
    }));
}

function detectDenyDropSpike(rule: DetectionRule, events: SecurityEvent[], bucket: string): DetectionMatch[] {
  const denied = events.filter((event) => DENY_ACTIONS.has(normalizeAction(event.action)) && event.srcIp);
  const groups = groupBy(denied, (event) => [event.srcIp, event.deviceId ?? "", event.sourceId ?? ""].join("|"));

  return Array.from(groups.values())
    .filter((groupedEvents) => groupedEvents.length >= 20)
    .map((groupedEvents) => {
      const first = groupedEvents[0];
      return {
        rule,
        title: `Deny/drop spike from ${first.srcIp}`,
        description: `${groupedEvents.length} denied or dropped events were observed from ${first.srcIp}.`,
        severity: rule.severity,
        events: groupedEvents,
        summary: {
          ruleType: rule.ruleType,
          srcIp: first.srcIp,
          deniedEvents: groupedEvents.length,
          bucket
        },
        duplicateKey: {
          ruleType: rule.ruleType,
          srcIp: first.srcIp ?? undefined,
          deviceId: first.deviceId ?? undefined,
          sourceId: first.sourceId ?? undefined,
          bucket
        }
      };
    });
}

function keysMatch(left: DetectionMatch["duplicateKey"], right: Record<string, unknown>) {
  return left.ruleType === right.ruleType &&
    (left.srcIp ?? null) === (right.srcIp ?? null) &&
    (left.dstIp ?? null) === (right.dstIp ?? null) &&
    (left.dstPort ?? null) === (right.dstPort ?? null) &&
    (left.deviceId ?? null) === (right.deviceId ?? null) &&
    (left.sourceId ?? null) === (right.sourceId ?? null) &&
    left.bucket === right.bucket;
}

async function upsertIncident(match: DetectionMatch) {
  const firstSeenAt = minDate(match.events);
  const lastSeenAt = maxDate(match.events);
  const deviceId = firstDefined(match.events.map((event) => event.deviceId)) ?? undefined;
  const sourceId = firstDefined(match.events.map((event) => event.sourceId)) ?? undefined;

  const openCandidates = await prisma.incident.findMany({
    where: {
      ruleId: match.rule.id,
      status: { in: [IncidentStatus.open, IncidentStatus.investigating] },
      deviceId: deviceId ?? null,
      sourceId: sourceId ?? null
    }
  });

  const existing = openCandidates.find((incident) => {
    const summary = incident.summaryJson && typeof incident.summaryJson === "object"
      ? incident.summaryJson as Record<string, unknown>
      : {};
    const duplicateKey = summary.duplicateKey && typeof summary.duplicateKey === "object"
      ? summary.duplicateKey as Record<string, unknown>
      : {};
    return keysMatch(match.duplicateKey, duplicateKey);
  });

  const summaryJson = toJson({
    ...match.summary,
    duplicateKey: match.duplicateKey,
    matchedEventIds: match.events.slice(0, 50).map((event) => event.id)
  });

  const incident = existing
    ? await prisma.incident.update({
        where: { id: existing.id },
        data: {
          title: match.title,
          description: match.description,
          severity: match.severity,
          firstSeenAt: existing.firstSeenAt < firstSeenAt ? existing.firstSeenAt : firstSeenAt,
          lastSeenAt: existing.lastSeenAt > lastSeenAt ? existing.lastSeenAt : lastSeenAt,
          summaryJson
        }
      })
    : await prisma.incident.create({
        data: {
          title: match.title,
          description: match.description,
          severity: match.severity,
          status: IncidentStatus.open,
          deviceId,
          sourceId,
          ruleId: match.rule.id,
          firstSeenAt,
          lastSeenAt,
          eventCount: 0,
          summaryJson
        }
      });

  await prisma.incidentEvent.createMany({
    data: match.events.map((event) => ({
      incidentId: incident.id,
      securityEventId: event.id
    })),
    skipDuplicates: true
  });

  const eventCount = await prisma.incidentEvent.count({
    where: { incidentId: incident.id }
  });

  await prisma.incident.update({
    where: { id: incident.id },
    data: { eventCount }
  });

  return existing ? "updated" as const : "created" as const;
}

export async function runDetections(input: DetectionRunInput) {
  await ensureDefaultDetectionRules();

  const [rules, events] = await Promise.all([
    prisma.detectionRule.findMany({
      where: { enabled: true },
      orderBy: { ruleType: "asc" }
    }),
    fetchScopedEvents(input)
  ]);

  const windowMinutes = input.batchId ? 15 : Math.max(1, Math.min(input.timeWindowMinutes ?? 15, 1440));
  const bucket = input.batchId ? `batch:${input.batchId}` : timeBucket(new Date(), windowMinutes);
  const matches: DetectionMatch[] = [];

  for (const rule of rules) {
    if (rule.ruleType === DetectionRuleType.port_scan) matches.push(...detectPortScan(rule, events, bucket));
    if (rule.ruleType === DetectionRuleType.ssh_bruteforce) matches.push(...detectSshBruteforce(rule, events, bucket));
    if (rule.ruleType === DetectionRuleType.sensitive_port_exposure) matches.push(...detectSensitivePortExposure(rule, events, bucket));
    if (rule.ruleType === DetectionRuleType.deny_drop_spike) matches.push(...detectDenyDropSpike(rule, events, bucket));
    // suspicious_outbound is intentionally a placeholder to avoid noisy incidents.
  }

  let incidentsCreated = 0;
  let incidentsUpdated = 0;

  for (const match of matches) {
    const result = await upsertIncident(match);
    if (result === "created") incidentsCreated += 1;
    else incidentsUpdated += 1;
  }

  const linuxIncidents = await buildIncidentsFromRecentEvents({
    deviceId: input.deviceId,
    timeWindowMinutes: windowMinutes
  });

  return {
    rulesEvaluated: rules.length,
    incidentsCreated: incidentsCreated + linuxIncidents.incidentsCreated,
    incidentsUpdated: incidentsUpdated + linuxIncidents.incidentsUpdated,
    matchedEvents: new Set(matches.flatMap((match) => match.events.map((event) => event.id))).size
  };
}
