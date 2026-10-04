import { loadEnv } from "vite";

const APP_ENVS = new Set(["development", "staging", "production"]);
const SECRET_NAME_PATTERN = /(?:^|_)(?:SECRET|SECRETS|TOKEN|TOKENS|PASSWORD|PASS|CREDENTIAL|CREDENTIALS|PRIVATE|KEY|KEYS)(?:_|$)/i;
// Keep this in sync with the default mode of `vite build`. Vite loads .env files
// after this script runs, so process.env alone cannot detect exposed secrets.
const buildEnv = loadEnv("production", process.cwd(), "VITE_");

function fail(message) {
  throw new Error(`[frontend-env] ${message}`);
}

function envValue(name) {
  const value = buildEnv[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const appEnv = envValue("VITE_APP_ENV") ?? "development";
if (!APP_ENVS.has(appEnv)) fail("VITE_APP_ENV must be development, staging, or production");

const basePath = envValue("VITE_BASE_PATH") ?? "/";
if (!basePath.startsWith("/")) fail("VITE_BASE_PATH must start with /");

const apiBaseUrl = envValue("VITE_API_BASE_URL");
if (appEnv === "production" && !apiBaseUrl) fail("VITE_API_BASE_URL is required for production frontend builds");

if (appEnv === "production" && apiBaseUrl && /^https?:\/\//i.test(apiBaseUrl)) {
  const parsed = new URL(apiBaseUrl);
  if (parsed.username || parsed.password) fail("VITE_API_BASE_URL must not contain credentials");
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || /^192\.168\./.test(parsed.hostname)) {
    fail("VITE_API_BASE_URL must not point at a local development host in production");
  }
}

const exposedSecretNames = Object.keys(buildEnv)
  .filter((name) => name.startsWith("VITE_"))
  .filter((name) => SECRET_NAME_PATTERN.test(name.slice("VITE_".length)));

if (exposedSecretNames.length > 0) {
  fail(`VITE_ variables must not expose secret-like values: ${exposedSecretNames.join(", ")}`);
}

console.log(JSON.stringify({
  ok: true,
  appEnv,
  basePath,
  apiBaseUrlConfigured: Boolean(apiBaseUrl)
}));
