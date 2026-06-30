import type { FastifyPluginAsync } from "fastify";
import {
  createActionPlanFromRecommendation,
  generateStandaloneHardeningSuggestions,
  generateHardeningSuggestions,
  getSecurityAssessment,
  runStableFullAnalysis
} from "../services/security-assessment.service.js";

export const assessmentRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { scopeType?: string; scopeId?: string; collectConnectorData?: boolean } }>("/api/assessments/full-analysis", async (request, reply) => {
    try {
      const result = await runStableFullAnalysis(request.body ?? {});
      if (result.technicalError) request.log.error({ detail: result.technicalError }, "Full analysis continued with deterministic fallback");
      const { technicalError: _technicalError, ...response } = result;
      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, "Full analysis failed safely");
      return reply.code(200).send({ ok: false, source: "deterministic", assessment: null, message: "تحلیل کامل انجام نشد. جزئیات فنی در گزارش سرور ثبت شد." });
    }
  });

  app.post("/api/assessments/hardening-suggestions", async (request, reply) => {
    try {
      return reply.code(200).send(await generateStandaloneHardeningSuggestions());
    } catch (error) {
      request.log.error({ err: error }, "Hardening suggestions failed");
      return reply.code(200).send({ ok: false, source: "deterministic", recommendations: [], message: "پیشنهادهای ایمن‌سازی تولید نشد. جزئیات خطا در گزارش فنی ثبت شد." });
    }
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
