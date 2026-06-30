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
const DEFAULT_EVENT_RETENTION_LOW_DAYS = 7;
const DEFAULT_EVENT_RETENTION_MEDIUM_DAYS = 30;
const DEFAULT_EVENT_RETENTION_HIGH_DAYS = 90;
const DEFAULT_EVENT_RETENTION_CRITICAL_DAYS = 180;
const DEFAULT_EVENT_MAX_ROWS = 200000;
const DEFAULT_EVENT_MAX_RAW_SNIPPET_CHARS = 2000;
const DEFAULT_EVENT_DEDUP_WINDOW_MINUTES = 60;
const DEFAULT_EVENT_RETENTION_RUN_INTERVAL_MINUTES = 60;
const DEFAULT_SSH_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_SSH_HANDSHAKE_TIMEOUT_MS = 15000;
const DEFAULT_SSH_COMMAND_TIMEOUT_MS = 10000;
const DEFAULT_OPENAI_MODEL = "openrouter/free";
const DEFAULT_OPENAI_FALLBACK_MODELS = [
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free"
];

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

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type ActionExecutionMode = "safe" | "lab_fast" | "direct_controlled" | "quick_controlled";

function parseActionExecutionMode(value: string | undefined): ActionExecutionMode {
  return value === "lab_fast" || value === "direct_controlled" || value === "quick_controlled" ? value : "quick_controlled";
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
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
  openaiModel: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
  openaiFallbackModels: parseCsv(process.env.OPENAI_FALLBACK_MODELS ?? DEFAULT_OPENAI_FALLBACK_MODELS.join(",")),
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  aiTimeoutMs: parsePositiveInteger(process.env.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
  aiMaxContextEvents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_EVENTS, DEFAULT_AI_MAX_CONTEXT_EVENTS),
  aiMaxContextIncidents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_INCIDENTS, DEFAULT_AI_MAX_CONTEXT_INCIDENTS),
  eventRetentionLowDays: parsePositiveInteger(process.env.EVENT_RETENTION_LOW_DAYS, DEFAULT_EVENT_RETENTION_LOW_DAYS),
  eventRetentionMediumDays: parsePositiveInteger(process.env.EVENT_RETENTION_MEDIUM_DAYS, DEFAULT_EVENT_RETENTION_MEDIUM_DAYS),
  eventRetentionHighDays: parsePositiveInteger(process.env.EVENT_RETENTION_HIGH_DAYS, DEFAULT_EVENT_RETENTION_HIGH_DAYS),
  eventRetentionCriticalDays: parsePositiveInteger(process.env.EVENT_RETENTION_CRITICAL_DAYS, DEFAULT_EVENT_RETENTION_CRITICAL_DAYS),
  eventMaxRows: parsePositiveInteger(process.env.EVENT_MAX_ROWS, DEFAULT_EVENT_MAX_ROWS),
  eventMaxRawSnippetChars: parsePositiveInteger(process.env.EVENT_MAX_RAW_SNIPPET_CHARS, DEFAULT_EVENT_MAX_RAW_SNIPPET_CHARS),
  eventDedupWindowMinutes: parsePositiveInteger(process.env.EVENT_DEDUP_WINDOW_MINUTES, DEFAULT_EVENT_DEDUP_WINDOW_MINUTES),
  eventRetentionRunIntervalMinutes: parsePositiveInteger(process.env.EVENT_RETENTION_RUN_INTERVAL_MINUTES, DEFAULT_EVENT_RETENTION_RUN_INTERVAL_MINUTES),
  sshConnectTimeoutMs: parsePositiveInteger(process.env.SSH_CONNECT_TIMEOUT_MS, DEFAULT_SSH_CONNECT_TIMEOUT_MS),
  sshHandshakeTimeoutMs: parsePositiveInteger(process.env.SSH_HANDSHAKE_TIMEOUT_MS, DEFAULT_SSH_HANDSHAKE_TIMEOUT_MS),
  sshCommandTimeoutMs: parsePositiveInteger(process.env.SSH_COMMAND_TIMEOUT_MS, DEFAULT_SSH_COMMAND_TIMEOUT_MS),
  actionExecutionMode: parseActionExecutionMode(process.env.ACTION_EXECUTION_MODE),
  actionRequireManagementSource: parseBoolean(process.env.ACTION_REQUIRE_MANAGEMENT_SOURCE, false),
  actionDefaultTrustedSource: process.env.ACTION_DEFAULT_TRUSTED_SOURCE?.trim() || "auto",
  actionAllowLabUnrestrictedManagement: parseBoolean(process.env.ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT, true)
};

export const maxUploadBytes = env.maxUploadMb * 1024 * 1024;
export const isProduction = env.nodeEnv === "production";
