import type { CameraDevice, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "../services/credential-crypto.service.js";
import { cameraPort, cameraUrl, privateCameraHost, CameraError } from "./camera-network.js";
import { inspectCamera, discoverCameras, cameraPresets, rebootCamera, runCameraPreset, type CameraConnection, type CameraProfile } from "./camera-onvif.js";
import { cameraSnapshot, stopCameraStreams } from "./camera-media.js";
import { cameraOperation, cameraRevision, CAMERA_CONTROL_TEMPLATES, evaluateCameraPolicy } from "./camera-policy.js";

export type CameraActor = { id: string; username: string; role: string; scopeOwnerId?: string | null };
export const cameraOwner = (actor: CameraActor) => actor.scopeOwnerId ?? actor.id;
export const cameraProfiles = (camera: Pick<CameraDevice, "profilesJson">) => Array.isArray(camera.profilesJson) ? camera.profilesJson as unknown as CameraProfile[] : [];
const json = (value: unknown) => value as Prisma.InputJsonValue;

export function cameraConnection(camera: Pick<CameraDevice, "connectionEncrypted">): CameraConnection {
  try { return JSON.parse(decryptSecret(camera.connectionEncrypted) ?? "{}"); } catch { throw new CameraError("CAMERA_CREDENTIAL_UNAVAILABLE", 422); }
}

function safeCamera(camera: CameraDevice) {
  const { connectionEncrypted, ...data } = camera;
  return { ...data, credentialsConfigured: Boolean(connectionEncrypted), profiles: cameraProfiles(camera), profilesJson: undefined };
}

function optionalText(value: unknown, max = 160) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function devicePath(value: unknown) {
  const path = optionalText(value, 256) || "/onvif/device_service";
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..")) throw new CameraError("CAMERA_PATH_INVALID");
  return path;
}
function errorCode(error: unknown) { return error instanceof CameraError ? error.code : "CAMERA_CONNECTION_FAILED"; }

export async function ownedCamera(id: string, actor: CameraActor) {
  const camera = await prisma.cameraDevice.findFirst({ where: { id, ownerId: cameraOwner(actor) } });
  if (!camera) throw new CameraError("CAMERA_NOT_FOUND", 404);
  return camera;
}

async function audit(actor: CameraActor, action: string, cameraId: string | null, metadata: Record<string, unknown>, dryRun = true) {
  await prisma.auditLog.create({ data: { actor: actor.username, action, targetType: "camera", targetId: cameraId, dryRun, approvalStatus: dryRun ? "not_required" : "approved", metadata: json({ ownerId: cameraOwner(actor), ...metadata }) } });
}

export async function listCameras(actor: CameraActor) {
  return (await prisma.cameraDevice.findMany({ where: { ownerId: cameraOwner(actor) }, orderBy: { createdAt: "desc" }, take: 256 })).map(safeCamera);
}

export async function createCamera(input: Record<string, unknown>, actor: CameraActor) {
  const host = privateCameraHost(input.host), onvifPort = cameraPort(input.onvifPort), onvifPath = devicePath(input.onvifPath);
  const name = optionalText(input.name) || host, location = optionalText(input.location);
  const connectionMode = input.connectionMode === "rtsp" ? "rtsp" : "onvif";
  const connection: CameraConnection = { username: optionalText(input.username), password: typeof input.password === "string" ? input.password : undefined };
  if ((connection.username?.length ?? 0) > 128 || (connection.password?.length ?? 0) > 1024) throw new CameraError("CAMERA_CREDENTIAL_INVALID");
  if (connectionMode === "rtsp") connection.rtspUrl = cameraUrl(input.rtspUrl, host, ["rtsp:"]).href;
  if (await prisma.cameraDevice.count({ where: { ownerId: cameraOwner(actor) } }) >= 256) throw new CameraError("CAMERA_DEVICE_LIMIT", 409);
  let camera: CameraDevice;
  try {
    camera = await prisma.cameraDevice.create({ data: { ownerId: cameraOwner(actor), host, onvifPort, onvifPath, name, location,
      kind: input.kind === "nvr" ? "nvr" : "camera", connectionMode, onvifHttps: input.onvifHttps === true, connectionEncrypted: encryptSecret(JSON.stringify(connection)),
      profilesJson: connectionMode === "rtsp" ? json([{ token: "manual", sourceToken: "manual", name, ptz: false, streamAvailable: true, snapshotAvailable: false, width: null, height: null, fps: null, encoding: null }]) : json([]) } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new CameraError("CAMERA_ALREADY_REGISTERED", 409);
    throw error;
  }
  await audit(actor, "camera.registered", camera.id, { host, connectionMode });
  return connectionMode === "onvif" ? refreshCamera(camera.id, actor) : safeCamera(camera);
}

export async function refreshCamera(id: string, actor: CameraActor) {
  const camera = await ownedCamera(id, actor), connection = cameraConnection(camera);
  try {
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
  if (input.name !== undefined) { const name = optionalText(input.name); if (!name) throw new CameraError("CAMERA_NAME_REQUIRED"); data.name = name; }
  if (input.location !== undefined) data.location = optionalText(input.location);
  const connection = cameraConnection(camera);
  const connectionChanged = ["username", "password", "onvifPort", "onvifPath", "onvifHttps", "rtspUrl"].some((key) => input[key] !== undefined);
  if (input.username !== undefined) connection.username = optionalText(input.username, 128);
  if (input.password !== undefined) { if (typeof input.password !== "string" || input.password.length > 1024) throw new CameraError("CAMERA_CREDENTIAL_INVALID"); connection.password = input.password; }
  if (input.rtspUrl !== undefined) connection.rtspUrl = cameraUrl(input.rtspUrl, camera.host, ["rtsp:"]).href;
  if (input.onvifPort !== undefined) data.onvifPort = cameraPort(input.onvifPort);
  if (input.onvifPath !== undefined) data.onvifPath = devicePath(input.onvifPath);
  if (input.onvifHttps !== undefined) data.onvifHttps = input.onvifHttps === true;
  if (connectionChanged) { data.connectionEncrypted = encryptSecret(JSON.stringify(connection)); data.status = "unverified"; data.lastErrorCode = null; stopCameraStreams(id); }
  const updated = await prisma.cameraDevice.update({ where: { id }, data });
  await audit(actor, "camera.updated", id, { connectionChanged });
  return safeCamera(updated);
}

export async function deleteCamera(id: string, actor: CameraActor) {
  await ownedCamera(id, actor); stopCameraStreams(id);
  await prisma.cameraDevice.delete({ where: { id } });
  await audit(actor, "camera.removed", id, {});
  return { deleted: true };
}

const discoveryBusy = new Set<string>();
export async function runCameraDiscovery(input: Record<string, unknown>, actor: CameraActor) {
  const ownerId = cameraOwner(actor);
  if (discoveryBusy.has(ownerId)) throw new CameraError("CAMERA_DISCOVERY_BUSY", 409);
  const ports = input.ports === undefined ? undefined : Array.isArray(input.ports) ? input.ports.map((port) => cameraPort(port)) : [];
  if (ports && (!ports.length || ports.length > 8)) throw new CameraError("CAMERA_PORT_INVALID");
  discoveryBusy.add(ownerId);
  try {
    const result = await discoverCameras(input.cidr, ports);
    const registered = new Set((await prisma.cameraDevice.findMany({ where: { ownerId }, select: { host: true, onvifPort: true } })).map((camera) => `${camera.host}:${camera.onvifPort}`));
    await audit(actor, "camera.discovery_completed", null, { cidr: result.cidr, candidateCount: result.candidates.length, scannedAddresses: result.scannedAddresses, partial: result.partial });
    return { ...result, candidates: result.candidates.map((candidate) => ({ ...candidate, registered: registered.has(`${candidate.host}:${candidate.onvifPort}`) })) };
  } finally { discoveryBusy.delete(ownerId); }
}

export async function selectedCameraProfile(id: string, token: unknown, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
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
  if (camera.connectionMode !== "onvif" || camera.status !== "verified") throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 422);
  const parameters: Record<string, string> = {};
  if (operation === "goto_preset") {
    parameters.profileToken = optionalText(input.profileToken, 256); parameters.presetToken = optionalText(input.presetToken, 256);
    const presets = await getCameraPresets(id, parameters.profileToken, actor);
    const preset = presets.find((item) => item.token === parameters.presetToken);
    if (!preset) throw new CameraError("CAMERA_PRESET_NOT_FOUND", 404);
    parameters.presetName = preset.name;
  }
  const template = CAMERA_CONTROL_TEMPLATES[operation];
  const preview = { template: template.template, handler: template.handler, titleFa: template.labelFa, titleEn: template.labelEn, cameraName: camera.name, host: camera.host,
    effectFa: operation === "reboot" ? (camera.kind === "nvr" ? "NVR دوباره راه‌اندازی می‌شود؛ تصویر همهٔ کانال‌های آن موقتاً قطع می‌شود." : "دوربین دوباره راه‌اندازی می‌شود و تصویر موقتاً قطع خواهد شد.") : `دوربین به موقعیت «${parameters.presetName}» می‌رود.`,
    effectEn: operation === "reboot" ? "The device restarts; its video channels will disconnect temporarily." : `Move the camera to preset “${parameters.presetName}”.`, risk: template.risk, connectorInvoked: false };
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
  let result: Record<string, unknown>;
  let connectorInvoked = false;
  try {
    const connection = cameraConnection(camera), parameters = plan.parametersJson as Record<string, string>;
    if (policy.operation === "goto_preset") {
      const profile = cameraProfiles(camera).find((item) => item.token === parameters.profileToken && item.ptz);
      if (!profile || !parameters.presetToken) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
      connectorInvoked = true;
      await runCameraPreset(camera.host, profile.token, parameters.presetToken, connection);
    } else { stopCameraStreams(id); connectorInvoked = true; await rebootCamera(camera.host, camera.onvifPort, camera.onvifPath, connection, camera.onvifHttps); }
    result = { status: "succeeded", connectorInvoked: true, accepted: true, operation: policy.operation, template: policy.template, completedAt: new Date().toISOString(), requiresReconnect: policy.operation === "reboot" };
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
