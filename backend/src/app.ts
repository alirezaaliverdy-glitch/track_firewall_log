import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError } from "fastify";
import { env, isProduction, maxUploadBytes } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { actionRoutes } from "./routes/actions.js";
import { loggerConfig } from "./lib/logger.js";
import { analysisRoutes } from "./routes/analysis.js";
import { aiRoutes } from "./routes/ai.js";
import { deviceRoutes } from "./routes/devices.js";
import { connectorPlanRoutes } from "./routes/connector-plans.js";
import { credentialRoutes } from "./routes/credentials.js";
import { detectionRoutes } from "./routes/detections.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { incidentRoutes } from "./routes/incidents.js";
import { jobRoutes } from "./routes/jobs.js";
import { uploadRoutes } from "./routes/uploads.js";

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: maxUploadBytes
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  });
  await app.register(multipart, {
    limits: {
      fileSize: maxUploadBytes,
      files: 1
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    request.log.error(
      {
        err: {
          name: error.name,
          message: error.message,
          code: error.code,
          statusCode
        }
      },
      "Request failed"
    );

    const message =
      statusCode === 413 || error.code === "FST_REQ_FILE_TOO_LARGE"
        ? `File is too large. Maximum upload size is ${env.maxUploadMb}MB.`
        : statusCode >= 500
          ? "Internal server error"
          : error.message;

    return reply.code(statusCode).send({
      error: message,
      ...(isProduction ? {} : { code: error.code })
    });
  });

  await app.register(healthRoutes);
  await app.register(actionRoutes);
  await app.register(connectorPlanRoutes);
  await app.register(credentialRoutes);
  await app.register(uploadRoutes);
  await app.register(jobRoutes);
  await app.register(analysisRoutes);
  await app.register(aiRoutes);
  await app.register(deviceRoutes);
  await app.register(eventRoutes);
  await app.register(detectionRoutes);
  await app.register(incidentRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
