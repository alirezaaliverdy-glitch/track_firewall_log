import type { FastifyPluginAsync } from "fastify";
import { getConnectorCapabilities, getConnectorVendors } from "../connectors/connector-registry.service.js";
import { dryRunActionPlan, getActionPlan } from "../services/action-plan.service.js";

export const connectorPlanRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/connectors/capabilities", async () => ({
    executionEnabled: false,
    capabilities: getConnectorCapabilities()
  }));

  app.get("/api/connectors/vendors", async () => ({
    executionEnabled: false,
    vendors: getConnectorVendors()
  }));

  app.get<{ Params: { id: string } }>("/api/actions/:id/plan", async (request, reply) => {
    const plan = await getActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return {
      actionPlanId: plan.id,
      dryRunJson: plan.dryRunJson ?? {},
      validationJson: plan.validationJson ?? {}
    };
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/plan", async (request, reply) => {
    const plan = await dryRunActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return plan;
  });
};
