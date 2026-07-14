import type { FastifyPluginAsync } from "fastify";
import { databaseConnectionInfo } from "../config/database-url.js";
import { env } from "../config/env.js";
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
    const connection = databaseConnectionInfo(env.databaseUrl);
    if (!database.ok) {
      return reply.code(503).send({
        status: "not_ready",
        databaseReady: false,
        schemaReady: false,
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
      schemaReady: database.schemaReady,
      ready: true,
      checkedAt,
      service: "firewall-log-analyzer-backend",
      runtime: connection.present ? {
        database: database.database,
        schema: database.schema,
        host: connection.host,
        port: Number(connection.port)
      } : undefined,
      checks: {
        database
      }
    };
  });
};
