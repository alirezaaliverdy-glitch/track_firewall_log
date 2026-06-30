import type { FastifyPluginAsync } from "fastify";
import {
  createActionPlanFromRecommendation,
  generateHardeningSuggestions,
  getSecurityAssessment,
  runFullAnalysis
} from "../services/security-assessment.service.js";

export const assessmentRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { scopeType?: string; scopeId?: string; collectConnectorData?: boolean } }>("/api/assessments/full-analysis", async (request, reply) => {
    return reply.code(201).send(await runFullAnalysis(request.body ?? {}));
  });

  app.get<{ Params: { id: string } }>("/api/assessments/:id", async (request, reply) => {
    const assessment = await getSecurityAssessment(request.params.id);
    return assessment ? assessment : reply.code(404).send({ error: "Security assessment not found" });
  });

  app.post<{ Params: { id: string } }>("/api/assessments/:id/hardening-suggestions", async (request, reply) => {
    const assessment = await generateHardeningSuggestions(request.params.id);
    return assessment ? assessment : reply.code(404).send({ error: "Security assessment not found" });
  });

  app.post<{ Params: { id: string } }>("/api/recommendations/:id/create-action-plan", async (request, reply) => {
    try {
      const result = await createActionPlanFromRecommendation(request.params.id);
      return result ? reply.code(201).send(result) : reply.code(404).send({ error: "Hardening recommendation not found" });
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "Recommendation cannot create an ActionPlan" });
    }
  });
};

