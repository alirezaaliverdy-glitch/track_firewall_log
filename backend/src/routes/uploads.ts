import fs from "node:fs";
import type { FastifyPluginAsync } from "fastify";
import { maxUploadBytes } from "../config/env.js";
import { createUploadWithImportJob, getUploadById, toUploadMetadata } from "../services/upload.service.js";
import { allowedExtensions, storeUploadFile, validateUploadExtension } from "../utils/fileValidation.js";

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/uploads", async (request, reply) => {
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

    const { upload, job } = created;

    request.log.info(
      {
        uploadId: upload.id,
        jobId: job.id,
        fileName: upload.fileName,
        originalFileName: upload.originalFileName,
        extension: upload.fileExtension,
        fileSize: upload.fileSize
      },
      "Upload metadata stored"
    );

    return reply.code(202).send({
      uploadId: upload.id,
      jobId: job.id,
      fileName: upload.originalFileName,
      status: job.status
    });
  });

  app.get<{ Params: { id: string } }>("/api/uploads/:id", async (request, reply) => {
    const upload = await getUploadById(request.params.id);

    if (!upload) {
      return reply.code(404).send({ error: "Upload not found" });
    }

    return toUploadMetadata(upload);
  });
};
