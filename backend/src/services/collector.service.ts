import { prisma } from "../db/prisma.js";
import { selectCollector } from "../collectors/collector-registry.service.js";
import { ingestCollectorRun } from "./event-ingestion.service.js";
import { buildIncidentsFromRecentEvents } from "./incident-builder.service.js";

const DEFAULT_SOURCE_TYPE = "linux_ssh";

function fallbackSince() {
  return new Date(Date.now() - 15 * 60 * 1000);
}

async function ensureState(deviceId: string, sourceType = DEFAULT_SOURCE_TYPE) {
  return prisma.eventCollectorState.upsert({
    where: { deviceId_sourceType: { deviceId, sourceType } },
    update: {},
    create: {
      deviceId,
      sourceType,
      enabled: false,
      intervalSeconds: 60
    }
  });
}

export async function listCollectors() {
  const states = await prisma.eventCollectorState.findMany({
    orderBy: { updatedAt: "desc" },
    include: { device: { select: { id: true, name: true, type: true, host: true, protocol: true } } }
  });
  return { collectors: states };
}

export async function getCollectorStatus(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { collectorStates: true }
  });
  if (!device) return null;
  const collector = selectCollector(device);
  const state = await ensureState(deviceId);
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
  await ensureState(deviceId);
  const state = await prisma.eventCollectorState.update({
    where: { deviceId_sourceType: { deviceId, sourceType: DEFAULT_SOURCE_TYPE } },
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

  const state = await ensureState(deviceId);
  const since = state.lastCollectedAt ?? fallbackSince();

  try {
    const run = await collector.runOnce(device, since);
    const ingestion = await ingestCollectorRun(run);
    const incidents = await buildIncidentsFromRecentEvents({ deviceId, timeWindowMinutes: 10 });
    const updatedState = await prisma.eventCollectorState.update({
      where: { deviceId_sourceType: { deviceId, sourceType: DEFAULT_SOURCE_TYPE } },
      data: {
        lastCollectedAt: run.completedAt,
        lastSuccessAt: run.completedAt,
        lastError: null
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
      where: { deviceId_sourceType: { deviceId, sourceType: DEFAULT_SOURCE_TYPE } },
      data: {
        lastErrorAt: new Date(),
        lastError: message
      }
    });
    throw error;
  }
}
