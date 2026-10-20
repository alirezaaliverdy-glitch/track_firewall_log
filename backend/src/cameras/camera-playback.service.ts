import { ownedCamera, cameraConnection, cameraOwner, cameraVpnTarget, activeCameraScope, type CameraActor } from "./camera.service.js";
import { recordingInventory, prepareReplay } from "./camera-replay.js";
import { recordedCameraClip, reserveCameraReplay } from "./camera-media.js";
import { CameraError } from "./camera-network.js";
import { prisma } from "../db/prisma.js";
import { taoshiInventory, taoshiRecordings, taoshiClip, checkTaoshiFiles, taoshiWallTime } from "./nvr-taoshi.js";

type ReplayDevice = Awaited<ReturnType<typeof device>>;
async function nativeSource(camera: ReplayDevice, actor: CameraActor) {
  const candidates=camera.kind==="nvr"&&camera.connectionMode==="appweb"?[camera]:await prisma.cameraDevice.findMany({where:{...activeCameraScope(actor),companyId:camera.companyId,kind:"nvr",connectionMode:"appweb"},take:5});
  if(candidates.length>4)throw new CameraError("CAMERA_RECORDING_MAPPING_REQUIRED",422);
  const matches=[];
  for(const recorder of candidates){
    await cameraVpnTarget(recorder.vpnConnectionId,recorder.host,actor,true);
    const connection=cameraConnection(recorder),inventory=await taoshiInventory(recorder,connection);
    const channels=camera.id===recorder.id?inventory.channels:inventory.channels.filter(c=>c.address===camera.host);
    if(channels.length)matches.push({recorder,connection,inventory,channels});
  }
  if(matches.length!==1 || camera.kind!=="nvr"&&matches[0].channels.length!==1)throw new CameraError("CAMERA_RECORDING_MAPPING_REQUIRED",422);
  return matches[0];
}
const nativeFallback=(error: unknown)=>error instanceof CameraError&&["CAMERA_REPLAY_UNSUPPORTED","CAMERA_ONVIF_UNAVAILABLE","CAMERA_XML_INVALID","CAMERA_OPERATION_UNSUPPORTED","CAMERA_TIMEOUT","CAMERA_CONNECTION_FAILED"].includes(error.code);

const inFlight = new Set<string>();
async function device(id: string, actor: CameraActor) {
  const camera = await ownedCamera(id, actor);
  // Ownership first; validate the actual archive source's route, not the live camera's route.
  return camera;
}
export async function listCameraRecordings(id: string, actor: CameraActor) {
  const camera = await device(id, actor);
  if (inFlight.has(cameraOwner(actor))) throw new CameraError("CAMERA_REPLAY_BUSY", 429);
  inFlight.add(cameraOwner(actor));
  try {
    if(camera.connectionMode!=="appweb") {
      try{await cameraVpnTarget(camera.vpnConnectionId,camera.host,actor,true);const data=await recordingInventory(camera,cameraConnection(camera));if(data.recordings.length)return{supported:true,protocol:"onvif-profile-g",recordings:data.recordings,truncated:data.truncated,maxClipSeconds:60};}
      catch(error){if(!nativeFallback(error))throw error;}
    }
    const source=await nativeSource(camera,actor);
    return {supported:true,protocol:"taoshi-direct",timeBasis:"device-local",deviceLocalTime:source.inventory.clock,recorderName:source.recorder.name,recordings:taoshiRecordings(source.recorder,source.channels),truncated:false,maxClipSeconds:15};
  } finally { inFlight.delete(cameraOwner(actor)); }
}
export async function cameraPlaybackClip(id: string, input: Record<string, unknown>, actor: CameraActor, signal: AbortSignal, exporting = false) {
  if (exporting && !["operator", "admin"].includes(actor.role)) throw new CameraError("CAMERA_CONTROL_FORBIDDEN", 403);
  const camera = await device(id, actor), ownerId = cameraOwner(actor);
  if (inFlight.has(ownerId)) throw new CameraError("CAMERA_REPLAY_BUSY", 429);
  inFlight.add(ownerId);
  try {
    if(typeof input.recordingToken==="string"&&input.recordingToken.startsWith("taoshi:")) {
      const source=await nativeSource(camera,actor),recordings=taoshiRecordings(source.recorder,source.channels);
      const item=recordings.find(r=>r.token===input.recordingToken);
      if(!item)throw new CameraError("CAMERA_RECORDING_NOT_FOUND",404);
      const wall=taoshiWallTime(String(input.start)),start=wall.replace(" ","T")+".000Z",duration=Number(input.duration??15);
      if(!Number.isInteger(duration)||duration<5||duration>15||Date.parse(start)>Date.parse(source.inventory.clock.replace(" ","T")+"Z"))throw new CameraError("CAMERA_REPLAY_WINDOW_INVALID");
      const end=new Date(Date.parse(start)+duration*1000).toISOString(),channel=Number(item.source.split(":")[1]);
      await checkTaoshiFiles(source.recorder,source.connection,channel,start,end);
      const release=reserveCameraReplay(ownerId);
      let clip: Buffer;
      try{clip=await taoshiClip({camera:source.recorder,port:source.inventory.port,connection:source.connection,channel,start,end,duration,signal});}
      finally{release();}
      await prisma.auditLog.create({data:{actor:actor.username,action:exporting?"camera.recording_exported":"camera.recording_viewed",targetType:"camera",targetId:id,dryRun:false,approvalStatus:"not_required",metadata:{ownerId,recorderId:source.recorder.id,channel,start,durationSeconds:duration,timeBasis:"device-local",bytes:clip.length,connectorInvoked:true,readOnly:true}}});
      return clip;
    }
    await cameraVpnTarget(camera.vpnConnectionId,camera.host,actor,true);
    const connection = cameraConnection(camera), replay = await prepareReplay(camera, connection, input);
    const clip = await recordedCameraClip({ ownerId, cameraId: id, host: camera.host, connection, ...replay, signal });
    await prisma.auditLog.create({ data: { actor: actor.username, action: exporting ? "camera.recording_exported" : "camera.recording_viewed", targetType: "camera", targetId: id, dryRun: false, approvalStatus: "not_required", metadata: { ownerId, start: replay.start, durationSeconds: replay.duration, bytes: clip.length, connectorInvoked: true, readOnly: true } } });
    return clip;
  } finally { inFlight.delete(ownerId); }
}
