import { ownedCamera, cameraConnection, cameraOwner, cameraVpnTarget, type CameraActor } from "./camera.service.js";
import { recordingInventory, prepareReplay } from "./camera-replay.js";
import { recordedCameraClip } from "./camera-media.js";
import { CameraError } from "./camera-network.js";
import { prisma } from "../db/prisma.js";

const inFlight = new Set<string>();
async function device(id: string, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  await cameraVpnTarget(camera.vpnConnectionId, camera.host, actor, true);
  return camera;
}
export async function listCameraRecordings(id: string, actor: CameraActor) {
  const camera = await device(id, actor);
  if (inFlight.has(cameraOwner(actor))) throw new CameraError("CAMERA_REPLAY_BUSY", 429);
  inFlight.add(cameraOwner(actor));
  try {
    const data = await recordingInventory(camera, cameraConnection(camera));
    return { supported: true, protocol: "onvif-profile-g", recordings: data.recordings, truncated: data.truncated, maxClipSeconds: 60 };
  } finally { inFlight.delete(cameraOwner(actor)); }
}
export async function cameraPlaybackClip(id: string, input: Record<string, unknown>, actor: CameraActor, signal: AbortSignal, exporting = false) {
  if (exporting && !["operator", "admin"].includes(actor.role)) throw new CameraError("CAMERA_CONTROL_FORBIDDEN", 403);
  const camera = await device(id, actor), ownerId = cameraOwner(actor);
  if (inFlight.has(ownerId)) throw new CameraError("CAMERA_REPLAY_BUSY", 429);
  inFlight.add(ownerId);
  try {
    const connection = cameraConnection(camera), replay = await prepareReplay(camera, connection, input);
    const clip = await recordedCameraClip({ ownerId, cameraId: id, host: camera.host, connection, ...replay, signal });
    await prisma.auditLog.create({ data: { actor: actor.username, action: exporting ? "camera.recording_exported" : "camera.recording_viewed", targetType: "camera", targetId: id, dryRun: false, approvalStatus: "not_required", metadata: { ownerId, start: replay.start, durationSeconds: replay.duration, bytes: clip.length, connectorInvoked: true, readOnly: true } } });
    return clip;
  } finally { inFlight.delete(ownerId); }
}
