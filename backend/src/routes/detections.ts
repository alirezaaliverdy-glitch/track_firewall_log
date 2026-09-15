import type { FastifyPluginAsync } from "fastify";
import { runDetections, listDetectionRules, updateDetectionRule } from "../services/detection.service.js";

function parsePositiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const detectionRoutes: FastifyPluginAsync = async (app) => {
  const runHandler = async (request: {
    body?: {
      batchId?: string;
      deviceId?: string;
      sourceId?: string;
      timeWindowMinutes?: number;
    };
  }) => runDetections({
    batchId: typeof request.body?.batchId === "string" ? request.body.batchId : undefined,
    deviceId: typeof request.body?.deviceId === "string" ? request.body.deviceId : undefined,
    sourceId: typeof request.body?.sourceId === "string" ? request.body.sourceId : undefined,
    timeWindowMinutes: parsePositiveInteger(request.body?.timeWindowMinutes)
  });

  app.post<{
    Body: {
      batchId?: string;
      deviceId?: string;
      sourceId?: string;
      timeWindowMinutes?: number;
    };
  }>("/api/detections/run", runHandler);

  app.post<{
    Body: {
      batchId?: string;
      deviceId?: string;
      sourceId?: string;
      timeWindowMinutes?: number;
    };
  }>("/api/detection/run", runHandler);

  app.get("/api/detection-rules", async () => listDetectionRules());

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/detection-rules/:id",
    async (request, reply) => {
      try {
        return await updateDetectionRule(request.params.id, request.body ?? {});
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update detection rule";
        const statusCode = message.includes("Record to update not found") ? 404 : 400;
        return reply.code(statusCode).send({
          error: statusCode === 404 ? "Detection rule not found" : "Failed to update detection rule",
          detail: message
        });
      }
    }
  );
};
