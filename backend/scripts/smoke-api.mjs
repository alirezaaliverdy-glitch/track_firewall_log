process.env.NODE_ENV ??= "development";
process.env.APP_PROFILE ??= "lab";
process.env.PRODUCT_MODE ??= "persian_command_catalog";
process.env.DATABASE_URL ??= "postgresql://127.0.0.1:1/firewall_quality_gate_smoke";
process.env.CORS_ORIGIN ??= "http://127.0.0.1:4177";

const { buildApp } = await import("../dist/app.js");
const { shutdownDatabase } = await import("../dist/db/prisma.js");

function fail(message) {
  throw new Error(`[backend-smoke] ${message}`);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => undefined);
  return { response, body };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} did not return a JSON object`);
}

const app = await buildApp({ authRequired: false });

try {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });

  const live = await requestJson(`${address}/api/health/live`);
  if (live.response.status !== 200) fail(`/api/health/live returned ${live.response.status}`);
  assertObject(live.body, "/api/health/live");
  if (live.body.status !== "live" || live.body.service !== "firewall-log-analyzer-backend") {
    fail("/api/health/live contract changed");
  }

  const session = await requestJson(`${address}/api/auth/session-status`);
  if (session.response.status !== 200) fail(`/api/auth/session-status returned ${session.response.status}`);
  assertObject(session.body, "/api/auth/session-status");
  if (session.body.ok !== true || session.body.authenticated !== false) fail("/api/auth/session-status anonymous contract changed");

  const me = await requestJson(`${address}/api/auth/me`);
  if (me.response.status !== 401) fail(`/api/auth/me returned ${me.response.status}`);
  assertObject(me.body, "/api/auth/me");
  if (me.body.ok !== false || me.body.error !== "unauthorized") fail("/api/auth/me unauthorized contract changed");

  const login = await requestJson(`${address}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "quality-gate", password: "short" }),
  });
  if (login.response.status !== 401) fail(`/api/auth/login invalid credentials returned ${login.response.status}`);
  assertObject(login.body, "/api/auth/login");
  if (login.body.ok !== false || login.body.error !== "invalid_credentials") fail("/api/auth/login invalid-credentials contract changed");

  console.log(JSON.stringify({ ok: true, checkedEndpoints: 4, address }));
} finally {
  await app.close().catch(() => undefined);
  await shutdownDatabase().catch(() => undefined);
}
