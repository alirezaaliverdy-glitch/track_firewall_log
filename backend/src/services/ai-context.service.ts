import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

const SENSITIVE_PORTS = [22, 23, 445, 3389, 3306, 5432, 6379, 8080, 9200, 5601];

function sinceMinutes(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function safeContextQuery<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch {
    return fallback;
  }
}

export async function buildSecurityContext(input: { recentMinutes?: number } = {}) {
  const recentMinutes = Math.max(5, Math.min(input.recentMinutes ?? 60, 1440));
  const since = sinceMinutes(recentMinutes);

  const [
    recentIncidents,
    incidentSeverityRows,
    incidentStatusRows,
    topSourceIpRows,
    sensitivePortRows,
    recentEventCount,
    recentDetections,
    devices,
    batches,
    actionPlans,
    pendingApprovals,
    linuxTelemetrySnapshots
  ] = await Promise.all([
    safeContextQuery(prisma.incident.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: env.aiMaxContextIncidents,
      include: {
        rule: { select: { name: true, ruleType: true } },
        device: { select: { id: true, name: true, type: true, status: true } },
        source: { select: { id: true, name: true, type: true } }
      }
    }), []),
    safeContextQuery(prisma.incident.groupBy({
      by: ["severity"],
      _count: { _all: true },
      orderBy: { _count: { severity: "desc" } }
    }), []),
    safeContextQuery(prisma.incident.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { _count: { status: "desc" } }
    }), []),
    safeContextQuery(prisma.securityEvent.groupBy({
      by: ["srcIp"],
      where: { receivedAt: { gte: since }, srcIp: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { srcIp: "desc" } },
      take: env.aiMaxContextEvents
    }), []),
    safeContextQuery(prisma.securityEvent.groupBy({
      by: ["dstPort"],
      where: { receivedAt: { gte: since }, dstPort: { in: SENSITIVE_PORTS } },
      _count: { _all: true },
      orderBy: { _count: { dstPort: "desc" } },
      take: env.aiMaxContextEvents
    }), []),
    safeContextQuery(prisma.securityEvent.count({
      where: { receivedAt: { gte: since } }
    }), 0),
    safeContextQuery(prisma.detectionRule.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, ruleType: true, severity: true, enabled: true, updatedAt: true }
    }), []),
    safeContextQuery(prisma.device.findMany({
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        vendor: true,
        type: true,
        host: true,
        managementPort: true,
        protocol: true,
        environment: true,
        status: true,
        tags: true,
        capabilities: true
      }
    }), []),
    safeContextQuery(prisma.eventBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        source: { select: { id: true, name: true, type: true } },
        device: { select: { id: true, name: true, type: true } }
      }
    }), []),
    safeContextQuery(prisma.actionPlan.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        actionType: true,
        status: true,
        riskLevel: true,
        deviceId: true,
        parametersJson: true,
        createdAt: true,
        updatedAt: true
      }
    }), []),
    safeContextQuery(prisma.actionPlan.count({
      where: { status: { in: ["awaiting_approval", "dry_run_ready", "approved"] } }
    }), 0),
    safeContextQuery(prisma.deviceSnapshot.findMany({
      where: { vendor: "linux", snapshotType: "linux_security" },
      orderBy: { collectedAt: "desc" },
      take: 10,
      select: { deviceId: true, collectedAt: true, dataJson: true }
    }), [])
  ]);

  return {
    generatedAt: new Date().toISOString(),
    recentWindowMinutes: recentMinutes,
    safety: {
      aiCanExecute: false,
      aiCanSsh: false,
      aiCanChangeFirewall: false,
      outputMode: "assistant text plus structured intent only"
    },
    incidents: {
      recent: recentIncidents.map((incident) => ({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        eventCount: incident.eventCount,
        firstSeenAt: incident.firstSeenAt,
        lastSeenAt: incident.lastSeenAt,
        ruleType: incident.rule?.ruleType,
        device: incident.device,
        source: incident.source,
        summary: incident.summaryJson
      })),
      countBySeverity: incidentSeverityRows.map((row) => ({ severity: row.severity, count: row._count._all })),
      countByStatus: incidentStatusRows.map((row) => ({ status: row.status, count: row._count._all }))
    },
    events: {
      recentCount: recentEventCount,
      topSourceIps: topSourceIpRows.map((row) => ({ srcIp: row.srcIp, count: row._count._all })),
      sensitivePorts: sensitivePortRows.map((row) => ({ dstPort: row.dstPort, count: row._count._all }))
    },
    detections: {
      recentRules: recentDetections
    },
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      type: device.type,
      host: device.host,
      managementPort: device.managementPort,
      protocol: device.protocol,
      environment: device.environment,
      status: device.status,
      tags: device.tags,
      capabilities: device.capabilities ?? {}
    })),
    eventBatches: batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      totalEvents: batch.totalEvents,
      parsedEvents: batch.parsedEvents,
      failedEvents: batch.failedEvents,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      source: batch.source,
      device: batch.device
    })),
    actionPlans: {
      recent: actionPlans,
      pendingApprovalCount: pendingApprovals
    },
    linuxTelemetry: linuxTelemetrySnapshots.map((record) => {
      const snapshot = record.dataJson && typeof record.dataJson === "object" && !Array.isArray(record.dataJson) ? record.dataJson as Record<string, unknown> : {};
      const host = snapshot.host && typeof snapshot.host === "object" ? snapshot.host as Record<string, unknown> : {};
      const risk = snapshot.riskSummary && typeof snapshot.riskSummary === "object" ? snapshot.riskSummary as Record<string, unknown> : {};
      const network = snapshot.network && typeof snapshot.network === "object" ? snapshot.network as Record<string, unknown> : {};
      const firewall = snapshot.firewall && typeof snapshot.firewall === "object" ? snapshot.firewall as Record<string, unknown> : {};
      const tools = snapshot.securityTools && typeof snapshot.securityTools === "object" ? snapshot.securityTools as Record<string, unknown> : {};
      const ssh = snapshot.ssh && typeof snapshot.ssh === "object" ? snapshot.ssh as Record<string, unknown> : {};
      const findings = Array.isArray(snapshot.findings) ? snapshot.findings.slice(0, 5).map((item) => item && typeof item === "object" ? { id: (item as Record<string, unknown>).id, title: (item as Record<string, unknown>).title, severity: (item as Record<string, unknown>).severity } : {}) : [];
      return { deviceId: record.deviceId, collectedAt: record.collectedAt, hostname: host.hostname, privilegeLevel: snapshot.privilegeLevel, riskScore: risk.score, riskSeverity: risk.severity, topFindings: findings, exposedManagementPorts: network.exposedPorts, recentSuspiciousSignals: ssh.recentFailures, topSuspiciousIps: ssh.failureIps, firewallStatus: firewall.effectiveStatus, fail2banStatus: tools.fail2ban };
    })
  };
}
