import { prisma } from "../db/prisma.js";
import { selectCollector, isCurrentCollectorState } from "../collectors/collector-registry.service.js";
import { monitoringCoverage } from "./monitoring-coverage.js";
import { accountMonitoringSchedule, effectiveCollectorIntervalSeconds } from "../services/security-monitor-schedule.js";
import { projectFleetResources } from "../services/fleet-health-projection.js";
import { matchesDeviceMetricSource } from "../services/device-metric-source.js";
import { RESOURCE_KEYS } from "../services/resource-issues.js";

/** Read-only, owner-scoped operational view. No collection, credentials or device commands in GET. */
export async function monitoringOperations(ownerId: string, page: number) {
  const where = { deletedAt: null, company: { ownerId, deletedAt: null } };
  const [total, devices] = await Promise.all([prisma.device.count({ where }), prisma.device.findMany({ where, orderBy: { id: "asc" }, skip: page * 12, take: 12 })]);
  const ids = devices.map(device => device.id), now = new Date();
  const [collectors, findings, metrics] = await Promise.all([
    prisma.eventCollectorState.findMany({ where: { deviceId: { in: ids } } }),
    prisma.finding.findMany({ where: { deviceId: { in: ids }, status: { in: ["active", "acknowledged", "investigating"] } }, orderBy: { lastSeen: "desc" }, take: 240, select: { id: true, deviceId: true, title: true, severity: true, category: true, lastSeen: true } }),
    Promise.all(ids.map(deviceId => prisma.metricSample.findMany({ where: { deviceId, metricKey: { in: RESOURCE_KEYS }, timestamp: { gte: new Date(now.getTime()-300_000) } }, orderBy: { timestamp: "desc" }, take: 128, select: { deviceId: true, metricKey: true, value: true, unit: true, timestamp: true, source: true, labelsJson: true } })))
  ]);
  const current = collectors.filter(state => isCurrentCollectorState(devices.find(device=>device.id===state.deviceId) ?? null, state.sourceType));
  const coverage = monitoringCoverage(devices.map(device=>({...device,liveCollectorSupported:Boolean(selectCollector(device))})),current.map(state=>({...state,effectiveIntervalSeconds:effectiveCollectorIntervalSeconds(accountMonitoringSchedule(state,state.sourceType))})),now);
  return { total, page, pageSize: 12, generatedAt: now.toISOString(), resourceIntervalSeconds: 120, refreshSeconds: 10,
    devices: devices.map((device,index)=>({ id: device.id, name: device.name, host: device.host, vendor: device.vendor, status: device.status,
      coverage: coverage.devices.find(row=>row.deviceId===device.id), resources: projectFleetResources(metrics[index].filter(sample=>matchesDeviceMetricSource(device.vendor,sample.source))),
      issues: findings.filter(finding=>finding.deviceId===device.id).slice(0,5), issuesMayBeTruncated: findings.length===240 || findings.filter(finding=>finding.deviceId===device.id).length>5
    })) };
}
