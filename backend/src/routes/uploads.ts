import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { maxUploadBytes } from "../config/env.js";
import { createUpload, getUpload } from "../lib/memoryStore.js";

const ALLOWED_EXTENSIONS = new Set(["csv", "tsv", "txt", "log", "json", "ndjson"]);

function getExtension(fileName: string) {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

async function countBytes(stream: NodeJS.ReadableStream) {
  let sizeBytes = 0;

  await pipeline(
    stream,
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback();
      }
    })
  );

  return sizeBytes;
}

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

    const extension = getExtension(file.filename);

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      file.file.resume();
      return reply.code(415).send({
        error: "Unsupported file type",
        allowedExtensions: Array.from(ALLOWED_EXTENSIONS).sort()
      });
    }

    const sizeBytes = await countBytes(file.file);

    const { upload, job } = createUpload({
      fileName: file.filename,
      extension,
      mimeType: file.mimetype,
      sizeBytes
    });

    request.log.info(
      {
        uploadId: upload.id,
        jobId: job.id,
        fileName: upload.fileName,
        extension: upload.extension,
        sizeBytes: upload.sizeBytes
      },
      "Upload metadata stored"
    );

    return reply.code(202).send({
      uploadId: upload.id,
      jobId: job.id,
      fileName: upload.fileName,
      status: job.status
    });
  });

  app.get<{ Params: { id: string } }>("/api/uploads/:id", async (request, reply) => {
    const upload = getUpload(request.params.id);

    if (!upload) {
      return reply.code(404).send({ error: "Upload not found" });
    }

    return {
      uploadId: upload.id,
      jobId: upload.jobId,
      fileName: upload.fileName,
      extension: upload.extension,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      createdAt: upload.createdAt
    };
  });
};
