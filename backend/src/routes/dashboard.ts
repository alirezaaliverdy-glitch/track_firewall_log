import type { FastifyInstance } from "fastify";
import { getOperationalDashboardActivity } from "../services/dashboard-activity.service.js";
import { listFleetHealth } from "../services/fleet-health.service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{Querystring:{page?:string}}>("/api/dashboard/device-health", async (request,reply) => {
    if (!request.authUser) return reply.code(401).send({error:"AUTH_REQUIRED"});
    const page = Number(request.query.page ?? 0);
    if (!Number.isInteger(page) || page<0 || page>10000) return reply.code(400).send({error:"INVALID_PAGE"});
    return listFleetHealth(request.authUser.scopeOwnerId ?? request.authUser.id,page);
  });
  app.get("/api/dashboard/activity", async () => getOperationalDashboardActivity());
}
