import type { FastifyPluginAsync } from "fastify";
import { getAnalysisRunById, getLatestAnalysisForUpload, toAnalysisResponse } from "../services/analysis.service.js";

export const analysisRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/api/uploads/:id/analysis", async (request, reply) => {
    const analysis = await getLatestAnalysisForUpload(request.params.id);

    if (!analysis) {
      return reply.code(404).send({ error: "Analysis not found" });
    }

    return toAnalysisResponse(analysis);
  });

  app.get<{ Params: { analysisRunId: string } }>("/api/analysis-runs/:analysisRunId", async (request, reply) => {
    const analysis = await getAnalysisRunById(request.params.analysisRunId);

    if (!analysis) {
      return reply.code(404).send({ error: "Analysis not found" });
    }

    return toAnalysisResponse(analysis);
  });
};
