import { Prisma, type CameraDevice } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "../services/credential-crypto.service.js";
import { cameraPort, cameraSubnet, cameraUrl, privateCameraHost, CameraError } from "./camera-network.js";
import { inspectCamera, discoverCameras, cameraPresets, rebootCamera, runCameraPreset, type CameraConnection, type CameraProfile } from "./camera-onvif.js";
import { cameraSnapshot, stopCameraStreams } from "./camera-media.js";
import { cameraOperation, cameraRevision, CAMERA_CONTROL_TEMPLATES, evaluateCameraPolicy } from "./camera-policy.js";
import { assertVpnTarget } from "../vpn/vpn.service.js";
import { VpnError } from "../vpn/vpn-validation.js";
import { nvrAssetId, syncNvrAsset } from "./nvr-asset.js";
import { probeNativeNvr } from "./nvr-native-monitor.js";
import { probeAppWebNvr } from "./nvr-appweb.js";
import { cameraPtzStep, checkCameraPtzStep, runCameraPtzStep, stopCameraPtz } from "./camera-onvif.js";
import { nvrConfigChange, readNvrSettings, writeNvrSetting } from "./nvr-config.js";

export type CameraActor = { id: string; username: string; role: string; scopeOwnerId?: string | null };
export const cameraOwner = (actor: CameraActor) => actor.scopeOwnerId ?? actor.id;
export const cameraProfiles = (camera: Pick<CameraDevice, "profilesJson">) => Array.isArray(camera.profilesJson) ? camera.profilesJson as unknown as CameraProfile[] : [];
const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function cameraVpnTarget(profileId: unknown, host: string, actor: CameraActor, connected = false) {
  try { return await assertVpnTarget(profileId, host, cameraOwner(actor), connected); }
  catch (error) { if (error instanceof VpnError) throw new CameraError(error.code, error.statusCode); throw error; }
}

export function cameraConnection(camera: Pick<CameraDevice, "connectionEncrypted">): CameraConnection {
  try { return JSON.parse(decryptSecret(camera.connectionEncrypted) ?? "{}"); } catch { throw new CameraError("CAMERA_CREDENTIAL_UNAVAILABLE", 422); }
}

export function safeCamera(camera: CameraDevice) {
  const { connectionEncrypted, monitorLeaseUntil: _lease, monitorNextRunAt: _next, monitorHistoryJson: _history, ...data } = camera;
  let storage: CameraConnection["storage"];
  try { storage = cameraConnection(camera).storage; } catch { /* A missing encryption key is exposed by the connection check, never as raw data. */ }
  return { ...data, storageSettings: { adapter: storage?.adapter ?? "auto", port: storage?.port ?? camera.onvifPort, https: storage?.https ?? camera.onvifHttps, separateCredentials: Boolean(storage?.username) }, credentialsConfigured: Boolean(connectionEncrypted), profiles: cameraProfiles(camera), profilesJson: undefined };
}

function optionalText(value: unknown, max = 160) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function devicePath(value: unknown) {
  const path = optionalText(value, 256) || "/onvif/device_service";
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..")) throw new CameraError("CAMERA_PATH_INVALID");
  return path;
}
function errorCode(error: unknown) { return error instanceof CameraError ? error.code : "CAMERA_CONNECTION_FAILED"; }

export async function ownedCamera(id: string, actor: CameraActor) {
  const camera = await prisma.cameraDevice.findFirst({ where: { id, ...activeCameraScope(actor) }, include: { company: { select: { id: true, name: true, code: true } } } });
  if (!camera) throw new CameraError("CAMERA_NOT_FOUND", 404);
  return camera;
}

async function audit(actor: CameraActor, action: string, cameraId: string | null, metadata: Record<string, unknown>, dryRun = true) {
  await prisma.auditLog.create({ data: { actor: actor.username, action, targetType: "camera", targetId: cameraId, dryRun, approvalStatus: dryRun ? "not_required" : "approved", metadata: json({ ownerId: cameraOwner(actor), ...metadata }) } });
}

export function activeCameraScope(actor: CameraActor): Prisma.CameraDeviceWhereInput {
  return { ownerId: cameraOwner(actor), OR: [{ companyId: null }, { company: { ownerId: cameraOwner(actor), deletedAt: null } }] };
}
export async function cameraCompany(value: unknown, actor: CameraActor, allowUnassigned = false) {
  if (allowUnassigned && (value === "unassigned" || value === null || value === "")) return null;
  if (typeof value !== "string" || !value || value.length > 100) throw new CameraError("CAMERA_COMPANY_REQUIRED", 400);
  if (!await prisma.company.findFirst({ where: { id: value, ownerId: cameraOwner(actor), deletedAt: null }, select: { id: true } })) throw new CameraError("CAMERA_COMPANY_NOT_FOUND", 404);
  return value;
}
export async function listCameraCompanies(actor: CameraActor) {
  const companies = await prisma.company.findMany({ where: { ownerId: cameraOwner(actor), deletedAt: null }, orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, description: true } });
  const counts = await prisma.cameraDevice.groupBy({ by: ["companyId", "kind"], where: activeCameraScope(actor), _count: { _all: true } });
  const totals = (companyId: string | null) => ({ cameraCount: counts.filter(row => row.companyId === companyId && row.kind === "camera").reduce((sum, row) => sum + row._count._all, 0),
    nvrCount: counts.filter(row => row.companyId === companyId && row.kind === "nvr").reduce((sum, row) => sum + row._count._all, 0) });
  return { companies: companies.map(company => ({ ...company, ...totals(company.id) })), unassigned: totals(null) };
}
export async function listCameras(actor: CameraActor, company?: unknown) {
  const companyId = company === undefined ? undefined : await cameraCompany(company, actor, true);
  return (await prisma.cameraDevice.findMany({ where: { ...activeCameraScope(actor), ...(companyId !== undefined ? { companyId } : {}) }, orderBy: { createdAt: "desc" }, take: 256 })).map(safeCamera);
}

export async function createCamera(input: Record<string, unknown>, actor: CameraActor) {
  const companyId = await cameraCompany(input.companyId, actor);
  if (["dvrip", "appweb"].includes(String(input.connectionMode)) && input.kind !== "nvr") throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
  const host = privateCameraHost(input.host), onvifPort = cameraPort(input.onvifPort, input.connectionMode === "dvrip" ? 34567 : 80), onvifPath = devicePath(input.onvifPath);
  const vpnConnectionId = await cameraVpnTarget(input.vpnConnectionId, host, actor);
  const name = optionalText(input.name) || host, location = optionalText(input.location);
  const connectionMode = ["dvrip", "appweb"].includes(String(input.connectionMode)) && input.kind === "nvr" ? String(input.connectionMode) : input.connectionMode === "rtsp" ? "rtsp" : "onvif";
  const connection: CameraConnection = { username: optionalText(input.username), password: typeof input.password === "string" ? input.password : undefined };
  if ((connection.username?.length ?? 0) > 128 || (connection.password?.length ?? 0) > 1024) throw new CameraError("CAMERA_CREDENTIAL_INVALID");
  if (connectionMode === "rtsp") connection.rtspUrl = cameraUrl(input.rtspUrl, host, ["rtsp:"]).href;
  if (await prisma.cameraDevice.count({ where: { ownerId: cameraOwner(actor) } }) >= 256) throw new CameraError("CAMERA_DEVICE_LIMIT", 409);
  let camera: CameraDevice;
  try {
    camera = await prisma.$transaction(async tx => { const created = await tx.cameraDevice.create({ data: { ownerId: cameraOwner(actor), companyId, host, onvifPort, onvifPath, name, location, vpnConnectionId,
      kind: input.kind === "nvr" ? "nvr" : "camera", connectionMode, onvifHttps: input.onvifHttps === true, connectionEncrypted: encryptSecret(JSON.stringify(connection)),
      profilesJson: connectionMode === "rtsp" ? json([{ token: "manual", sourceToken: "manual", name, ptz: false, streamAvailable: true, snapshotAvailable: false, width: null, height: null, fps: null, encoding: null }]) : json([]) } }); await syncNvrAsset(tx, created); return created; });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new CameraError("CAMERA_ALREADY_REGISTERED", 409);
    throw error;
  }
  await audit(actor, "camera.registered", camera.id, { host, connectionMode });
  return connectionMode !== "rtsp" ? refreshCamera(camera.id, actor) : safeCamera(camera);
}

export async function refreshCamera(id: string, actor: CameraActor) {
  const camera = await ownedCamera(id, actor), connection = cameraConnection(camera);
  try {
    await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true);
    if (["dvrip", "appweb"].includes(camera.connectionMode)) {
      const report = camera.connectionMode === "appweb" ? await probeAppWebNvr(camera.host, camera.onvifPort, camera.onvifHttps, connection) : await probeNativeNvr(camera.host, camera.onvifPort, connection);
      const updated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "CameraDevice" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.cameraDevice.findUniqueOrThrow({ where: { id } });
        if (cameraRevision(current) !== cameraRevision(camera)) throw new CameraError("CAMERA_PREVIEW_EXPIRED", 409);
        const result = await tx.cameraDevice.update({ where: { id }, data: { status: "verified", infoJson: json(report.identity), monitorReportJson: json(report), monitorCheckedAt: new Date(report.checkedAt), lastSeenAt: new Date(), lastErrorCode: null } });
        await syncNvrAsset(tx, result); return result;
      });
      await audit(actor, "camera.connection_verified", id, { connectorInvoked: true, readOnly: true, method: camera.connectionMode });
      return safeCamera(updated);
    }
    if (camera.connectionMode === "rtsp") {
      await cameraSnapshot({ ownerId: cameraOwner(actor), cameraId: id, host: camera.host, profile: "manual", connection });
      const updated = await prisma.cameraDevice.update({ where: { id }, data: { status: "verified", lastSeenAt: new Date(), lastErrorCode: null } });
      await audit(actor, "camera.connection_verified", id, { connectorInvoked: true, method: "rtsp" });
      return safeCamera(updated);
    }
    const result = await inspectCamera(camera.host, camera.onvifPort, camera.onvifPath, connection, camera.onvifHttps);
    const channelCount = new Set(result.profiles.map((profile) => profile.sourceToken)).size;
    const updated = await prisma.cameraDevice.update({ where: { id }, data: { infoJson: json(result.infoJson), profilesJson: json(result.profiles),
      kind: channelCount > 1 ? "nvr" : camera.kind, connectionEncrypted: encryptSecret(JSON.stringify(result.connection)), status: "verified", lastSeenAt: new Date(), lastErrorCode: null } });
    await audit(actor, "camera.connection_verified", id, { connectorInvoked: true, method: "onvif", channelCount, profileCount: result.profiles.length });
    return safeCamera(updated);
  } catch (error) {
    const code = errorCode(error);
    const updated = await prisma.cameraDevice.update({ where: { id }, data: { status: "error", lastErrorCode: code } });
    await audit(actor, "camera.connection_failed", id, { code });
    return safeCamera(updated);
  }
}

export async function updateCamera(id: string, input: Record<string, unknown>, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  const data: Prisma.CameraDeviceUpdateInput = {};
  if (input.connectionMode !== undefined && input.connectionMode !== camera.connectionMode) {
    if (camera.kind !== "nvr" || !["onvif", "dvrip", "appweb"].includes(String(input.connectionMode))) throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
    data.connectionMode = String(input.connectionMode); data.profilesJson = Prisma.JsonNull; if (input.connectionMode === "dvrip") data.onvifHttps = false;
    data.onvifPort = input.onvifPort === undefined ? input.connectionMode === "dvrip" ? 34567 : 80 : cameraPort(input.onvifPort);
  }
  if (input.companyId !== undefined) { const companyId = await cameraCompany(input.companyId, actor); data.company = { connect: { id: companyId! } }; stopCameraStreams(id); }
  if (input.monitoringEnabled !== undefined) { if (typeof input.monitoringEnabled !== "boolean" || camera.kind !== "nvr") throw new CameraError("CAMERA_MONITOR_UNAVAILABLE", 422); data.monitoringEnabled = input.monitoringEnabled; data.monitorNextRunAt = new Date(); }
  if (input.monitorIntervalSeconds !== undefined) { const interval = input.monitorIntervalSeconds; if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 60 || interval > 3600) throw new CameraError("CAMERA_MONITOR_INTERVAL_INVALID", 400); data.monitorIntervalSeconds = interval; }
  if (input.name !== undefined) { const name = optionalText(input.name); if (!name) throw new CameraError("CAMERA_NAME_REQUIRED"); data.name = name; }
  if (input.location !== undefined) data.location = optionalText(input.location);
  if (input.vpnConnectionId !== undefined) data.vpnConnection = (await cameraVpnTarget(input.vpnConnectionId, camera.host, actor)) ? { connect: { id: String(input.vpnConnectionId) } } : { disconnect: true };
  const connection = cameraConnection(camera);
  const connectionChanged = ["connectionMode", "username", "password", "onvifPort", "onvifPath", "onvifHttps", "rtspUrl", "storageSettings"].some((key) => input[key] !== undefined) || input.vpnConnectionId !== undefined && input.vpnConnectionId !== (camera.vpnConnectionId ?? "");
  if (input.storageSettings !== undefined) {
    const settings = input.storageSettings as Record<string, unknown>;
    if (!settings || typeof settings !== "object" || !["auto", "hikvision", "dahua", "xiongmai"].includes(String(settings.adapter)) || typeof settings.https !== "boolean") throw new CameraError("NVR_STORAGE_SETTINGS_INVALID", 400);
    const previous = connection.storage;
    connection.storage = { adapter: settings.adapter as "auto" | "hikvision" | "dahua" | "xiongmai", port: cameraPort(settings.port, settings.adapter === "xiongmai" ? 34567 : 80), https: settings.https };
    if (settings.useDeviceCredentials !== true && (previous?.username || settings.username)) {
      const username = settings.username === undefined ? previous?.username : settings.username;
      const password = settings.password === undefined ? previous?.password : settings.password;
      if (typeof username !== "string" || !username.trim() || username.length > 128 || typeof password !== "string" || password.length > 1024) throw new CameraError("CAMERA_CREDENTIAL_INVALID", 400);
      connection.storage.username = username.trim(); connection.storage.password = password;
    }
  }
  if (input.username !== undefined) connection.username = optionalText(input.username, 128);
  if (input.password !== undefined) { if (typeof input.password !== "string" || input.password.length > 1024) throw new CameraError("CAMERA_CREDENTIAL_INVALID"); connection.password = input.password; }
  if (input.rtspUrl !== undefined) connection.rtspUrl = cameraUrl(input.rtspUrl, camera.host, ["rtsp:"]).href;
  if (input.onvifPort !== undefined) data.onvifPort = cameraPort(input.onvifPort);
  if (input.onvifPath !== undefined) data.onvifPath = devicePath(input.onvifPath);
  if (input.onvifHttps !== undefined) data.onvifHttps = input.onvifHttps === true;
  if (connectionChanged) {
    data.connectionEncrypted = encryptSecret(JSON.stringify(connection));
    if (["connectionMode", "username", "password", "onvifPort", "onvifPath", "onvifHttps", "rtspUrl", "vpnConnectionId"].some(key => input[key] !== undefined)) { data.status = "unverified"; data.lastErrorCode = null; stopCameraStreams(id); }
  }
  if (connectionChanged || input.companyId !== undefined) { data.monitorReportJson = Prisma.JsonNull; data.monitorHistoryJson = Prisma.JsonNull; data.monitorCheckedAt = null; }
  let updated: CameraDevice;
  try { updated = await prisma.$transaction(async tx => { const result = await tx.cameraDevice.update({ where: { id }, data }); await syncNvrAsset(tx, result); return result; }); }
  catch (error) { if ((error as { code?: string }).code === "P2002") throw new CameraError("CAMERA_ALREADY_REGISTERED", 409); throw error; }
  await audit(actor, "camera.updated", id, { connectionChanged });
  return safeCamera(updated);
}

export async function deleteCamera(id: string, actor: CameraActor) {
  await ownedCamera(id, actor); stopCameraStreams(id);
  await prisma.$transaction(async tx => { await tx.asset.updateMany({ where: { id: nvrAssetId(id), company: { ownerId: cameraOwner(actor) } }, data: { deletedAt: new Date(), managedState: "archived", healthState: "archived" } }); await tx.cameraDevice.delete({ where: { id } }); });
  await audit(actor, "camera.removed", id, {});
  return { deleted: true };
}

export async function transferCameras(ids: unknown, destination: unknown, actor: CameraActor) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 256 || ids.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) throw new CameraError("CAMERA_SELECTION_INVALID", 400);
  const uniqueIds = [...new Set(ids)] as string[], companyId = await cameraCompany(destination, actor);
  try {
    await prisma.$transaction(async tx => {
      // Stable ordering prevents deadlock between overlapping batch moves.
      for (const id of [...uniqueIds].sort()) await tx.$queryRaw`SELECT "id" FROM "CameraDevice" WHERE "id" = ${id} AND "ownerId" = ${cameraOwner(actor)} FOR UPDATE`;
      const cameras = await tx.cameraDevice.findMany({ where: { id: { in: uniqueIds }, ...activeCameraScope(actor) } });
      if (cameras.length !== uniqueIds.length) throw new CameraError("CAMERA_NOT_FOUND", 404);
      if (cameras.some(camera => camera.companyId === companyId)) throw new CameraError("CAMERA_TRANSFER_SAME_COMPANY", 400);
      if (!await tx.company.findFirst({ where: { id: companyId!, ownerId: cameraOwner(actor), deletedAt: null } })) throw new CameraError("CAMERA_COMPANY_NOT_FOUND", 404);
      for (const camera of cameras) {
        const updated = await tx.cameraDevice.update({ where: { id: camera.id }, data: { companyId, monitorReportJson: Prisma.JsonNull, monitorHistoryJson: Prisma.JsonNull, monitorCheckedAt: null } });
        await syncNvrAsset(tx, updated);
      }
      await tx.auditLog.create({ data: { actor: actor.username, action: "camera.company_transferred", targetType: "camera", dryRun: false,
        metadata: { ownerId: cameraOwner(actor), companyId, cameraIds: uniqueIds, count: cameras.length } } });
    }, { timeout: 20000 });
  } catch (e) { if ((e as { code?: string }).code === "P2002") throw new CameraError("CAMERA_TRANSFER_CONFLICT", 409); throw e; }
  for (const id of uniqueIds) stopCameraStreams(id);
  return { transferred: uniqueIds.length, companyId };
}

const discoveryBusy = new Set<string>();
export async function runCameraDiscovery(input: Record<string, unknown>, actor: CameraActor) {
  const ownerId = cameraOwner(actor);
  const companyId = await cameraCompany(input.companyId, actor);
  if (input.vpnConnectionId) {
    const subnet = cameraSubnet(input.cidr);
    await cameraVpnTarget(input.vpnConnectionId, subnet.addresses[0], actor, true);
    await cameraVpnTarget(input.vpnConnectionId, subnet.addresses[subnet.addresses.length - 1], actor, true);
  }
  if (discoveryBusy.has(ownerId)) throw new CameraError("CAMERA_DISCOVERY_BUSY", 409);
  const ports = input.ports === undefined ? undefined : Array.isArray(input.ports) ? input.ports.map((port) => cameraPort(port)) : [];
  if (ports && (!ports.length || ports.length > 8)) throw new CameraError("CAMERA_PORT_INVALID");
  discoveryBusy.add(ownerId);
  try {
    const result = await discoverCameras(input.cidr, ports);
    const registered = new Set((await prisma.cameraDevice.findMany({ where: { ownerId, companyId }, select: { host: true, onvifPort: true } })).map((camera) => `${camera.host}:${camera.onvifPort}`));
    await audit(actor, "camera.discovery_completed", null, { cidr: result.cidr, candidateCount: result.candidates.length, scannedAddresses: result.scannedAddresses, partial: result.partial });
    return { ...result, candidates: result.candidates.map((candidate) => ({ ...candidate, registered: registered.has(`${candidate.host}:${candidate.onvifPort}`) })) };
  } finally { discoveryBusy.delete(ownerId); }
}

export async function selectedCameraProfile(id: string, token: unknown, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true);
  const profile = cameraProfiles(camera).find((item) => item.token === token);
  if (!profile) throw new CameraError("CAMERA_PROFILE_NOT_FOUND", 404);
  return { camera, profile, connection: cameraConnection(camera) };
}

export async function getCameraPresets(id: string, token: string, actor: CameraActor) {
  const { camera, profile, connection } = await selectedCameraProfile(id, token, actor);
  if (!profile.ptz) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
  return cameraPresets(camera.host, profile.token, connection);
}

export async function previewCameraAction(id: string, input: Record<string, unknown>, actor: CameraActor) {
  const camera = await ownedCamera(id, actor), operation = cameraOperation(input.operation);
  if (actor.role === "viewer" || (operation === "reboot" && actor.role !== "admin")) throw new CameraError("CAMERA_CONTROL_FORBIDDEN", 403);
  if (operation.startsWith("nvr_")) {
    if (camera.kind !== "nvr" || camera.connectionMode !== "appweb" || camera.status !== "verified") throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422);
  } else if (camera.connectionMode !== "onvif" || camera.status !== "verified") throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 422);
  const parameters: Record<string, string> = {};
  if (operation === "nvr_overwrite" || operation === "nvr_recording_mode") {
    await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true);
    const change = nvrConfigChange({ setting: operation === "nvr_overwrite" ? "overwrite" : "recordingMode", value: input.value, channel: input.channel });
    const current = await readNvrSettings(camera, cameraConnection(camera), change.channel);
    if (!current.supported[change.setting]) throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422);
    parameters.setting = change.setting; parameters.value = change.value; parameters.channel = String(change.channel); parameters.configRevision = current.revision;
    parameters.previous = String(change.setting === "overwrite" ? current.overwrite : current.recordingMode);
  }
  if (operation === "ptz_step" || operation === "ptz_stop") {
    parameters.profileToken = optionalText(input.profileToken, 256);
    const { profile, connection } = await selectedCameraProfile(id, parameters.profileToken, actor);
    if (!profile.ptz) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
    if (operation === "ptz_step") { const step = cameraPtzStep(input.direction); await checkCameraPtzStep(camera.host, profile, step.direction, connection); parameters.direction = step.direction; }
  }
  if (operation === "goto_preset") {
    parameters.profileToken = optionalText(input.profileToken, 256); parameters.presetToken = optionalText(input.presetToken, 256);
    const presets = await getCameraPresets(id, parameters.profileToken, actor);
    const preset = presets.find((item) => item.token === parameters.presetToken);
    if (!preset) throw new CameraError("CAMERA_PRESET_NOT_FOUND", 404);
    parameters.presetName = preset.name;
  }
  const template = CAMERA_CONTROL_TEMPLATES[operation];
  const preview = { template: template.template, handler: template.handler, titleFa: template.labelFa, titleEn: template.labelEn, cameraName: camera.name, host: camera.host,
    effectFa: operation === "reboot" ? (camera.kind === "nvr" ? "NVR دوباره راه‌اندازی می‌شود؛ تصویر همهٔ کانال‌های آن موقتاً قطع می‌شود." : "دوربین دوباره راه‌اندازی می‌شود و تصویر موقتاً قطع خواهد شد.") : operation === "ptz_step" ? `یک گام کوتاه در جهت ${parameters.direction}؛ حرکت پیوسته فعال نمی‌شود.` : operation === "ptz_stop" ? "حرکت افقی، عمودی و زوم دستگاه متوقف می‌شود." : `دوربین به موقعیت «${parameters.presetName}» می‌رود.`,
    effectEn: operation === "reboot" ? "The device restarts; its video channels will disconnect temporarily." : operation === "ptz_step" ? `One bounded ${parameters.direction} step, not continuous movement.` : operation === "ptz_stop" ? "Stop pan, tilt and zoom movement." : `Move the camera to preset “${parameters.presetName}”.`, risk: template.risk, connectorInvoked: false };
  if (operation.startsWith("nvr_")) {
    preview.effectFa = operation === "nvr_overwrite" ? parameters.value === "OverWrite" ? "پس از پرشدن هارد، ضبط جدید روی قدیمی‌ترین ضبط‌ها بازنویسی می‌شود؛ ضبط‌های قدیمی به‌تدریج از دست می‌روند." : "با پرشدن هارد، ضبط جدید متوقف می‌شود؛ ممکن است رخدادهای بعدی ضبط نشوند." : `حالت ضبط کانال ${Number(parameters.channel) + 1} از ${parameters.previous} به ${parameters.value} تغییر می‌کند. ClosedRecord ضبط را متوقف می‌کند؛ ConfigRecord از زمان‌بندی فعلی پیروی می‌کند.`;
    preview.effectEn = operation === "nvr_overwrite" ? parameters.value === "OverWrite" ? "New recordings overwrite the oldest footage when storage is full." : "New recording stops when storage is full; future incidents may not be recorded." : `Channel ${Number(parameters.channel) + 1}: ${parameters.previous} → ${parameters.value}. ClosedRecord stops recording. ConfigRecord follows the existing schedule.`;
  }
  const plan = await prisma.cameraActionPlan.create({ data: { cameraId: id, ownerId: cameraOwner(actor), requestedBy: actor.username, operation, parametersJson: json(parameters), previewJson: json(preview), cameraRevision: cameraRevision(camera), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  await audit(actor, "camera.action_previewed", id, { planId: plan.id, operation, template: template.template });
  return { id: plan.id, status: plan.status, expiresAt: plan.expiresAt, preview };
}

export async function executeCameraAction(id: string, planId: string, input: Record<string, unknown>, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  const plan = await prisma.cameraActionPlan.findFirst({ where: { id: planId, cameraId: id, ownerId: cameraOwner(actor) } });
  if (!plan) throw new CameraError("CAMERA_PLAN_NOT_FOUND", 404);
  const policy = evaluateCameraPolicy({ plan, camera, ownerId: cameraOwner(actor), role: actor.role, intent: input.intent, confirmed: input.confirmed });
  const claimed = await prisma.cameraActionPlan.updateMany({ where: { id: plan.id, status: "preview_ready" }, data: { status: "executing" } });
  if (claimed.count !== 1) throw new CameraError("CAMERA_PLAN_ALREADY_USED", 409);
  await audit(actor, "camera.action_started", id, { planId, operation: policy.operation, policyGuard: "allowed", template: policy.template }, false);
  let result: Record<string, unknown> = { status: "failed", connectorInvoked: false, code: "CAMERA_OPERATION_UNSUPPORTED" };
  let connectorInvoked = false;
  try {
    await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true);
    const connection = cameraConnection(camera), parameters = plan.parametersJson as Record<string, string>;
    if (policy.operation === "nvr_overwrite" || policy.operation === "nvr_recording_mode") {
      const verified = await writeNvrSetting(camera, connection, parameters, parameters.configRevision, () => { connectorInvoked = true; });
      result = { status: "succeeded", connectorInvoked: true, accepted: true, verified: true, operation: policy.operation, template: policy.template, completedAt: new Date().toISOString(), settings: verified };
    } else if (policy.operation === "goto_preset") {
      const profile = cameraProfiles(camera).find((item) => item.token === parameters.profileToken && item.ptz);
      if (!profile || !parameters.presetToken) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
      connectorInvoked = true;
      await runCameraPreset(camera.host, profile.token, parameters.presetToken, connection);
    } else if (policy.operation === "ptz_step" || policy.operation === "ptz_stop") {
      const profile = cameraProfiles(camera).find(item => item.token === parameters.profileToken && item.ptz);
      if (!profile) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
      if (policy.operation === "ptz_step") await checkCameraPtzStep(camera.host, profile, parameters.direction, connection);
      connectorInvoked = true;
      if (policy.operation === "ptz_step") await runCameraPtzStep(camera.host, profile, parameters.direction, connection);
      else await stopCameraPtz(camera.host, profile.token, connection);
    } else { stopCameraStreams(id); connectorInvoked = true; await rebootCamera(camera.host, camera.onvifPort, camera.onvifPath, connection, camera.onvifHttps); }
    if (!policy.operation.startsWith("nvr_")) result = { status: "succeeded", connectorInvoked: true, accepted: true, operation: policy.operation, template: policy.template, completedAt: new Date().toISOString(), requiresReconnect: policy.operation === "reboot" };
  } catch (error) { result = { status: "failed", connectorInvoked, code: errorCode(error), operation: policy.operation, completedAt: new Date().toISOString() }; }
  await prisma.cameraActionPlan.update({ where: { id: plan.id }, data: { status: String(result.status), resultJson: json(result) } });
  await audit(actor, "camera.action_result", id, { planId, ...result }, false);
  if (result.status === "succeeded" && policy.operation === "reboot") await prisma.cameraDevice.update({ where: { id }, data: { status: "unverified", lastErrorCode: null } });
  return result;
}

export async function cameraActionHistory(id: string, actor: CameraActor) {
  await ownedCamera(id, actor);
  return prisma.cameraActionPlan.findMany({ where: { cameraId: id, ownerId: cameraOwner(actor) }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, operation: true, status: true, previewJson: true, resultJson: true, createdAt: true } });
}
