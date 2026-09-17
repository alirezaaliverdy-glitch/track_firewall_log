import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";

const routes = readFileSync(new URL("../src/routes/device-workspaces.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/device-verification.service.ts", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");

test("device verification exposes the required device-scoped contract", () => {
  assert.match(routes, /\/api\/devices\/:deviceId\/connection-test/);
  assert.match(routes, /\/api\/devices\/:deviceId\/verification"/);
  assert.match(routes, /\/api\/devices\/:deviceId\/verification\/retry/);
  assert.match(routes, /\/api\/devices\/:deviceId\/verification\/commit/);
});

test("device verification reuses persisted onboarding and requires connector evidence", () => {
  assert.match(service, /createOnboardingSession/);
  assert.match(service, /testOnboardingConnection/);
  assert.match(service, /commitOnboardingSession/);
  assert.match(service, /test\.connectorInvoked === true/);
  assert.match(onboarding, /await persistSession\(session\);\s*if \(session\.draft\.vendor === "cisco"\)/);
  assert.match(onboarding, /connectorInvoked: session\.test\?\.connectorInvoked === true/);
});

test("missing verification device returns the structured not-found response", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/api/devices/not-a-real-device/verification" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "DEVICE_VERIFICATION_FAILED");
});
