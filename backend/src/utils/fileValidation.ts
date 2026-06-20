import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { env, maxUploadBytes } from "../config/env.js";

export const allowedExtensions = ["csv", "tsv", "txt", "log", "json", "ndjson"] as const;

const allowedExtensionSet = new Set<string>(allowedExtensions);

export interface StoredUploadFile {
  fileName: string;
  originalFileName: string;
  fileExtension: string;
  fileSize: number;
  checksum: string;
  storagePath: string;
}

export function getFileExtension(fileName: string) {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

export function validateUploadExtension(fileName: string) {
  const extension = getFileExtension(fileName);

  if (!allowedExtensionSet.has(extension)) {
    return {
      valid: false as const,
      extension
    };
  }

  return {
    valid: true as const,
    extension
  };
}

export function getUploadDirectory() {
  return path.resolve(process.cwd(), env.uploadDir);
}

export async function ensureUploadDirectory() {
  await fs.promises.mkdir(getUploadDirectory(), { recursive: true });
}

export async function storeUploadFile(
  stream: NodeJS.ReadableStream,
  originalFileName: string
): Promise<StoredUploadFile> {
  const validation = validateUploadExtension(originalFileName);

  if (!validation.valid) {
    throw new Error("Unsupported file type");
  }

  await ensureUploadDirectory();

  const hash = crypto.createHash("sha256");
  let fileSize = 0;
  const fileName = `${crypto.randomUUID()}.${validation.extension}`;
  const storagePath = path.join(getUploadDirectory(), fileName);

  const meteredStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      fileSize += chunk.length;
      hash.update(chunk);

      if (fileSize > maxUploadBytes) {
        callback(new Error(`File is too large. Maximum upload size is ${env.maxUploadMb}MB.`));
        return;
      }

      callback(null, chunk);
    }
  });

  try {
    await pipeline(stream, meteredStream, fs.createWriteStream(storagePath, { flags: "wx" }));
  } catch (error) {
    await fs.promises.unlink(storagePath).catch(() => undefined);
    throw error;
  }

  return {
    fileName,
    originalFileName,
    fileExtension: validation.extension,
    fileSize,
    checksum: hash.digest("hex"),
    storagePath
  };
}
