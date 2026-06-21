import "dotenv/config";

const DEFAULT_PORT = 4000;
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.7.13"
];
const DEFAULT_UPLOAD_DIR = "./storage/uploads";
const DEFAULT_MAX_UPLOAD_MB = 25;
const DEFAULT_AI_TIMEOUT_MS = 30000;
const DEFAULT_AI_MAX_CONTEXT_EVENTS = 25;
const DEFAULT_AI_MAX_CONTEXT_INCIDENTS = 10;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCorsOrigins(value: string | undefined) {
  const configured = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configured]));
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePositiveInteger(process.env.PORT, DEFAULT_PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR,
  maxUploadMb: parsePositiveInteger(process.env.MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB),
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  aiTimeoutMs: parsePositiveInteger(process.env.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
  aiMaxContextEvents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_EVENTS, DEFAULT_AI_MAX_CONTEXT_EVENTS),
  aiMaxContextIncidents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_INCIDENTS, DEFAULT_AI_MAX_CONTEXT_INCIDENTS)
};

export const maxUploadBytes = env.maxUploadMb * 1024 * 1024;
export const isProduction = env.nodeEnv === "production";
