import { prisma } from "../db/prisma.js";
import { selectCollector } from "../collectors/collector-registry.service.js";
import { ingestCollectorRun } from "./event-ingestion.service.js";
import { buildIncidentsFromRecentEvents } from "./incident-builder.service.js";
import { env } from "../config/env.js";

function fallbackSince() {
  return new Date(Date.now() - 15 * 60 * 1000);
}

async function ensureState(deviceId: string, sourceType: string) {
  return prisma.eventCollectorState.upsert({
    where: { deviceId_sourceType: { deviceId, sourceType } },
    update: {},
    create: {
      deviceId,
      sourceType,
      enabled: true,
      intervalSeconds: env.securityCollectorIntervalSeconds
    }
  });
}

export async function listCollectors() {
  await reconcileCollectorStates();
  const states = await prisma.eventCollectorState.findMany({
    orderBy: { updatedAt: "desc" },
    include: { device: { select: { id: true, name: true, type: true, host: true, protocol: true } } }
  });
  return { collectors: states };
}

export async function reconcileCollectorStates() {
  const devices = await prisma.device.findMany();
  let supportedDevices = 0;
  let createdStates = 0;
  for (const device of devices) {
    const collector = selectCollector(device);
    if (!collector) continue;
    supportedDevices += 1;
    const existing = await prisma.eventCollectorState.findUnique({
      where: { deviceId_sourceType: { deviceId: device.id, sourceType: collector.stateSourceType } },
      select: { id: true }
    });
    if (!existing) {
      await ensureState(device.id, collector.stateSourceType);
      createdStates += 1;
    }
  }
  return { supportedDevices, createdStates };
}

export async function getCollectorStatus(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { collectorStates: true }
  });
  if (!device) return null;
  const collector = selectCollector(device);
  if (!collector) return {
    device: { id: device.id, name: device.name, type: device.type, host: device.host, protocol: device.protocol },
    supported: false,
    collector: null,
    sourceTypes: [],
    state: null
  };
  const state = await ensureState(deviceId, collector.stateSourceType);
  return {
    device: { id: device.id, name: device.name, type: device.type, host: device.host, protocol: device.protocol },
    supported: Boolean(collector),
    collector: collector?.name ?? null,
    sourceTypes: collector?.sourceTypes ?? [],
    state
  };
}

export async function setCollectorEnabled(deviceId: string, enabled: boolean) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const collector = selectCollector(device);
  if (!collector) throw new Error("COLLECTOR_NOT_FOUND");
  await ensureState(deviceId, collector.stateSourceType);
  const state = await prisma.eventCollectorState.update({
    where: { deviceId_sourceType: { deviceId, sourceType: collector.stateSourceType } },
    data: { enabled }
  });
  return { deviceId, state };
}

export async function runCollectorOnce(deviceId: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  const collector = selectCollector(device);
  if (!collector) {
    throw new Error("COLLECTOR_NOT_FOUND");
  }

  const state = await ensureState(deviceId, collector.stateSourceType);
  const since = state.lastCollectedAt ?? fallbackSince();

  try {
    const run = await collector.runOnce(device, since);
    const ingestion = await ingestCollectorRun(run);
    const incidents = await buildIncidentsFromRecentEvents({ deviceId, timeWindowMinutes: 10 });
    const updatedState = await prisma.eventCollectorState.update({
      where: { deviceId_sourceType: { deviceId, sourceType: collector.stateSourceType } },
      data: {
        lastCollectedAt: run.completedAt,
        lastSuccessAt: run.completedAt,
        lastError: null,
        consecutiveFailures: 0,
        consecutiveIdleRuns: ingestion.inserted + ingestion.updated === 0 ? { increment: 1 } : 0
      }
    });
    return {
      deviceId,
      collector: collector.name,
      state: updatedState,
      collectedLines: run.lines.length,
      warnings: run.warnings,
      ingestion,
      incidents
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collector failed";
    await prisma.eventCollectorState.update({
      where: { deviceId_sourceType: { deviceId, sourceType: collector.stateSourceType } },
      data: {
        lastErrorAt: new Date(),
        lastError: message,
        consecutiveFailures: { increment: 1 }
      }
    });
    throw error;
  }
}
