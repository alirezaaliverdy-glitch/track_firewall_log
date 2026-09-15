import "dotenv/config";
import { resolveDatabaseUrl } from "./database-url.js";
import { parseCorsOriginsForProfile, productionConfigFailures, resolveProductionProfile } from "./production-hardening.js";

const DEFAULT_PORT = 4000;
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const DEFAULT_UPLOAD_DIR = "./storage/uploads";
const DEFAULT_MAX_UPLOAD_MB = 25;
const DEFAULT_AI_TIMEOUT_MS = 30000;
const DEFAULT_AI_MAX_CONTEXT_EVENTS = 50;
const DEFAULT_AI_MAX_CONTEXT_INCIDENTS = 20;
const DEFAULT_AI_MAX_CONTEXT_FINDINGS = 20;
const DEFAULT_AI_MAX_ACTION_PLANS = 15;
const DEFAULT_AI_MAX_EVIDENCE_LINES = 30;
const DEFAULT_AI_MAX_RAW_MESSAGE_CHARS = 300;
const DEFAULT_EVENT_RETENTION_LOW_DAYS = 7;
const DEFAULT_EVENT_RETENTION_MEDIUM_DAYS = 30;
const DEFAULT_EVENT_RETENTION_HIGH_DAYS = 90;
const DEFAULT_EVENT_RETENTION_CRITICAL_DAYS = 180;
const DEFAULT_EVENT_MAX_ROWS = 200000;
const DEFAULT_EVENT_MAX_RAW_SNIPPET_CHARS = 2000;
const DEFAULT_EVENT_DEDUP_WINDOW_MINUTES = 60;
const DEFAULT_EVENT_RETENTION_RUN_INTERVAL_MINUTES = 60;
const DEFAULT_SECURITY_MONITOR_TICK_SECONDS = 5;
const DEFAULT_SECURITY_COLLECTOR_INTERVAL_SECONDS = 60;
const DEFAULT_SSH_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_SSH_HANDSHAKE_TIMEOUT_MS = 15000;
const DEFAULT_SSH_COMMAND_TIMEOUT_MS = 10000;
const DEFAULT_TELEMETRY_MAX_BYTES_PER_DEVICE = 10 * 1024 * 1024;
const DEFAULT_TELEMETRY_MAX_EVENTS_PER_DEVICE = 5000;
const DEFAULT_TELEMETRY_MAX_AGE_DAYS = 30;
const DEFAULT_OPENAI_MODEL = "openrouter/free";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENAI_FALLBACK_MODELS = [
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free"
];
const DEFAULT_AUTH_SESSION_SECRET = "development-only-change-this-secret";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type ActionExecutionMode = "safe" | "lab_fast" | "direct_controlled" | "quick_controlled";
export type AppProfile = "lab" | "staging" | "production";
export type ProductMode = "classic" | "persian_command_catalog";

function parseAppProfile(value: string | undefined, nodeEnv: string): AppProfile {
  if (value && value !== "lab" && value !== "staging" && value !== "production") {
    throw new Error("APP_PROFILE must be one of: lab, staging, production");
  }
  if (value === "lab" || value === "staging" || value === "production") return value;
  return nodeEnv === "production" ? "production" : "lab";
}

function defaultActionExecutionMode(profile: AppProfile): ActionExecutionMode {
  if (profile === "production") return "safe";
  if (profile === "staging") return "direct_controlled";
  return "quick_controlled";
}

function parseActionExecutionMode(value: string | undefined, profile: AppProfile): ActionExecutionMode {
  if (parseBoolean(process.env.ACTION_FORCE_QUICK_EXECUTE, false)) return "quick_controlled";
  return value === "safe" || value === "lab_fast" || value === "direct_controlled" || value === "quick_controlled"
    ? value
    : defaultActionExecutionMode(profile);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function firstEnv(...values: Array<string | undefined>) {
  return values.find((value) => value !== undefined);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const appProfile = parseAppProfile(process.env.APP_PROFILE, nodeEnv);
const productionProfile = resolveProductionProfile({ nodeEnv, appProfile });

export const env = {
  nodeEnv,
  appProfile,
  productMode: process.env.PRODUCT_MODE === "persian_command_catalog" ? "persian_command_catalog" as ProductMode : "classic" as ProductMode,
  port: parsePositiveInteger(process.env.PORT, DEFAULT_PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN,
  corsOrigins: parseCorsOriginsForProfile(process.env.CORS_ORIGIN, productionProfile),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  databaseUrl: resolveDatabaseUrl(process.env.DATABASE_URL),
  uploadDir: process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR,
  maxUploadMb: parsePositiveInteger(process.env.MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB),
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
  openaiFallbackModels: parseCsv(process.env.OPENAI_FALLBACK_MODELS ?? DEFAULT_OPENAI_FALLBACK_MODELS.join(",")),
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? (process.env.AI_PROVIDER === "openai" ? DEFAULT_OPENAI_BASE_URL : DEFAULT_OPENAI_COMPATIBLE_BASE_URL),
  openaiProxyUrl: process.env.OPENAI_PROXY_URL?.trim() || undefined,
  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
  aiTimeoutMs: parsePositiveInteger(process.env.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
  aiMaxContextEvents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_EVENTS, DEFAULT_AI_MAX_CONTEXT_EVENTS),
  aiMaxContextIncidents: parsePositiveInteger(process.env.AI_MAX_CONTEXT_INCIDENTS, DEFAULT_AI_MAX_CONTEXT_INCIDENTS),
  aiMaxContextFindings: parsePositiveInteger(process.env.AI_MAX_CONTEXT_FINDINGS, DEFAULT_AI_MAX_CONTEXT_FINDINGS),
  aiMaxActionPlans: parsePositiveInteger(process.env.AI_MAX_ACTION_PLANS, DEFAULT_AI_MAX_ACTION_PLANS),
  aiMaxEvidenceLines: parsePositiveInteger(process.env.AI_MAX_EVIDENCE_LINES, DEFAULT_AI_MAX_EVIDENCE_LINES),
  aiMaxRawMessageChars: parsePositiveInteger(process.env.AI_MAX_RAW_MESSAGE_CHARS, DEFAULT_AI_MAX_RAW_MESSAGE_CHARS),
  aiIncludeRawLogs: parseBoolean(process.env.AI_INCLUDE_RAW_LOGS, false),
  eventRetentionLowDays: parsePositiveInteger(process.env.EVENT_RETENTION_LOW_DAYS, DEFAULT_EVENT_RETENTION_LOW_DAYS),
  eventRetentionMediumDays: parsePositiveInteger(process.env.EVENT_RETENTION_MEDIUM_DAYS, DEFAULT_EVENT_RETENTION_MEDIUM_DAYS),
  eventRetentionHighDays: parsePositiveInteger(process.env.EVENT_RETENTION_HIGH_DAYS, DEFAULT_EVENT_RETENTION_HIGH_DAYS),
  eventRetentionCriticalDays: parsePositiveInteger(process.env.EVENT_RETENTION_CRITICAL_DAYS, DEFAULT_EVENT_RETENTION_CRITICAL_DAYS),
  eventMaxRows: parsePositiveInteger(process.env.EVENT_MAX_ROWS, DEFAULT_EVENT_MAX_ROWS),
  eventMaxRawSnippetChars: parsePositiveInteger(process.env.EVENT_MAX_RAW_SNIPPET_CHARS, DEFAULT_EVENT_MAX_RAW_SNIPPET_CHARS),
  eventDedupWindowMinutes: parsePositiveInteger(process.env.EVENT_DEDUP_WINDOW_MINUTES, DEFAULT_EVENT_DEDUP_WINDOW_MINUTES),
  eventRetentionRunIntervalMinutes: parsePositiveInteger(process.env.EVENT_RETENTION_RUN_INTERVAL_MINUTES, DEFAULT_EVENT_RETENTION_RUN_INTERVAL_MINUTES),
  securityMonitoringEnabled: parseBoolean(process.env.SECURITY_MONITORING_ENABLED, true),
  securityMonitorTickSeconds: parsePositiveInteger(process.env.SECURITY_MONITOR_TICK_SECONDS, DEFAULT_SECURITY_MONITOR_TICK_SECONDS),
  securityCollectorIntervalSeconds: parsePositiveInteger(process.env.SECURITY_COLLECTOR_INTERVAL_SECONDS, DEFAULT_SECURITY_COLLECTOR_INTERVAL_SECONDS),
  sshConnectTimeoutMs: parsePositiveInteger(process.env.SSH_CONNECT_TIMEOUT_MS, DEFAULT_SSH_CONNECT_TIMEOUT_MS),
  sshHandshakeTimeoutMs: parsePositiveInteger(process.env.SSH_HANDSHAKE_TIMEOUT_MS, DEFAULT_SSH_HANDSHAKE_TIMEOUT_MS),
  sshCommandTimeoutMs: parsePositiveInteger(process.env.SSH_COMMAND_TIMEOUT_MS, DEFAULT_SSH_COMMAND_TIMEOUT_MS),
  telemetryStoreDir: process.env.TELEMETRY_STORE_DIR ?? "./storage/telemetry",
  telemetryMaxBytesPerDevice: parsePositiveInteger(process.env.TELEMETRY_MAX_BYTES_PER_DEVICE, DEFAULT_TELEMETRY_MAX_BYTES_PER_DEVICE),
  telemetryMaxEventsPerDevice: parsePositiveInteger(process.env.TELEMETRY_MAX_EVENTS_PER_DEVICE, DEFAULT_TELEMETRY_MAX_EVENTS_PER_DEVICE),
  telemetryMaxAgeDays: parsePositiveInteger(process.env.TELEMETRY_MAX_AGE_DAYS, DEFAULT_TELEMETRY_MAX_AGE_DAYS),
  actionExecutionMode: parseActionExecutionMode(process.env.ACTION_EXECUTION_MODE, appProfile),
  actionRequireManagementSource: parseBoolean(firstEnv(process.env.ACTION_REQUIRE_MANAGEMENT_SOURCE, process.env.ACTION_REQUIRE_MANAGED_SOURCE), false),
  actionDefaultTrustedSource: process.env.ACTION_DEFAULT_TRUSTED_SOURCE?.trim() || "auto",
  actionAllowLabUnrestrictedManagement: parseBoolean(firstEnv(process.env.ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT, process.env.ACTION_ALLOW_UNRESTRICTED_MANAGEMENT), appProfile === "lab"),
  authSessionSecret: process.env.AUTH_SESSION_SECRET || DEFAULT_AUTH_SESSION_SECRET,
  authSessionTtlHours: parsePositiveInteger(process.env.AUTH_SESSION_TTL_HOURS, 12),
  authSessionIdleMinutes: parsePositiveInteger(process.env.AUTH_SESSION_IDLE_MINUTES, 120),
  authMaxActiveSessions: parsePositiveInteger(process.env.AUTH_MAX_ACTIVE_SESSIONS, 10),
  smtpHost: process.env.SMTP_HOST?.trim() || undefined,
  smtpPort: parsePositiveInteger(process.env.SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpStartTls: parseBoolean(process.env.SMTP_STARTTLS, true),
  smtpUsername: process.env.SMTP_USERNAME?.trim() || undefined,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM?.trim() || undefined,
  publicAppUrl: process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost/firewall"
};

function validateProductionEnv() {
  const failures = productionConfigFailures({
    nodeEnv: env.nodeEnv,
    appProfile: env.appProfile,
    authSessionSecret: process.env.AUTH_SESSION_SECRET ?? DEFAULT_AUTH_SESSION_SECRET,
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY,
    databaseUrl: env.databaseUrl,
    actionExecutionMode: env.actionExecutionMode,
    actionAllowLabUnrestrictedManagement: env.actionAllowLabUnrestrictedManagement,
    corsOrigins: env.corsOrigins
  });

  if (failures.length > 0) {
    throw new Error(`Production configuration is unsafe: ${failures.join("; ")}.`);
  }
}

validateProductionEnv();

export const maxUploadBytes = env.maxUploadMb * 1024 * 1024;
export const isProduction = productionProfile;
