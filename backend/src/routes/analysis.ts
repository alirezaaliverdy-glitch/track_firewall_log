import type { FastifyPluginAsync } from "fastify";
import fs from "node:fs";
import { maxUploadBytes } from "../config/env.js";
import {
  getAnalysisJobById,
  getAnalysisRunById,
  getLatestAnalysisForUpload,
  getRecentAnalysisJobs,
  toAnalysisJobStatus,
  toAnalysisResponse
} from "../services/analysis.service.js";
import { createUploadWithImportJob } from "../services/upload.service.js";
import { enqueueAnalysisJob } from "../services/worker.service.js";
import { allowedExtensions, storeUploadFile, validateUploadExtension } from "../utils/fileValidation.js";

export const analysisRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/analysis/upload", async (request, reply) => {
    const file = await request.file({
      limits: {
        fileSize: maxUploadBytes,
        files: 1
      }
    });

    if (!file) {
      return reply.code(400).send({ error: "A firewall log file is required" });
    }

    const extension = validateUploadExtension(file.filename);

    if (!extension.valid) {
      file.file.resume();
      return reply.code(415).send({
        error: "Unsupported file type",
        allowedExtensions
      });
    }

    const storedFile = await storeUploadFile(file.file, file.filename);

    let created: Awaited<ReturnType<typeof createUploadWithImportJob>>;

    try {
      created = await createUploadWithImportJob({
        ...storedFile,
        mimeType: file.mimetype
      });
    } catch (error) {
      await fs.promises.unlink(storedFile.storagePath).catch(() => undefined);
      throw error;
    }

    enqueueAnalysisJob({ uploadId: created.upload.id, jobId: created.job.id });

    return reply.code(202).send({
      jobId: created.job.id,
      status: created.job.status
    });
  });

  app.get("/api/analysis/jobs", async () => {
    const jobs = await getRecentAnalysisJobs();
    return {
      jobs: jobs.map(toAnalysisJobStatus)
    };
  });

  app.get<{ Params: { jobId: string } }>("/api/analysis/jobs/:jobId", async (request, reply) => {
    const job = await getAnalysisJobById(request.params.jobId);

    if (!job) {
      return reply.code(404).send({ error: "Analysis job not found" });
    }

    return toAnalysisJobStatus(job);
  });

  app.get<{ Params: { jobId: string } }>("/api/analysis/jobs/:jobId/result", async (request, reply) => {
    const job = await getAnalysisJobById(request.params.jobId);

    if (!job) {
      return reply.code(404).send({ error: "Analysis job not found" });
    }

    const analysis = job.upload.analysisRuns[0];

    if (!analysis || analysis.status !== "completed") {
      return reply.code(404).send({ error: "Analysis result not found" });
    }

    return toAnalysisResponse(analysis);
  });

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
