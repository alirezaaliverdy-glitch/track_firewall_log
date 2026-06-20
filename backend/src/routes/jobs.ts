import type { FastifyPluginAsync } from "fastify";
import { getJobById, toJobStatus } from "../services/job.service.js";

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (request, reply) => {
    const job = await getJobById(request.params.jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return toJobStatus(job);
  });
};
