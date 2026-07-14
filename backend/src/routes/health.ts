import type { FastifyPluginAsync } from "fastify";
import { checkDatabaseReady } from "../db/prisma.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const health = async () => ({
    status: "ok",
    service: "firewall-log-analyzer-backend",
    timestamp: new Date().toISOString()
  });
  app.get("/health", health);
  app.get("/api/health", health);
  app.get("/api/health/live", async () => ({
    status: "live",
    service: "firewall-log-analyzer-backend",
    checkedAt: new Date().toISOString()
  }));
  app.get("/api/health/ready", async (_request, reply) => {
    const checkedAt = new Date().toISOString();
    const database = await checkDatabaseReady();
    if (!database.ok) {
      return reply.code(503).send({
        status: "not_ready",
        databaseReady: false,
        reasonCode: "DATABASE_UNAVAILABLE",
        retryable: database.reason.transient,
        checkedAt,
        service: "firewall-log-analyzer-backend",
        checks: {
          database
        }
      });
    }
    return {
      status: "ready",
      databaseReady: true,
      ready: true,
      checkedAt,
      service: "firewall-log-analyzer-backend",
      checks: {
        database
      }
    };
  });
};
