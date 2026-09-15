import type { FastifyPluginAsync } from "fastify";
import {
  getCollectorStatus,
  listCollectors,
  runCollectorOnce,
  setCollectorEnabled
} from "../services/collector.service.js";

export const collectorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/collectors", async () => listCollectors());

  app.get<{ Params: { deviceId: string } }>("/api/collectors/:deviceId/status", async (request, reply) => {
    const status = await getCollectorStatus(request.params.deviceId);
    if (!status) return reply.code(404).send({ error: "Device not found" });
    return status;
  });

  app.post<{ Params: { deviceId: string } }>("/api/collectors/:deviceId/enable", async (request, reply) => {
    const result = await setCollectorEnabled(request.params.deviceId, true);
    if (!result) return reply.code(404).send({ error: "Device not found" });
    return result;
  });

  app.post<{ Params: { deviceId: string } }>("/api/collectors/:deviceId/disable", async (request, reply) => {
    const result = await setCollectorEnabled(request.params.deviceId, false);
    if (!result) return reply.code(404).send({ error: "Device not found" });
    return result;
  });

  app.post<{ Params: { deviceId: string } }>("/api/collectors/:deviceId/run-once", async (request, reply) => {
    try {
      const result = await runCollectorOnce(request.params.deviceId);
      if (!result) return reply.code(404).send({ error: "Device not found" });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collector failed";
      const statusCode = message === "COLLECTOR_NOT_FOUND" ? 404 : 400;
      return reply.code(statusCode).send({ error: message, detail: message });
    }
  });
};
