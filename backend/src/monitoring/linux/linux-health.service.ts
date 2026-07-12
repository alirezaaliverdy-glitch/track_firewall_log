import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { collectLinuxServerOverview, parseLinuxServerOverview } from "../../telemetry/linux/linux-telemetry.service.js";
import { parseLinuxHealthOutput } from "./linux-health.parser.js";
import { scoreLinuxHealth } from "./linux-health-score.js";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stateFromOverview(status: string) { return status === "healthy" ? "healthy" : status === "critical" ? "critical" : status === "warning" ? "warning" : "unknown"; }

function isMigrationPendingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /MetricSample|HealthSnapshot|CollectionRun|metric_samples|health_snapshots|collection_runs|does not exist|no such table|relation/i.test(message);
}

export function metricsFromOverview(overview: ReturnType<typeof parseLinuxServerOverview>) {
  const metrics = [] as Array<{ metricKey: string; value: number; unit?: string; labels?: Record<string, unknown> }>;
  if (overview.cpu.usagePercent !== null) metrics.push({ metricKey: "cpu.usage_percent", value: overview.cpu.usagePercent, unit: "percent" });
  const [l1, l5, l15] = overview.cpu.loadAverage;
  if (l1 !== undefined) metrics.push({ metricKey: "cpu.load_1m", value: l1, unit: "load" });
  if (l5 !== undefined) metrics.push({ metricKey: "cpu.load_5m", value: l5, unit: "load" });
  if (l15 !== undefined) metrics.push({ metricKey: "cpu.load_15m", value: l15, unit: "load" });
  if (overview.memory.usedPercent !== null) metrics.push({ metricKey: "memory.usage_percent", value: overview.memory.usedPercent, unit: "percent" });
  if (overview.memory.swapUsedPercent !== null) metrics.push({ metricKey: "swap.usage_percent", value: overview.memory.swapUsedPercent, unit: "percent" });
  const rootDisk = overview.disks[0];
  if (rootDisk?.usedPercent !== null && rootDisk?.usedPercent !== undefined) metrics.push({ metricKey: "disk.usage_percent", value: rootDisk.usedPercent, unit: "percent", labels: { mount: rootDisk.mount } });
  metrics.push({ metricKey: "services.failed_count", value: overview.services.filter((service) => service.state === "failed").length, unit: "count" });
  metrics.push({ metricKey: "ports.listening_count", value: overview.listeningPorts.length, unit: "count" });
  metrics.push({ metricKey: "firewall.enabled", value: overview.services.some((service) => ["ufw", "firewalld"].includes(service.name) && service.state === "active") ? 1 : 0, unit: "boolean" });
  metrics.push({ metricKey: "processes.count", value: overview.topProcesses.length, unit: "count" });
  return metrics;
}

async function listLinuxDevicesWithoutHealth() {
  const devices = await prisma.device.findMany({ where: { OR: [{ vendor: { contains: "linux", mode: "insensitive" } }, { type: "linux_edge" }] }, include: { asset: true }, orderBy: { updatedAt: "desc" } });
  return devices.map((device) => ({ id: device.id, name: device.name, host: device.host, asset: device.asset, status: device.status, latestHealth: null }));
}

export async function listLinuxMonitoringDevices() {
  try {
    const devices = await prisma.device.findMany({ where: { OR: [{ vendor: { contains: "linux", mode: "insensitive" } }, { type: "linux_edge" }] }, include: { asset: true, healthSnapshots: { orderBy: { collectedAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
    return devices.map((device) => ({ id: device.id, name: device.name, host: device.host, asset: device.asset, status: device.status, latestHealth: device.healthSnapshots[0] ?? null }));
  } catch (error) {
    if (isMigrationPendingError(error)) return listLinuxDevicesWithoutHealth();
    throw error;
  }
}

export async function getLinuxMonitoringSummary() {
  const devices = await listLinuxMonitoringDevices();
  const counts = devices.reduce<Record<string, number>>((acc, device) => { const key = device.latestHealth?.state ?? "unknown"; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  return { total: devices.length, healthy: counts.healthy ?? 0, warning: counts.warning ?? 0, critical: counts.critical ?? 0, offline: counts.offline ?? 0, stale: counts.stale ?? 0, unknown: counts.unknown ?? 0, devices: devices.slice(0, 5) };
}

export async function getLinuxMonitoringDevice(deviceId: string) {
  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { asset: true, healthSnapshots: { orderBy: { collectedAt: "desc" }, take: 1 } } });
    if (!device) return null;
    return { device, latestHealth: device.healthSnapshots[0] ?? null };
  } catch (error) {
    if (!isMigrationPendingError(error)) throw error;
    const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { asset: true } });
    return device ? { device, latestHealth: null } : null;
  }
}

export async function getLinuxMetrics(deviceId: string, hours = 24) {
  const since = new Date(Date.now() - Math.max(1, Math.min(720, hours)) * 60 * 60 * 1000);
  try {
    return await prisma.metricSample.findMany({ where: { deviceId, timestamp: { gte: since } }, orderBy: { timestamp: "desc" }, take: 1000 });
  } catch (error) {
    if (isMigrationPendingError(error)) return [];
    throw error;
  }
}

export async function refreshLinuxHealth(deviceId: string) {
  const started = Date.now();
  const run = await prisma.collectionRun.create({ data: { deviceId, provider: "linux-ssh", status: "running" } });
  try {
    const overview = await collectLinuxServerOverview(deviceId);
    const metrics = metricsFromOverview(overview);
    const score = scoreLinuxHealth(metrics, overview.warnings);
    await prisma.metricSample.createMany({ data: metrics.map((metric) => ({ deviceId, metricKey: metric.metricKey, value: metric.value, unit: metric.unit, source: "linux-ssh", labelsJson: json(metric.labels ?? {}), collectionRunId: run.id })) });
    const snapshot = await prisma.healthSnapshot.create({ data: { deviceId, score: score.score, state: stateFromOverview(overview.health.status), summary: overview.health.summary, metricsJson: json(metrics), warningsJson: json(overview.warnings), staleAt: new Date(Date.now() + 15 * 60 * 1000), collectionRunId: run.id } });
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date(), durationMs: Date.now() - started, metricsJson: json(metrics), warningsJson: json(overview.warnings) } });
    return { snapshot, overview, metrics, collectionRunId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Linux collection failed";
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date(), durationMs: Date.now() - started, errorMessage: message } });
    throw error;
  }
}

export { parseLinuxHealthOutput };
