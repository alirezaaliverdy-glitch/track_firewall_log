import "dotenv/config";

const DEFAULT_PORT = 4000;
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const DEFAULT_UPLOAD_DIR = "./storage/uploads";
const DEFAULT_MAX_UPLOAD_MB = 25;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePositiveInteger(process.env.PORT, DEFAULT_PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN,
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR,
  maxUploadMb: parsePositiveInteger(process.env.MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB)
};

export const maxUploadBytes = env.maxUploadMb * 1024 * 1024;
export const isProduction = env.nodeEnv === "production";
