import type { FastifyPluginAsync } from "fastify";
import { getJob } from "../lib/memoryStore.js";

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (request, reply) => {
    const job = getJob(request.params.jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return {
      jobId: job.id,
      uploadId: job.uploadId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error
    };
  });
};
