import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const health = async () => ({
    status: "ok",
    service: "firewall-log-analyzer-backend",
    timestamp: new Date().toISOString()
  });
  app.get("/health", health);
  app.get("/api/health", health);
};
