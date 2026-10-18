import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { CameraError } from "../cameras/camera-network.js";
import { cameraActionHistory, cameraOwner, createCamera, deleteCamera, executeCameraAction, getCameraPresets, listCameras, listCameraCompanies, ownedCamera, safeCamera, transferCameras, previewCameraAction, refreshCamera, runCameraDiscovery, selectedCameraProfile, updateCamera, type CameraActor } from "../cameras/camera.service.js";
import { getNvrMonitor, refreshNvrMonitor, stopNvrMonitor } from "../cameras/nvr-monitor.js";
import { cameraFrame, cameraSnapshot, startCameraMedia, stopCameraStreams } from "../cameras/camera-media.js";

function actor(request: FastifyRequest): CameraActor {
  if (!request.authUser) throw new CameraError("AUTH_REQUIRED", 401);
  return request.authUser;
}
function failure(reply: FastifyReply, error: unknown) {
  const safe = error instanceof CameraError ? error : new CameraError("CAMERA_REQUEST_FAILED", 500);
  return reply.code(safe.statusCode).send({ error: { code: safe.code, message: safe.code } });
}

export const cameraRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onClose", async () => { stopCameraStreams(); await stopNvrMonitor(); });
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
