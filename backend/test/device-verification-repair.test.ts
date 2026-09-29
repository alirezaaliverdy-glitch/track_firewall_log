import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { publicAttempt } from "../src/services/device-verification.service.js";

const routes = readFileSync(new URL("../src/routes/device-workspaces.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/device-verification.service.ts", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");
const actionWorkspace = readFileSync(new URL("../../src/components/actions/ActionCenterWorkspace.tsx", import.meta.url), "utf8");

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

test("successful SSH sessions do not expose success messages as errors", () => {
  const row = {
    id: "successful-ssh",
    status: "connection_verified",
    step: "detect",
    testJson: { connected: true, connectorInvoked: true, error: "SSH connection succeeded." },
    detectionJson: null,
    resultJson: null,
    updatedAt: new Date("2026-09-29T00:00:00.000Z"),
    expiresAt: new Date("2026-09-30T00:00:00.000Z")
  } as unknown as Parameters<typeof publicAttempt>[0];
  const attempt = publicAttempt(row);
  assert.equal(attempt.connected, true);
  assert.equal(attempt.error, null);
});

test("failed SSH sessions retain actionable errors", () => {
  const row = {
    id: "failed-ssh",
    status: "connection_failed",
    step: "connection",
    testJson: { connected: false, connectorInvoked: true, error: "Authentication failed." },
    detectionJson: null,
    resultJson: null,
    updatedAt: new Date("2026-09-29T00:00:00.000Z"),
    expiresAt: new Date("2026-09-30T00:00:00.000Z")
  } as unknown as Parameters<typeof publicAttempt>[0];
  const attempt = publicAttempt(row);
  assert.equal(attempt.connected, false);
  assert.equal(attempt.error, "Authentication failed.");
});

test("Action Center only renders current failed connection diagnostics as alerts", () => {
  assert.match(actionWorkspace, /const currentFailure = verification\?\.connected \? null : verification\?\.error;/);
  assert.match(actionWorkspace, /\{currentFailure && <div className="operator-connection__error" role="alert">\{currentFailure\}<\/div>\}/);
  assert.doesNotMatch(actionWorkspace, /\{verification\?\.error && <div className="operator-connection__error"/);
});

test("missing verification device returns the structured not-found response", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/api/devices/not-a-real-device/verification" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "DEVICE_VERIFICATION_FAILED");
});
