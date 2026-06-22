import { IncidentSeverity, IncidentStatus, type SecurityEvent } from "@prisma/client";
import { prisma } from "../db/prisma.js";

function eventTime(event: SecurityEvent) {
  return event.lastSeen ?? event.timestamp ?? event.receivedAt ?? event.createdAt;
}

function minDate(events: SecurityEvent[]) {
  return events.reduce((min, event) => eventTime(event) < min ? eventTime(event) : min, eventTime(events[0]));
}

function maxDate(events: SecurityEvent[]) {
  return events.reduce((max, event) => eventTime(event) > max ? eventTime(event) : max, eventTime(events[0]));
}

async function upsertPatternIncident(input: {
  title: string;
  description: string;
  severity: IncidentSeverity;
  deviceId?: string | null;
  srcIp?: string | null;
  events: SecurityEvent[];
  pattern: string;
  recommendedActions: string[];
}) {
  if (input.events.length === 0) return "skipped" as const;
  const firstSeenAt = minDate(input.events);
  const lastSeenAt = maxDate(input.events);
  const existing = await prisma.incident.findFirst({
    where: {
      status: { in: [IncidentStatus.open, IncidentStatus.investigating] },
      deviceId: input.deviceId ?? null,
      summaryJson: {
        path: ["patternKey"],
        equals: `${input.pattern}:${input.srcIp ?? "unknown"}`
      }
    }
  });

  const summaryJson = {
    pattern: input.pattern,
    patternKey: `${input.pattern}:${input.srcIp ?? "unknown"}`,
    srcIp: input.srcIp,
    matchedEventIds: input.events.slice(0, 50).map((event) => event.id),
    recommendedActions: input.recommendedActions
  };

  const incident = existing
    ? await prisma.incident.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          description: input.description,
          severity: input.severity,
          firstSeenAt: existing.firstSeenAt < firstSeenAt ? existing.firstSeenAt : firstSeenAt,
          lastSeenAt: existing.lastSeenAt > lastSeenAt ? existing.lastSeenAt : lastSeenAt,
          summaryJson
        }
      })
    : await prisma.incident.create({
        data: {
          title: input.title,
          description: input.description,
          severity: input.severity,
          status: IncidentStatus.open,
          deviceId: input.deviceId ?? undefined,
          firstSeenAt,
          lastSeenAt,
          eventCount: 0,
          summaryJson
        }
      });

  await prisma.incidentEvent.createMany({
    data: input.events.map((event) => ({ incidentId: incident.id, securityEventId: event.id })),
    skipDuplicates: true
  });
  const eventCount = await prisma.incidentEvent.count({ where: { incidentId: incident.id } });
  await prisma.incident.update({ where: { id: incident.id }, data: { eventCount } });
  return existing ? "updated" as const : "created" as const;
}

export async function buildIncidentsFromRecentEvents(input: { deviceId?: string; timeWindowMinutes?: number } = {}) {
  const since = new Date(Date.now() - (input.timeWindowMinutes ?? 10) * 60 * 1000);
  const events = await prisma.securityEvent.findMany({
    where: {
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      lastSeen: { gte: since },
      sourceType: { in: ["linux_ssh", "linux_ufw", "linux_kernel"] }
    },
    orderBy: [{ lastSeen: "asc" }, { receivedAt: "asc" }]
  });

  let incidentsCreated = 0;
  let incidentsUpdated = 0;
  const bump = (result: "created" | "updated" | "skipped") => {
    if (result === "created") incidentsCreated += 1;
    if (result === "updated") incidentsUpdated += 1;
  };

  const bySrc = new Map<string, SecurityEvent[]>();
  for (const event of events.filter((event) => event.srcIp)) {
    const key = [event.deviceId ?? "", event.srcIp].join("|");
    bySrc.set(key, [...(bySrc.get(key) ?? []), event]);
  }

  for (const grouped of bySrc.values()) {
    const failures = grouped.filter((event) => event.action === "auth_failed");
    const failureCount = failures.reduce((sum, event) => sum + (event.count ?? 1), 0);
    if (failureCount >= 10) {
      bump(await upsertPatternIncident({
        title: `SSH brute force from ${grouped[0].srcIp}`,
        description: `${failureCount} SSH authentication failures were observed within the detection window.`,
        severity: failureCount >= 25 ? IncidentSeverity.high : IncidentSeverity.medium,
        deviceId: grouped[0].deviceId,
        srcIp: grouped[0].srcIp,
        events: failures,
        pattern: "ssh_brute_force",
        recommendedActions: ["block_source_ip_temporary", "review_auth_logs", "enforce_key_authentication"]
      }));
    }

    const rootFailures = failures.filter((event) => String(event.username ?? "").toLowerCase() === "root" || String(event.rawSnippet ?? event.rawMessage ?? "").toLowerCase().includes("invalid user root"));
    if (rootFailures.length > 0) {
      bump(await upsertPatternIncident({
        title: `Suspicious root login attempts from ${grouped[0].srcIp}`,
        description: "Root or invalid root SSH authentication failures were observed from a remote source.",
        severity: IncidentSeverity.high,
        deviceId: grouped[0].deviceId,
        srcIp: grouped[0].srcIp,
        events: rootFailures,
        pattern: "root_auth_failed",
        recommendedActions: ["block_source_ip_temporary", "review_auth_logs", "enforce_key_authentication"]
      }));
    }

    const successes = grouped.filter((event) => event.action === "auth_success");
    if (failures.length > 0 && successes.length > 0) {
      bump(await upsertPatternIncident({
        title: `Successful login after failures from ${grouped[0].srcIp}`,
        description: "A successful SSH login followed repeated authentication failures from the same source.",
        severity: IncidentSeverity.high,
        deviceId: grouped[0].deviceId,
        srcIp: grouped[0].srcIp,
        events: [...failures, ...successes],
        pattern: "success_after_failures",
        recommendedActions: ["review_auth_logs", "enforce_key_authentication"]
      }));
    }

    const ufwBlocks = grouped.filter((event) => event.action === "port_blocked");
    const blockCount = ufwBlocks.reduce((sum, event) => sum + (event.count ?? 1), 0);
    if (blockCount >= 20) {
      bump(await upsertPatternIncident({
        title: `UFW blocked traffic spike from ${grouped[0].srcIp}`,
        description: `${blockCount} UFW blocked events were observed from the same source.`,
        severity: IncidentSeverity.medium,
        deviceId: grouped[0].deviceId,
        srcIp: grouped[0].srcIp,
        events: ufwBlocks,
        pattern: "ufw_block_spike",
        recommendedActions: ["block_source_ip_temporary", "review_auth_logs"]
      }));
    }
  }

  return { incidentsCreated, incidentsUpdated, evaluatedEvents: events.length };
}
