import type { CameraDevice, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { CameraError } from "./camera-network.js";
import { nvrSensors } from "./nvr-sensors.js";
import type { NvrReport } from "./nvr-monitor.js";

// CameraDevice owns transport/credentials; Asset is the durable inventory identity.
// Reserved IDs/external IDs are never matched to generic SSH devices by IP/name.
export const nvrAssetId = (cameraId: string) => `nvr-${cameraId}`;
function projectionRevision(camera: CameraDevice) {
  const report = camera.monitorReportJson as NvrReport | null;
  const age = report?.checkedAt ? Date.now() - Date.parse(report.checkedAt) : NaN;
  return JSON.stringify([camera.companyId, camera.name, camera.host, camera.location, camera.monitoringEnabled, camera.monitorIntervalSeconds,
    camera.lastSeenAt?.toISOString(), camera.monitorCheckedAt?.toISOString(), report?.checkedAt, Number.isFinite(age) && age >= -30000 && age <= camera.monitorIntervalSeconds * 2000]);
}
export async function syncNvrAsset(tx: Prisma.TransactionClient, camera: CameraDevice) {
  if (camera.kind !== "nvr" || !camera.companyId) return;
  const company = await tx.company.findFirst({ where: { id: camera.companyId, ownerId: camera.ownerId, deletedAt: null }, select: { id: true } });
  if (!company) return;
  const collision = await tx.asset.findFirst({ where: { companyId: company.id, managementIp: camera.host, id: { not: nvrAssetId(camera.id) } }, select: { id: true } });
  if (collision) throw new CameraError("NVR_ASSET_IP_CONFLICT", 409);
  const report = camera.monitorReportJson as NvrReport | null;
  const age = report?.checkedAt ? Date.now() - Date.parse(report.checkedAt) : NaN;
  const fresh = Number.isFinite(age) && age >= -30000 && age <= camera.monitorIntervalSeconds * 2000;
  const sensors = nvrSensors(report, camera.monitorIntervalSeconds), measured = sensors.filter(sensor => sensor.value !== null);
  const healthState = !fresh ? "unknown" : sensors.some(s => s.status === "critical") ? "critical" : sensors.some(s => s.status === "warning") ? "warning" :
    sensors.find(s => s.id === "disk_health")?.status === "ok" && sensors.find(s => s.id === "job_errors")?.status === "ok" &&
    Boolean(report?.jobs.length) && report!.jobs.every(job => job.state === "Active") && !report!.truncated ? "healthy" : "unknown";
  const data = { companyId: company.id, name: camera.name, managementIp: camera.host, externalId: `nvr:${camera.id}`, managedState: "managed", healthState,
    lastSeenAt: report?.reachable && report.checkedAt ? new Date(report.checkedAt) : camera.lastSeenAt,
    metadataJson: { entityType: "nvr", cameraId: camera.id, location: camera.location, protocol: camera.connectionMode, monitoringEnabled: camera.monitoringEnabled,
      availability: !fresh ? "unknown" : report?.reachable ? "online" : "unknown", observedAt: report?.checkedAt ?? null,
      sensorCount: sensors.length, measuredSensors: measured.length, projectionRevision: projectionRevision(camera) } };
  await tx.asset.upsert({ where: { id: nvrAssetId(camera.id) }, create: { id: nvrAssetId(camera.id), ...data }, update: data });
}
export async function syncNvrInventory(ownerId?: string) {
  // Existing listAssets already reconciles device projections. No device network calls here.
  const cameras = await prisma.cameraDevice.findMany({ where: { kind: "nvr", companyId: { not: null }, ...(ownerId ? { ownerId } : {}), company: { deletedAt: null } }, take: 256 });
  const assets = await prisma.asset.findMany({ where: { id: { in: cameras.map(camera => nvrAssetId(camera.id)) } }, select: { id: true, companyId: true, deletedAt: true, managedState: true, metadataJson: true } });
  const previousById = new Map(assets.map(asset => [asset.id, asset]));
  for (const camera of cameras) {
    // Preserve explicitly archived inventory entries; never resurrect them on a GET.
    const previous = previousById.get(nvrAssetId(camera.id));
    if (previous?.deletedAt || previous?.managedState === "archived") continue;
    const metadata = previous?.metadataJson as Record<string, unknown> | null;
    // Asset lists poll every five seconds. Unchanged projections require no row locks or writes.
    if (previous?.companyId === camera.companyId && metadata?.projectionRevision === projectionRevision(camera)) continue;
    try { await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CameraDevice" WHERE "id" = ${camera.id} FOR UPDATE`;
      const current = await tx.cameraDevice.findFirst({ where: { id: camera.id, kind: "nvr", ...(ownerId ? { ownerId } : {}), company: { deletedAt: null } } });
      if (current) await syncNvrAsset(tx, current);
    }); }
    catch (e) { if (!(e instanceof CameraError && e.code === "NVR_ASSET_IP_CONFLICT")) throw e; /* Never take over a conflicting asset. Registration/move surfaces the conflict. */ }
  }
}
