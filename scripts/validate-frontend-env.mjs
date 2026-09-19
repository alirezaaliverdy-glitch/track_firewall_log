const APP_ENVS = new Set(["development", "staging", "production"]);
const SECRET_NAME_PATTERN = /(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|KEY)$/i;

function fail(message) {
  throw new Error(`[frontend-env] ${message}`);
}

function envValue(name) {
  const value = process.env[name];
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
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || /^192\.168\./.test(parsed.hostname)) {
    fail("VITE_API_BASE_URL must not point at a local development host in production");
  }
}

const exposedSecretNames = Object.keys(process.env)
  .filter((name) => name.startsWith("VITE_"))
  .filter((name) => SECRET_NAME_PATTERN.test(name));

if (exposedSecretNames.length > 0) {
  fail(`VITE_ variables must not expose secret-like values: ${exposedSecretNames.join(", ")}`);
}

console.log(JSON.stringify({
  ok: true,
  appEnv,
  basePath,
  apiBaseUrlConfigured: Boolean(apiBaseUrl)
}));
