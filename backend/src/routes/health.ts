import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/health", async () => ({
    status: "ok",
    service: "firewall-log-analyzer-backend",
    timestamp: new Date().toISOString()
  }));
};
