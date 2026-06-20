import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError } from "fastify";
import { env, isProduction, maxUploadBytes } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { loggerConfig } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { uploadRoutes } from "./routes/uploads.js";

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: maxUploadBytes
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"]
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
  await app.register(uploadRoutes);
  await app.register(jobRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
