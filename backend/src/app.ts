import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError } from "fastify";
import { env, isProduction, maxUploadBytes } from "./config/env.js";
import { prisma, withDatabaseStartupRetry } from "./db/prisma.js";
import { actionRoutes } from "./routes/actions.js";
import { loggerConfig } from "./lib/logger.js";
import { analysisRoutes } from "./routes/analysis.js";
import { aiRoutes } from "./routes/ai.js";
import { deviceRoutes } from "./routes/devices.js";
import { connectorPlanRoutes } from "./routes/connector-plans.js";
import { collectorRoutes } from "./routes/collectors.js";
import { credentialRoutes } from "./routes/credentials.js";
import { detectionRoutes } from "./routes/detections.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { incidentRoutes } from "./routes/incidents.js";
import { jobRoutes } from "./routes/jobs.js";
import { uploadRoutes } from "./routes/uploads.js";
import { assessmentRoutes } from "./routes/assessments.js";
import { authRoutes } from "./routes/auth.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { linuxTelemetryRoutes } from "./routes/linux-telemetry.js";
import { telemetryFindingRoutes } from "./routes/telemetry-findings.js";
import { commandCatalogRoutes } from "./routes/command-catalog.js";
import { actionSessionRoutes } from "./routes/action-sessions.js";
import { dailyCheckRoutes } from "./routes/daily-check.js";
import { assetRoutes } from "./routes/assets.js";
import { securityPlatformRoutes } from "./routes/security-platform.js";
import { vendorRoutes } from "./routes/vendors.js";
import { linuxHealthRoutes } from "./routes/linux-health.js";
import { productStateRoutes } from "./routes/product-state.js";
import { deviceOnboardingRoutes } from "./routes/device-onboarding.js";
import { deviceWorkspaceRoutes } from "./routes/device-workspaces.js";
import { diagnosticRoutes } from "./routes/diagnostics.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { scheduledTaskRoutes } from "./routes/scheduled-tasks.js";
import { COMMAND_CATALOG } from "./commands/catalog/index.js";
import { validateCommandCatalog } from "./commands/catalog/command-catalog-validator.js";
import { stopAllLinuxLogStreams } from "./telemetry/linux/linux-log-stream.service.js";
import { registerSecurityPlugin } from "./plugins/security.plugin.js";
import { stopSecurityMonitor } from "./services/security-monitor.service.js";
import { stopScheduledTaskWorker } from "./services/scheduled-task-worker.service.js";
import { NATIVE_APP_ORIGINS } from "./security/session-transport.js";

export async function buildApp(options: { authRequired?: boolean } = {}) {
  validateCommandCatalog(COMMAND_CATALOG);
  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: maxUploadBytes,
    trustProxy: env.trustProxy ? ["loopback", "linklocal", "uniquelocal"] : false
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: [...env.corsOrigins, ...NATIVE_APP_ORIGINS],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  });
  await app.register(cookie);
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

  const authRequired = options.authRequired !== false;
  if (authRequired) {
    await withDatabaseStartupRetry("Authentication database check", async () => {
      await prisma.appUser.count();
    });
  }
  await registerSecurityPlugin(app, { authRequired });

  await app.register(authRoutes);
  await app.register(adminUserRoutes);
  await app.register(healthRoutes);
  await app.register(dashboardRoutes);
  await app.register(actionRoutes);
  await app.register(scheduledTaskRoutes);
  await app.register(assessmentRoutes);
  await app.register(connectorPlanRoutes);
  await app.register(collectorRoutes);
  await app.register(credentialRoutes);
  await app.register(uploadRoutes);
  await app.register(jobRoutes);
  await app.register(analysisRoutes);
  await app.register(aiRoutes);
  await app.register(deviceRoutes);
  await app.register(deviceOnboardingRoutes);
  await app.register(deviceWorkspaceRoutes);
  await app.register(diagnosticRoutes);
  await app.register(linuxTelemetryRoutes);
  await app.register(telemetryFindingRoutes);
  await app.register(commandCatalogRoutes);
  await app.register(actionSessionRoutes);
  await app.register(dailyCheckRoutes);
  await app.register(assetRoutes);
  await app.register(securityPlatformRoutes);
  await app.register(vendorRoutes);
  await app.register(linuxHealthRoutes);
  await app.register(productStateRoutes);
  await app.register(eventRoutes);
  await app.register(detectionRoutes);
  await app.register(incidentRoutes);

  app.addHook("onClose", async () => {
    await stopSecurityMonitor();
    await stopScheduledTaskWorker();
    stopAllLinuxLogStreams();
  });

  return app;
}
