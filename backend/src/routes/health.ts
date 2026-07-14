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
  app.get("/api/health/ready", async (_request, reply) => {
    const database = await checkDatabaseReady();
    if (!database.ok) {
      return reply.code(503).send({
        status: "unavailable",
        ready: false,
        service: "firewall-log-analyzer-backend",
        checks: {
          database
        },
        timestamp: new Date().toISOString()
      });
    }
    return {
      status: "ready",
      ready: true,
      service: "firewall-log-analyzer-backend",
      checks: {
        database
      },
      timestamp: new Date().toISOString()
    };
  });
};
