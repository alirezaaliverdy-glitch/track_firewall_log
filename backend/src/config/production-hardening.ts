import type { ActionExecutionMode } from "./env.js";

const MIN_SECRET_LENGTH = 32;
const DEFAULT_AUTH_SESSION_SECRET = "development-only-change-this-secret";
const DEFAULT_ADMIN_PASSWORDS = new Set(["", "admin", "password", "change-me", "change-me-please"]);
const DEFAULT_SECRET_MARKERS = ["change-me", "replace-with", "development-only", "default", "secret"];
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.7.13"
];

export function resolveProductionProfile(input: { nodeEnv?: string; appProfile?: string }) {
  return input.nodeEnv === "production" || input.appProfile === "production";
}

export function parseCorsOriginsForProfile(value: string | undefined, production: boolean) {
  const configured = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return production ? Array.from(new Set(configured)) : Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configured]));
}

function isWeakSecret(value: string | undefined, defaultValue?: string) {
  const normalized = (value ?? "").trim();
  const lower = normalized.toLowerCase();
  return normalized.length < MIN_SECRET_LENGTH ||
    Boolean(defaultValue && normalized === defaultValue) ||
    DEFAULT_SECRET_MARKERS.some((marker) => lower.includes(marker));
}

function hasDefaultPostgresCredentials(databaseUrl: string | undefined) {
  if (!databaseUrl) return false;
  try {
    const parsed = new URL(databaseUrl);
    return parsed.protocol.startsWith("postgres") && parsed.username === "postgres" && parsed.password === "postgres";
  } catch {
    return databaseUrl.includes("postgres:postgres@");
  }
}

function isDefaultAdminPassword(value: string | undefined) {
  const normalized = (value ?? "").trim();
  const lower = normalized.toLowerCase();
  return DEFAULT_ADMIN_PASSWORDS.has(lower) ||
    DEFAULT_SECRET_MARKERS.some((marker) => lower.includes(marker));
}

export function productionConfigFailures(input: {
  nodeEnv?: string;
  appProfile?: string;
  authSessionSecret?: string;
  credentialEncryptionKey?: string;
  databaseUrl?: string;
  adminPassword?: string;
  actionExecutionMode?: ActionExecutionMode;
  actionAllowLabUnrestrictedManagement?: boolean;
  corsOrigins?: string[];
}) {
  if (!resolveProductionProfile(input)) return [];

  const failures: string[] = [];
  if (isWeakSecret(input.authSessionSecret, DEFAULT_AUTH_SESSION_SECRET)) {
    failures.push(`AUTH_SESSION_SECRET must be set to a non-default value with at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (isWeakSecret(input.credentialEncryptionKey)) {
    failures.push(`CREDENTIAL_ENCRYPTION_KEY must be set to a non-default value with at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (hasDefaultPostgresCredentials(input.databaseUrl)) {
    failures.push("DATABASE_URL must not use the default postgres:postgres credentials in production");
  }
  if (isDefaultAdminPassword(input.adminPassword) || (input.adminPassword ?? "").length < 8) {
    failures.push("ADMIN_PASSWORD must be changed from the default and contain at least 8 characters in production");
  }
  if (input.actionExecutionMode === "quick_controlled" || input.actionExecutionMode === "lab_fast" || input.actionAllowLabUnrestrictedManagement === true) {
    failures.push("Lab quick controlled execution and unrestricted management are not allowed in production");
  }
  if (!input.corsOrigins || input.corsOrigins.length === 0 || input.corsOrigins.some((origin) => /localhost|127\.0\.0\.1|192\.168\./.test(origin))) {
    failures.push("CORS origins must be explicitly configured for production and must not include development origins");
  }
  return failures;
}
