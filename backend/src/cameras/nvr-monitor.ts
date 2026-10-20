import type { CameraDevice, Prisma } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";
import { cameraSoap, nodes, escapeCameraXml, type CameraConnection, type XmlNode } from "./camera-onvif.js";
import { cameraUrl, CameraError } from "./camera-network.js";
import { activeCameraScope, ownedCamera, cameraConnection, cameraVpnTarget, refreshCamera, type CameraActor } from "./camera.service.js";
import { cameraRevision } from "./camera-policy.js";
import { probeNvrStorage, type NvrStorage } from "./nvr-storage.js";
import { nvrSensors } from "./nvr-sensors.js";
import { syncNvrAsset } from "./nvr-asset.js";
import type { NvrNative } from "./nvr-dvrip.js";
import { probeNativeNvr } from "./nvr-native-monitor.js";
import { probeAppWebNvr } from "./nvr-appweb.js";

const DEVICE = "http://www.onvif.org/ver10/device/wsdl", RECORDING = "http://www.onvif.org/ver10/recording/wsdl", SEARCH = "http://www.onvif.org/ver10/search/wsdl";
const value = (root: XmlNode, key: string) => (nodes(root, key)[0]?.text.trim() ?? "").slice(0, 160);
type Coverage = "measured" | "unsupported" | "denied" | "unavailable";
export type NvrReport = { checkedAt: string; adapter: "onvif" | "dvrip" | "appweb"; native?: NvrNative; reachable: boolean; errorCode?: string; durationMs: number;
  identity: Record<string, string>; configuredChannels: number; clockDriftSeconds: number | null; storageConfigurations: number | null;
  recordingCount: number | null; jobs: Array<{ token: string; state: string; error: boolean }>;
  interfaces: Array<{ name: string; enabled: boolean | null; addresses: string[] }>;
  coverage: Record<string, Coverage>; warnings: string[]; truncated: boolean; storage?: NvrStorage };

/** Read-only multi-vendor adapter. No profile/configuration is presented as live recording or HDD health. */
export async function probeNvr(camera: Pick<CameraDevice, "host" | "onvifPort" | "onvifPath" | "onvifHttps" | "profilesJson">, connection: CameraConnection): Promise<NvrReport> {
  const started = Date.now(), deadline = started + 45000;
  const report: NvrReport = { checkedAt: new Date().toISOString(), adapter: "onvif", reachable: false, durationMs: 0, identity: {},
    configuredChannels: new Set((Array.isArray(camera.profilesJson) ? camera.profilesJson : []).map(p => (p as { sourceToken?: string })?.sourceToken).filter(Boolean)).size,
    clockDriftSeconds: null, storageConfigurations: null, recordingCount: null, jobs: [], interfaces: [], warnings: [], truncated: false,
    coverage: { identity: "unavailable", clock: "unavailable", network: "unavailable", storageConfiguration: "unavailable", recordings: "unsupported", recordingJobs: "unsupported", diskHealth: "unsupported", diskCapacity: "unsupported", cpu: "unsupported", memory: "unsupported", channelOnline: "unsupported" } };
  const device = cameraUrl(`${camera.onvifHttps ? "https" : "http"}://${camera.host}:${camera.onvifPort}${camera.onvifPath}`, camera.host);
  const read = async (url: URL, namespace: string, action: string, content = "") => {
    if (Date.now() >= deadline) { report.truncated = true; throw new CameraError("CAMERA_TIMEOUT", 504); }
    return cameraSoap(url, namespace, action, `<q:${action} xmlns:q="${namespace}">${content}</q:${action}>`, connection, Math.min(3000, deadline - Date.now()));
  };
  const optional = async (key: string, work: () => Promise<void>) => {
    try { await work(); report.coverage[key] = "measured"; }
    catch (e) { const code = e instanceof CameraError ? e.code : "CAMERA_CONNECTION_FAILED"; report.coverage[key] = code.includes("AUTH") ? "denied" : code === "CAMERA_OPERATION_UNSUPPORTED" ? "unsupported" : "unavailable"; }
  };
  try {
    // Read the clock before WSSE-authenticated calls so clock-skewed devices can still authenticate.
    await optional("clock", async () => {
      const root = await read(device, DEVICE, "GetSystemDateAndTime"), utc = nodes(root, "UTCDateTime")[0];
      if (!utc) throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
      const fields = ["Year", "Month", "Day", "Hour", "Minute", "Second"].map(key => value(utc, key));
      if (fields.some(field => !/^\d+$/.test(field))) throw new CameraError("CAMERA_XML_INVALID", 502);
      const [year, month, day, hour, minute, second] = fields.map(Number);
      if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) throw new CameraError("CAMERA_XML_INVALID", 502);
      const drift = Date.UTC(year, month - 1, day, hour, minute, second) - Date.now();
      report.clockDriftSeconds = Math.round(drift / 1000); connection = { ...connection, timeOffsetMs: drift };
      if (Math.abs(drift) > 120000) report.warnings.push("clock_drift");
    });
    const identity = await read(device, DEVICE, "GetDeviceInformation"); report.reachable = true; report.coverage.identity = "measured";
    report.identity = Object.fromEntries(["Manufacturer", "Model", "FirmwareVersion", "SerialNumber"].map(key => [key, value(identity, key)]));
    await optional("network", async () => {
      const root = await read(device, DEVICE, "GetNetworkInterfaces");
      report.interfaces = nodes(root, "NetworkInterfaces").slice(0, 16).map(item => ({ name: value(item, "Name") || item.attributes.token?.slice(0, 80) || "—",
        enabled: ["true", "false"].includes(value(item, "Enabled")) ? value(item, "Enabled") === "true" : null,
        addresses: nodes(item, "Address").map(item => item.text.trim().slice(0, 80)).slice(0, 8) }));
    });
    await optional("storageConfiguration", async () => { const root = await read(device, DEVICE, "GetStorageConfigurations"); report.storageConfigurations = nodes(root, "StorageConfigurations").length; });
    let recording: URL | undefined, search: URL | undefined;
    try {
      const services = await read(device, DEVICE, "GetServices", "<q:IncludeCapability>false</q:IncludeCapability>");
      for (const service of nodes(services, "Service").slice(0, 32)) {
        const namespace = value(service, "Namespace");
        if (namespace !== RECORDING && namespace !== SEARCH) continue;
        // No credential-bearing, external, public or different-device service URLs may be followed.
        const url = cameraUrl(value(service, "XAddr"), camera.host);
        if (namespace === RECORDING) recording = url; else search = url;
      }
    } catch { report.warnings.push("service_discovery_unavailable"); }
    if (recording) {
      await optional("recordings", async () => { const root = await read(recording!, RECORDING, "GetRecordings"); report.recordingCount = nodes(root, "RecordingItem").length; });
      await optional("recordingJobs", async () => {
        const root = await read(recording!, RECORDING, "GetRecordingJobs"), jobs = nodes(root, "JobItem");
        report.truncated ||= jobs.length > 8;
        for (const job of jobs.slice(0, 8)) {
          const token = value(job, "JobToken"); if (!token) continue;
          try {
            const stateRoot = await read(recording!, RECORDING, "GetRecordingJobState", `<q:JobToken>${escapeCameraXml(token)}</q:JobToken>`);
            const states = nodes(stateRoot, "State").map(item => item.text.trim()).filter(Boolean);
            const overall = states[0] ?? "", error = states.includes("Error") || nodes(stateRoot, "Error").some(item => Boolean(item.text.trim()));
            report.jobs.push({ token, state: ["Idle", "Active", "PartiallyActive", "Error"].includes(overall) ? overall : "Unknown", error });
          } catch { report.jobs.push({ token, state: "Unknown", error: false }); report.warnings.push("job_state_unavailable"); }
        }
        if (report.jobs.some(job => job.error)) report.warnings.push("recording_job_error");
      });
    }
    if (!recording && search) await optional("recordings", async () => {
      const root = await read(search!, SEARCH, "GetRecordingSummary"), count = value(root, "NumberRecordings");
      if (!/^\d+$/.test(count)) throw new CameraError("CAMERA_XML_INVALID", 502); report.recordingCount = Number(count);
    });
  } catch (e) { report.errorCode = e instanceof CameraError ? e.code : "CAMERA_CONNECTION_FAILED"; report.warnings.push("device_check_failed"); }
  report.storage = await probeNvrStorage(camera.host, connection, report.identity.Manufacturer ?? "", camera.onvifPort, camera.onvifHttps);
  report.coverage.diskCapacity = report.storage.disks.some(disk => disk.capacityBytes !== null) ? "measured" : report.storage.status === "measured" ? "unavailable" : report.storage.status;
  report.coverage.diskHealth = report.storage.disks.some(disk => disk.health !== "unknown") ? "measured" : report.storage.status === "measured" ? "unavailable" : report.storage.status;
  if (report.storage.status === "measured") { if (!report.reachable) { report.warnings = report.warnings.filter(code => code !== "device_check_failed"); report.warnings.push("onvif_unavailable"); delete report.errorCode; } report.reachable = true; if (!report.storage.disks.length) report.warnings.push("no_disks_reported"); }
  if (report.storage.disks.some(disk => disk.health === "error" || disk.smart === "failed")) report.warnings.push("disk_error");
  if (report.storage.disks.some(disk => disk.temperatureC !== null && disk.temperatureC >= 55)) report.warnings.push("disk_temperature_high");
  report.durationMs = Date.now() - started; report.warnings = [...new Set(report.warnings)]; return report;
}

export async function getNvrMonitor(id: string, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  return { report: camera.monitorReportJson, sensors: nvrSensors(camera.monitorReportJson as NvrReport | null, camera.monitorIntervalSeconds), history: camera.monitorHistoryJson ?? [], monitoringEnabled: camera.monitoringEnabled, intervalSeconds: camera.monitorIntervalSeconds };
}
let activeProbes = 0;
export async function refreshNvrMonitor(id: string, actor: CameraActor, background = false) {
  let camera = await ownedCamera(id, actor);
  if(camera.kind==="nvr"&&camera.connectionMode==="auto"){
    await refreshCamera(id,actor);camera=await ownedCamera(id,actor);
    if(camera.connectionMode==="auto")throw new CameraError(camera.lastErrorCode??"NVR_AUTO_DETECT_UNAVAILABLE",422);
  }
  if (camera.kind !== "nvr") throw new CameraError("CAMERA_MONITOR_UNAVAILABLE", 422);
  if (activeProbes >= 2) throw new CameraError("CAMERA_MONITOR_BUSY", 409);
  const now = new Date(), lease = new Date(Date.now() + 120000);
  activeProbes++;
  try {
    const claim = await prisma.cameraDevice.updateMany({ where: { id, OR: [{ monitorLeaseUntil: null }, { monitorLeaseUntil: { lt: now } }] }, data: { monitorLeaseUntil: lease } });
    if (!claim.count) throw new CameraError("CAMERA_MONITOR_BUSY", 409);
    let report: NvrReport;
    try { await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true); report = camera.connectionMode === "appweb" ? await probeAppWebNvr(camera.host, camera.onvifPort, camera.onvifHttps, cameraConnection(camera)) : camera.connectionMode === "dvrip" ? await probeNativeNvr(camera.host, camera.onvifPort, cameraConnection(camera)) : await probeNvr(camera, cameraConnection(camera)); }
    catch (error) { report = { checkedAt: now.toISOString(), adapter: camera.connectionMode === "appweb" ? "appweb" : camera.connectionMode === "dvrip" ? "dvrip" : "onvif", reachable: false, errorCode: error instanceof CameraError ? error.code : "CAMERA_CONNECTION_FAILED", durationMs: Date.now() - now.getTime(), identity: {}, configuredChannels: 0, clockDriftSeconds: null, storageConfigurations: null, recordingCount: null, jobs: [], interfaces: [], coverage: {}, warnings: ["device_check_failed"], truncated: false }; }
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CameraDevice" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.cameraDevice.findFirst({ where: { id, ...activeCameraScope(actor) } });
      if (!current || cameraRevision(current) !== cameraRevision(camera)) throw new CameraError("CAMERA_PREVIEW_EXPIRED", 409);
      const history = Array.isArray(current.monitorHistoryJson) ? current.monitorHistoryJson : [];
      const sensors = nvrSensors(report, current.monitorIntervalSeconds);
      const entry = { checkedAt: report.checkedAt, reachable: report.reachable, warningCount: report.warnings.length,
        readings: Object.fromEntries(sensors.filter(sensor => sensor.value !== null).map(sensor => [sensor.id, sensor.value])) };
      const updated = await tx.cameraDevice.update({ where: { id }, data: { monitorCheckedAt: new Date(report.checkedAt), monitorReportJson: report as unknown as Prisma.InputJsonValue,
        monitorHistoryJson: [...history.slice(-47), entry] as Prisma.InputJsonValue, monitorNextRunAt: new Date(Date.now() + current.monitorIntervalSeconds * 1000),
        ...(["dvrip", "appweb"].includes(camera.connectionMode) ? { status: report.reachable ? "verified" : "error", lastErrorCode: report.errorCode ?? null, ...(report.reachable ? { infoJson: report.identity, lastSeenAt: new Date(report.checkedAt) } : {}) } : {}),
        ...([report.errorCode, report.storage?.errorCode].some(code => code?.includes("AUTH") || code === "NVR_ACCOUNT_LOCKED" || code === "NVR_ACCESS_DENIED") ? { monitoringEnabled: false } : {}) } });
      await syncNvrAsset(tx, updated);
      if (!background) await tx.auditLog.create({ data: { actor: actor.username, action: "camera.monitor_refreshed", targetType: "camera", targetId: id, dryRun: true, metadata: { reachable: report.reachable, warningCount: report.warnings.length, connectorInvoked: true, readOnly: true } } });
    });
    return getNvrMonitor(id, actor);
  } finally { activeProbes--; await prisma.cameraDevice.updateMany({ where: { id, monitorLeaseUntil: lease }, data: { monitorLeaseUntil: null } }); }
}
let timer: ReturnType<typeof setInterval> | undefined, running: Promise<unknown> | undefined;
export function startNvrMonitor(logger: FastifyBaseLogger) {
  if (timer) return;
  timer = setInterval(() => { if (!running) running = (async () => {
    const cameras = await prisma.cameraDevice.findMany({ where: { monitoringEnabled: true, kind: "nvr", owner: { isActive: true },
      AND: [{ OR: [{ monitorNextRunAt: null }, { monitorNextRunAt: { lte: new Date() } }] }, { OR: [{ companyId: null }, { company: { deletedAt: null } }] }] },
      orderBy: [{ monitorNextRunAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 2 });
    for (const camera of cameras) await refreshNvrMonitor(camera.id, { id: camera.ownerId, username: "system:nvr-monitor", role: "admin" }, true).catch(() => undefined);
  })().catch(() => logger.warn({ code: "NVR_MONITOR_FAILED" }, "NVR monitoring unavailable")).finally(() => { running = undefined; }); }, 15000); timer.unref();
}
export async function stopNvrMonitor() { clearInterval(timer); timer = undefined; await running; }
