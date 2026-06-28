import type { FastifyPluginAsync } from "fastify";
import {
  approveActionPlan,
  ActionExecutionError,
  correctAndRevalidateActionPlan,
  dryRunActionPlan,
  executeActionPlan,
  getActionAudit,
  getActionPlan,
  listActionPlans,
  proposeActionPlan,
  quickExecuteActionPlan,
  QuickExecuteConfirmationRequiredError,
  rejectActionPlan,
  validateAndStoreActionPlan
} from "../services/action-plan.service.js";

export const actionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: Record<string, unknown> }>("/api/actions/propose", async (request, reply) => {
    try {
      return reply.code(201).send(await proposeActionPlan(request.body ?? {}));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to propose action plan";
      return reply.code(400).send({ error: "Failed to propose action plan", detail: message });
    }
  });

  app.get("/api/actions", async () => listActionPlans());

  app.get<{ Params: { id: string } }>("/api/actions/:id", async (request, reply) => {
    const plan = await getActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return plan;
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/validate", async (request, reply) => {
    const plan = await validateAndStoreActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return plan;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/actions/:id/parameters", async (request, reply) => {
    try {
      const plan = await correctAndRevalidateActionPlan(request.params.id, request.body ?? {});
      if (!plan) return reply.code(404).send({ error: "Action plan not found" });
      return plan;
    } catch (error) {
      if (error instanceof ActionExecutionError) return reply.code(error.statusCode).send({ error: error.code, detail: error.message });
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/dry-run", async (request, reply) => {
    const plan = await dryRunActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return plan;
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/actions/:id/approve", async (request, reply) => {
    try {
      const plan = await approveActionPlan(request.params.id, request.body ?? {});
      if (!plan) return reply.code(404).send({ error: "Action plan not found" });
      return plan;
    } catch (error) {
      if (error instanceof ActionExecutionError) {
        return reply.code(error.statusCode).send({ error: error.code, detail: error.message });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/actions/:id/reject", async (request, reply) => {
    const plan = await rejectActionPlan(request.params.id, request.body ?? {});
    if (!plan) return reply.code(404).send({ error: "Action plan not found" });
    return plan;
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/actions/:id/execute", async (request, reply) => {
    try {
      const plan = await executeActionPlan(request.params.id, request.body ?? {});
      if (!plan) return reply.code(404).send({ error: "Action plan not found" });
      return plan;
    } catch (error) {
      if (error instanceof ActionExecutionError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          detail: error.message
        });
      }
      const message = error instanceof Error ? error.message : "Failed to execute action plan";
      return reply.code(500).send({ error: "EXECUTION_FAILED", detail: message });
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/actions/:id/quick-execute", async (request, reply) => {
    try {
      const plan = await quickExecuteActionPlan(request.params.id, request.body ?? {});
      if (!plan) return reply.code(404).send({ error: "Action plan not found" });
      return plan;
    } catch (error) {
      if (error instanceof QuickExecuteConfirmationRequiredError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          detail: error.message,
          plan: error.plan
        });
      }
      if (error instanceof ActionExecutionError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          detail: error.message
        });
      }
      const message = error instanceof Error ? error.message : "Failed to quick execute action plan";
      return reply.code(500).send({ error: "QUICK_EXECUTE_FAILED", detail: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/actions/:id/audit", async (request, reply) => {
    const audit = await getActionAudit(request.params.id);
    if (!audit) return reply.code(404).send({ error: "Action plan not found" });
    return audit;
  });
};
