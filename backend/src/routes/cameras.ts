import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { CameraError } from "../cameras/camera-network.js";
import { cameraActionHistory, cameraOwner, createCamera, deleteCamera, executeCameraAction, getCameraPresets, listCameras, listCameraCompanies, ownedCamera, safeCamera, transferCameras, previewCameraAction, refreshCamera, runCameraDiscovery, selectedCameraProfile, updateCamera, type CameraActor } from "../cameras/camera.service.js";
import { getNvrMonitor, refreshNvrMonitor, stopNvrMonitor, type NvrReport } from "../cameras/nvr-monitor.js";
import { cameraFrame, cameraSnapshot, startCameraMedia, stopCameraStreams } from "../cameras/camera-media.js";
import { listCameraRecordings, cameraPlaybackClip } from "../cameras/camera-playback.service.js";
import { readNvrSettings, nvrChannel } from "../cameras/nvr-config.js";
import { cameraConnection, cameraVpnTarget } from "../cameras/camera.service.js";
import { diagnoseNvrDisks } from "../cameras/nvr-diagnostics.js";
import { cameraThumbnails, THUMBNAIL_INTERVAL_MS } from "../cameras/camera-thumbnail-cache.js";
import { resizeCameraThumbnail } from "../cameras/camera-thumbnail.js";
import { cameraRevision } from "../cameras/camera-policy.js";
import { readNvrChannels } from "../cameras/nvr-channel-control.js";

function actor(request: FastifyRequest): CameraActor {
  if (!request.authUser) throw new CameraError("AUTH_REQUIRED", 401);
  return request.authUser;
}
function failure(reply: FastifyReply, error: unknown) {
  const safe = error instanceof CameraError ? error : new CameraError("CAMERA_REQUEST_FAILED", 500);
  return reply.code(safe.statusCode).send({ error: { code: safe.code, message: safe.code } });
}

export const cameraRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onClose", async () => { cameraThumbnails.clear(); stopCameraStreams(); await stopNvrMonitor(); });
  app.get<{Params:{id:string}}>("/api/cameras/:id/nvr/channels",async(request,reply)=>{
    reply.header("Cache-Control","private, no-store");
    try{const user=actor(request),camera=await ownedCamera(request.params.id,user);await cameraVpnTarget(camera.vpnConnectionId,camera.host,user,true);return await readNvrChannels(camera,cameraConnection(camera));}catch(error){return failure(reply,error);}
  });
  app.get<{ Params: { id: string }; Querystring: { profile: string } }>("/api/cameras/:id/thumbnail", {
    schema:{querystring:{type:"object",required:["profile"],additionalProperties:false,properties:{profile:{type:"string",minLength:1,maxLength:256}}}}
  }, async(request,reply)=>{
    reply.header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff");
    try {
      const user=actor(request),{camera,profile,connection}=await selectedCameraProfile(request.params.id,request.query.profile,user);
      if(camera.status!=="verified")throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE",422);
      if(!profile.streamAvailable&&!profile.snapshotAvailable)throw new CameraError("CAMERA_STREAM_UNAVAILABLE",422);
      const revision=cameraRevision(camera);
      const result=await cameraThumbnails.get({ownerId:cameraOwner(user),cameraId:camera.id,profile:profile.token,revision},async()=>resizeCameraThumbnail(await cameraSnapshot({ownerId:cameraOwner(user),cameraId:camera.id,host:camera.host,profile:profile.token,connection})));
      const current=await ownedCamera(camera.id,user);
      if(cameraRevision(current)!==revision)throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE",409);
      return reply.header("X-Camera-Captured-At",new Date(result.capturedAt).toISOString()).header("X-Camera-Stale",String(result.stale)).header("X-Camera-Refresh-After",String(result.stale?300_000:Math.max(1000,THUMBNAIL_INTERVAL_MS-(Date.now()-result.capturedAt)))).header("Access-Control-Expose-Headers","X-Camera-Captured-At, X-Camera-Stale, X-Camera-Refresh-After").type("image/jpeg").send(result.bytes);
    } catch(error){reply.header("Retry-After","30");return failure(reply,error);}
  });
  app.get<{ Params: { id: string }; Querystring: { channel?: number } }>("/api/cameras/:id/nvr/settings", async (request, reply) => {
    try { const who = actor(request), camera = await ownedCamera(request.params.id, who); await cameraVpnTarget(camera.vpnConnectionId, camera.host, who, true); return await readNvrSettings(camera, cameraConnection(camera), nvrChannel(request.query.channel)); }
    catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string } }>("/api/cameras/:id/nvr/diagnostics", async (request, reply) => {
    try { const data = await refreshNvrMonitor(request.params.id, actor(request)); return diagnoseNvrDisks(data.report as NvrReport | null); }
    catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string } }>("/api/cameras/:id/recordings", async (request, reply) => {
    try { return await listCameraRecordings(request.params.id, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string }; Body: { recordingToken: string; start: string; duration: number } }>("/api/cameras/:id/playback/export", { bodyLimit: 2048,
    schema: { body: { type: "object", required: ["recordingToken", "start", "duration"], additionalProperties: false, properties: { recordingToken: { type: "string", minLength: 1, maxLength: 256 }, start: { type: "string", maxLength: 40 }, duration: { type: "integer", minimum: 5, maximum: 60 } } } }
  }, async (request, reply) => {
    const controller = new AbortController(), close = () => controller.abort(); reply.raw.once("close", close);
    try { const clip = await cameraPlaybackClip(request.params.id, request.body, actor(request), controller.signal, true);
      return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").header("Content-Disposition", 'attachment; filename="recording.mp4"').type("video/mp4").send(clip);
    } catch (error) { return failure(reply, error); } finally { reply.raw.off("close", close); }
  });
  app.get<{ Params: { id: string }; Querystring: { recordingToken: string; start: string; duration: number } }>("/api/cameras/:id/playback", {
    schema: { querystring: { type: "object", required: ["recordingToken", "start"], additionalProperties: false, properties: { recordingToken: { type: "string", minLength: 1, maxLength: 256 }, start: { type: "string", maxLength: 40 }, duration: { type: "integer", minimum: 5, maximum: 60 } } } }
  }, async (request, reply) => {
    const controller = new AbortController(), close = () => controller.abort(); reply.raw.once("close", close);
    try {
      const clip = await cameraPlaybackClip(request.params.id, request.query, actor(request), controller.signal);
      reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").type("video/mp4");
      return reply.send(clip);
    } catch (error) { return failure(reply, error); }
    finally { reply.raw.off("close", close); }
  });
  app.get("/api/cameras/companies", async (request, reply) => {
    try { return await listCameraCompanies(actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Body: { ids: string[]; companyId: string } }>("/api/cameras/transfer", { bodyLimit: 40000 }, async (request, reply) => {
    try { return await transferCameras(request.body?.ids, request.body?.companyId, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string } }>("/api/cameras/:id", async (request, reply) => {
    try { return { camera: safeCamera(await ownedCamera(request.params.id, actor(request))) }; } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string } }>("/api/cameras/:id/monitor", async (request, reply) => {
    try { return await getNvrMonitor(request.params.id, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string } }>("/api/cameras/:id/monitor/refresh", async (request, reply) => {
    try { return await refreshNvrMonitor(request.params.id, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string }; Querystring: { profile?: string } }>("/api/cameras/:id/frame", async (request, reply) => {
    try {
      const user = actor(request), { camera, profile, connection } = await selectedCameraProfile(request.params.id, request.query.profile, user);
      if (!profile.streamAvailable) throw new CameraError("CAMERA_STREAM_UNAVAILABLE", 422);
      const frame = await cameraFrame({ ownerId: cameraOwner(user), cameraId: camera.id, host: camera.host, profile: profile.token, connection });
      return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").type("image/jpeg").send(frame);
    } catch (error) { return failure(reply, error); }
  });
  app.get<{ Querystring: { companyId?: string } }>("/api/cameras", async (request, reply) => {
    try { return { cameras: await listCameras(actor(request), request.query.companyId) }; } catch (error) { return failure(reply, error); }
  });
  app.post<{ Body: Record<string, unknown> }>("/api/cameras", async (request, reply) => {
    try { return reply.code(201).send({ camera: await createCamera(request.body ?? {}, actor(request)) }); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Body: Record<string, unknown> }>("/api/cameras/discover", async (request, reply) => {
    try { return await runCameraDiscovery(request.body ?? {}, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/cameras/:id", async (request, reply) => {
    try { return { camera: await updateCamera(request.params.id, request.body ?? {}, actor(request)) }; } catch (error) { return failure(reply, error); }
  });
  app.delete<{ Params: { id: string } }>("/api/cameras/:id", async (request, reply) => {
    try { return await deleteCamera(request.params.id, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string } }>("/api/cameras/:id/refresh", async (request, reply) => {
    try { return { camera: await refreshCamera(request.params.id, actor(request)) }; } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string }; Querystring: { profile?: string } }>("/api/cameras/:id/presets", async (request, reply) => {
    try { return { presets: await getCameraPresets(request.params.id, String(request.query.profile ?? ""), actor(request)) }; } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string } }>("/api/cameras/:id/actions", async (request, reply) => {
    try { return { actions: await cameraActionHistory(request.params.id, actor(request)) }; } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/cameras/:id/actions/preview", async (request, reply) => {
    try { return await previewCameraAction(request.params.id, request.body ?? {}, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { id: string; planId: string }; Body: Record<string, unknown> }>("/api/cameras/:id/actions/:planId/execute", async (request, reply) => {
    try { return await executeCameraAction(request.params.id, request.params.planId, request.body ?? {}, actor(request)); } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string }; Querystring: { profile?: string } }>("/api/cameras/:id/snapshot", async (request, reply) => {
    try {
      const user = actor(request), { camera, profile, connection } = await selectedCameraProfile(request.params.id, request.query.profile, user);
      const buffer = await cameraSnapshot({ ownerId: cameraOwner(user), cameraId: camera.id, host: camera.host, profile: profile.token, connection });
      return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").type("image/jpeg").send(buffer);
    } catch (error) { return failure(reply, error); }
  });
  app.get<{ Params: { id: string }; Querystring: { profile?: string } }>("/api/cameras/:id/live", async (request, reply) => {
    try {
      const user = actor(request), { camera, profile, connection } = await selectedCameraProfile(request.params.id, request.query.profile, user);
      if (!profile.streamAvailable) throw new CameraError("CAMERA_STREAM_UNAVAILABLE", 422);
      const job = await startCameraMedia({ ownerId: cameraOwner(user), cameraId: camera.id, host: camera.host, profile: profile.token, connection });
      if (reply.raw.destroyed || request.raw.destroyed && request.raw.aborted) { job.stop(); return reply; }
      reply.raw.once("close", job.stop);
      return reply.header("Cache-Control", "private, no-store").header("X-Accel-Buffering", "no").header("X-Content-Type-Options", "nosniff")
        .type("multipart/x-mixed-replace; boundary=firewall-camera").send(job.stream);
    } catch (error) { return failure(reply, error); }
  });
};
