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
import { commandCatalogForVendor, VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { routeCatalogIntent } from "../actions/intent-router.js";

export const actionRoutes: FastifyPluginAsync = async (app) => {
  const actor = (request: { authUser?: { username: string; role: string } }) => request.authUser ? `${request.authUser.username}:${request.authUser.role}` : undefined;

  app.post<{ Body: Record<string, unknown> }>("/api/actions/propose", async (request, reply) => {
    try {
      return reply.code(201).send(await proposeActionPlan({ ...(request.body ?? {}), requestedBy: actor(request) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to propose action plan";
      return reply.code(400).send({ error: "Failed to propose action plan", detail: message });
    }
  });

  app.get("/api/actions", async () => listActionPlans());

  app.get("/api/actions/catalog", async () => ({ actions: VENDOR_COMMAND_CATALOG }));

  app.get<{ Params: { vendor: string } }>("/api/actions/catalog/:vendor", async (request) => ({
    vendor: request.params.vendor,
    actions: commandCatalogForVendor(request.params.vendor)
  }));

  app.post<{ Body: { prompt?: string; vendor?: "mikrotik" | "fortigate" | "linux" | "pfsense" | "cisco" } }>("/api/actions/match", async (request, reply) => {
    const prompt = request.body?.prompt?.trim();
    if (!prompt) return reply.code(400).send({ error: "prompt is required" });
    return routeCatalogIntent(prompt, request.body.vendor ?? null);
  });

  app.get<{ Params: { id: string } }>("/api/actions/:id", async (request, reply) => {
    const plan = await getActionPlan(request.params.id);
    if (!plan) return reply.code(404).send({ error: { code: "ACTION_PLAN_NOT_FOUND", message: "The requested ActionPlan does not exist.", actionPlanId: request.params.id, retryable: false } });
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
      const plan = await approveActionPlan(request.params.id, { ...(request.body ?? {}), approvedBy: actor(request) });
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
    const plan = await rejectActionPlan(request.params.id, { ...(request.body ?? {}), approvedBy: actor(request) });
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
        if (error.code === "COMMAND_PLAN_STALE") return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.details ?? {}) } });
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
      const plan = await quickExecuteActionPlan(request.params.id, { ...(request.body ?? {}), approvedBy: actor(request) }, {
        trace: (stage, payload) => request.log.info({ ...payload, stage }, stage)
      });
      if (!plan) return reply.code(404).send({ error: "Action plan not found" });
      return { ...plan, resultUrl: `/actions/${plan.id}/result` };
    } catch (error) {
      if (error instanceof QuickExecuteConfirmationRequiredError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          detail: error.message,
          plan: error.plan
        });
      }
      if (error instanceof ActionExecutionError) {
        if (error.code === "COMMAND_PLAN_STALE") return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.details ?? {}) } });
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
