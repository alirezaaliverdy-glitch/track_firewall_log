import type { FastifyPluginAsync } from "fastify";
import { getLinuxMetrics, getLinuxMonitoringDevice, getLinuxMonitoringSummary, listLinuxMonitoringDevices, refreshLinuxHealth } from "../monitoring/linux/linux-health.service.js";
import { monitoringOperations } from "../monitoring/operations.service.js";

export const linuxHealthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { page?: number } }>("/api/monitoring/operations", { schema: { querystring: { type: "object", additionalProperties: false, properties: { page: { type: "integer", minimum: 0, maximum: 10000, default: 0 } } } } }, async (request,reply) => {
    if (!request.authUser) return reply.code(401).send({ error: "AUTH_REQUIRED" });
    return monitoringOperations(request.authUser.scopeOwnerId ?? request.authUser.id,request.query.page ?? 0);
  });
  app.get("/api/monitoring/linux/summary", async () => getLinuxMonitoringSummary());
  app.get("/api/monitoring/linux/devices", async () => ({ devices: await listLinuxMonitoringDevices() }));
  app.get<{ Params: { deviceId: string } }>("/api/monitoring/linux/devices/:deviceId", async (request, reply) => (await getLinuxMonitoringDevice(request.params.deviceId)) ?? reply.code(404).send({ error: "Device not found" }));
  app.get<{ Params: { deviceId: string }; Querystring: { hours?: string } }>("/api/monitoring/linux/devices/:deviceId/metrics", async (request) => ({ metrics: await getLinuxMetrics(request.params.deviceId, Number(request.query.hours ?? 24)) }));
  app.post<{ Params: { deviceId: string } }>("/api/monitoring/linux/devices/:deviceId/refresh", async (request, reply) => { try { return await refreshLinuxHealth(request.params.deviceId); } catch (error) { return reply.code(400).send({ error: "Linux health collection failed", detail: error instanceof Error ? error.message : "Unknown error" }); } });
};
