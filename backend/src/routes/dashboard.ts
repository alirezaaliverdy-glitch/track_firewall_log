import type { FastifyInstance } from "fastify";
import { getOperationalDashboardActivity } from "../services/dashboard-activity.service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard/activity", async () => getOperationalDashboardActivity());
}