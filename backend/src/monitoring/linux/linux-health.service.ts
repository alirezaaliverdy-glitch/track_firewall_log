import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { collectLinuxServerOverview, parseLinuxServerOverview } from "../../telemetry/linux/linux-telemetry.service.js";
import { parseLinuxHealthOutput } from "./linux-health.parser.js";
import { scoreLinuxHealth } from "./linux-health-score.js";
import { recordVerifiedDeviceConnectivity } from "../../services/device-connectivity-sensor.service.js";
import { diagnoseLinuxHealth } from "./linux-health-diagnosis.js";

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stateFromOverview(status: string) { return status === "healthy" ? "healthy" : status === "critical" ? "critical" : status === "warning" ? "warning" : "unknown"; }
export function linuxCapacityBytes(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*([kmgtpe])?(?:i?b)?$/i);
  if (!match) return null;
  const powers: Record<string, number> = { "": 0, k: 1, m: 2, g: 3, t: 4, p: 5, e: 6 };
  const bytes = Number(match[1]) * 1024 ** powers[(match[2] ?? "").toLowerCase()];
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}
type ObservabilitySchemaState = { available: boolean; missing: string[]; checkedAt: string; reason?: string };
let observabilitySchemaState: ObservabilitySchemaState | null = null;
let warnedMissingObservability = false;

function isMigrationPendingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /MetricSample|HealthSnapshot|CollectionRun|metric_samples|health_snapshots|collection_runs|does not exist|no such table|relation/i.test(message);
}

async function getObservabilitySchemaState(): Promise<ObservabilitySchemaState> {
  if (observabilitySchemaState) return observabilitySchemaState;
  const expected = ["HealthSnapshot", "MetricSample", "CollectionRun"];
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('HealthSnapshot', 'MetricSample', 'CollectionRun')
    `;
    const present = new Set(rows.map((row) => row.table_name));
    const missing = expected.filter((table) => !present.has(table));
    observabilitySchemaState = {
      available: missing.length === 0,
      missing,
      checkedAt: new Date().toISOString(),
      reason: missing.length ? "OBSERVABILITY_SCHEMA_NOT_APPLIED" : undefined
    };
    if (missing.length && !warnedMissingObservability) {
      warnedMissingObservability = true;
      console.warn(`[linux-monitoring] ${observabilitySchemaState.reason}: missing optional tables ${missing.join(", ")}`);
    }
    return observabilitySchemaState;
  } catch {
    observabilitySchemaState = {
      available: false,
      missing: expected,
      checkedAt: new Date().toISOString(),
      reason: "OBSERVABILITY_SCHEMA_CHECK_FAILED"
    };
    return observabilitySchemaState;
  }
}

export function metricsFromOverview(overview: ReturnType<typeof parseLinuxServerOverview>) {
  const metrics = [] as Array<{ metricKey: string; value: number; unit?: string; labels?: Record<string, unknown> }>;
  if (overview.cpu.usagePercent !== null) metrics.push({ metricKey: "cpu.usage_percent", value: overview.cpu.usagePercent, unit: "percent" });
  if (overview.cpu.coreCount !== null) metrics.push({ metricKey: "cpu.total_cores", value: overview.cpu.coreCount, unit: "count" });
  const [l1, l5, l15] = overview.cpu.loadAverage;
  if (l1 !== undefined) metrics.push({ metricKey: "cpu.load_1m", value: l1, unit: "load" });
  if (l5 !== undefined) metrics.push({ metricKey: "cpu.load_5m", value: l5, unit: "load" });
  if (l15 !== undefined) metrics.push({ metricKey: "cpu.load_15m", value: l15, unit: "load" });
  if (overview.memory.usedPercent !== null) metrics.push({ metricKey: "memory.usage_percent", value: overview.memory.usedPercent, unit: "percent" });
  if (overview.memory.totalMb !== null) metrics.push({ metricKey: "memory.total_bytes", value: overview.memory.totalMb * 1024 ** 2, unit: "bytes" });
  if (overview.memory.usedMb !== null) metrics.push({ metricKey: "memory.used_bytes", value: overview.memory.usedMb * 1024 ** 2, unit: "bytes" });
  if (overview.memory.swapUsedPercent !== null) metrics.push({ metricKey: "swap.usage_percent", value: overview.memory.swapUsedPercent, unit: "percent" });
  const rootDisk = overview.disks[0];
  if (rootDisk?.usedPercent !== null && rootDisk?.usedPercent !== undefined) {
    const labels = { mount: rootDisk.mount };
    metrics.push({ metricKey: "disk.usage_percent", value: rootDisk.usedPercent, unit: "percent", labels });
    const totalBytes = linuxCapacityBytes(rootDisk.size);
    const usedBytes = linuxCapacityBytes(rootDisk.used);
    if (totalBytes !== null) metrics.push({ metricKey: "disk.total_bytes", value: totalBytes, unit: "bytes", labels });
    if (usedBytes !== null) metrics.push({ metricKey: "disk.used_bytes", value: usedBytes, unit: "bytes", labels });
  }
  metrics.push({ metricKey: "services.failed_count", value: overview.services.filter((service) => service.state === "failed").length, unit: "count" });
  metrics.push({ metricKey: "ports.listening_count", value: overview.listeningPorts.length, unit: "count" });
  metrics.push({ metricKey: "firewall.enabled", value: overview.services.some((service) => ["ufw", "firewalld"].includes(service.name) && service.state === "active") ? 1 : 0, unit: "boolean" });
  metrics.push({ metricKey: "processes.count", value: overview.topProcesses.length, unit: "count" });
  const primaryInterface = overview.network.interfaces.find((item) =>
    item.ips.length > 0 && /^(?:en|eth|bond|wlan|wl)/i.test(item.name) && item.rxBytes !== undefined && item.txBytes !== undefined
  ) ?? overview.network.interfaces.find((item) => item.ips.length > 0 && item.rxBytes !== undefined && item.txBytes !== undefined);
  if (primaryInterface) {
    const labels = { interface: primaryInterface.name };
    metrics.push({ metricKey: "network.rx_bytes", value: primaryInterface.rxBytes!, unit: "bytes", labels });
    metrics.push({ metricKey: "network.tx_bytes", value: primaryInterface.txBytes!, unit: "bytes", labels });
    if (primaryInterface.errors !== undefined) metrics.push({ metricKey: "network.errors", value: primaryInterface.errors, unit: "count", labels });
  }
  return metrics;
}

async function listLinuxDevicesWithoutHealth() {
  const devices = await prisma.device.findMany({ where: { OR: [{ vendor: { contains: "linux", mode: "insensitive" } }, { type: "linux_edge" }] }, include: { asset: true }, orderBy: { updatedAt: "desc" } });
  return devices.map((device) => withDiagnosis({ id: device.id, name: device.name, host: device.host, asset: device.asset, status: device.status, healthState: /offline|disconnected|failed/i.test(device.status) ? "offline" : "unknown", latestHealth: null }));
}

function effectiveLinuxState(deviceStatus: string, latestHealth: { state: string; staleAt: Date | null } | undefined) {
  if (/offline|disconnected|failed/i.test(deviceStatus)) return "offline";
  if (!latestHealth) return "unknown";
  if (latestHealth.staleAt && latestHealth.staleAt.getTime() < Date.now()) return "stale";
  return latestHealth.state;
}

function withDiagnosis<T extends { healthState: string; latestHealth: { state: string; summary: string; warningsJson: unknown; score: number; collectedAt: Date } | null }>(device: T) {
  return {
    ...device,
    diagnosis: diagnoseLinuxHealth({
      state: device.healthState,
      summary: device.latestHealth?.summary,
      warnings: device.latestHealth?.warningsJson,
      score: device.latestHealth?.score,
      observedAt: device.latestHealth?.collectedAt,
    }),
  };
}

export async function listLinuxMonitoringDevices() {
  const schema = await getObservabilitySchemaState();
  if (!schema.available) return listLinuxDevicesWithoutHealth();
  try {
    const devices = await prisma.device.findMany({ where: { OR: [{ vendor: { contains: "linux", mode: "insensitive" } }, { type: "linux_edge" }] }, include: { asset: true, healthSnapshots: { orderBy: { collectedAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
    return devices.map((device) => withDiagnosis({ id: device.id, name: device.name, host: device.host, asset: device.asset, status: device.status, healthState: effectiveLinuxState(device.status, device.healthSnapshots[0]), latestHealth: device.healthSnapshots[0] ?? null }));
  } catch (error) {
    if (isMigrationPendingError(error)) return listLinuxDevicesWithoutHealth();
    throw error;
  }
}

export async function getLinuxMonitoringSummary() {
  const schema = await getObservabilitySchemaState();
  const devices = await listLinuxMonitoringDevices();
  const counts = devices.reduce<Record<string, number>>((acc, device) => { const key = device.healthState ?? "unknown"; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  return { total: devices.length, healthy: counts.healthy ?? 0, warning: counts.warning ?? 0, critical: counts.critical ?? 0, offline: counts.offline ?? 0, stale: counts.stale ?? 0, unknown: counts.unknown ?? 0, devices, observability: schema.available ? { state: "available", checkedAt: schema.checkedAt } : { state: "not_configured", reason: schema.reason, missingTables: schema.missing, checkedAt: schema.checkedAt } };
}

export async function getLinuxMonitoringDevice(deviceId: string) {
  const schema = await getObservabilitySchemaState();
  if (!schema.available) {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { asset: true } });
    return device ? { device, latestHealth: null, observability: { state: "not_configured", reason: schema.reason, missingTables: schema.missing, checkedAt: schema.checkedAt } } : null;
  }
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
  const schema = await getObservabilitySchemaState();
  if (!schema.available) return [];
  const since = new Date(Date.now() - Math.max(1, Math.min(720, hours)) * 60 * 60 * 1000);
  try {
    return await prisma.metricSample.findMany({ where: { deviceId, timestamp: { gte: since } }, orderBy: { timestamp: "desc" }, take: 1000 });
  } catch (error) {
    if (isMigrationPendingError(error)) return [];
    throw error;
  }
}

export async function refreshLinuxHealth(deviceId: string) {
  const schema = await getObservabilitySchemaState();
  if (!schema.available) {
    return { status: "not_configured", reason: schema.reason, missingTables: schema.missing, connectorInvoked: false };
  }
  const started = Date.now();
  const run = await prisma.collectionRun.create({ data: { deviceId, provider: "linux-ssh", status: "running" } });
  try {
    const overview = await collectLinuxServerOverview(deviceId);
    const metrics = metricsFromOverview(overview);
    const diagnosticWarnings = Array.from(new Set([...overview.warnings, ...overview.health.reasons, ...overview.recentProblems]));
    const score = scoreLinuxHealth(metrics, diagnosticWarnings);
    await prisma.metricSample.createMany({ data: metrics.map((metric) => ({ deviceId, metricKey: metric.metricKey, value: metric.value, unit: metric.unit, source: "linux-ssh", labelsJson: json(metric.labels ?? {}), collectionRunId: run.id })) });
    const snapshot = await prisma.healthSnapshot.create({ data: { deviceId, score: score.score, state: stateFromOverview(overview.health.status), summary: overview.health.summary, metricsJson: json(metrics), warningsJson: json(diagnosticWarnings), staleAt: new Date(Date.now() + 15 * 60 * 1000), collectionRunId: run.id } });
    const completedAt = new Date();
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "completed", completedAt, durationMs: Date.now() - started, metricsJson: json(metrics), warningsJson: json(diagnosticWarnings) } });
    await recordVerifiedDeviceConnectivity(
      deviceId,
      "LINUX_HEALTH_COLLECTION_VERIFIED",
      "Linux health sensors completed an authenticated collection.",
      completedAt.getTime() - started
    );
    return { snapshot, overview, metrics, collectionRunId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Linux collection failed";
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date(), durationMs: Date.now() - started, errorMessage: message } });
    throw error;
  }
}

export { parseLinuxHealthOutput };
