import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextAvailableCredentialName } from "../../src/lib/credentialNames.js";

test("new Cisco credentials receive a stable available name instead of failing on a duplicate", () => {
  assert.equal(nextAvailableCredentialName("cisco", ["linux", "cisco"]), "cisco-2");
  assert.equal(nextAvailableCredentialName("cisco", ["cisco", "cisco-2", "CISCO-3"]), "cisco-4");
  assert.equal(nextAvailableCredentialName("branch-cisco", ["cisco"]), "branch-cisco");
});

test("credential API maps Prisma conflicts without exposing raw database diagnostics", () => {
  const route = readFileSync(new URL("../src/routes/credentials.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/credential.service.ts", import.meta.url), "utf8");
  assert.match(service, /P2002/);
  assert.match(service, /CREDENTIAL_NAME_CONFLICT/);
  assert.match(route, /error\.code/);
  assert.doesNotMatch(route, /detail:\s*message/);
});

test("generic onboarding exposes its Linux default as the real selected vendor", () => {
  const page = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");
  assert.match(page, /query \|\| "linux"/);
  assert.match(page, /const selected = activeForm\.vendor === item\.key/);
  assert.doesNotMatch(page, /vendorConfirmed/);
});

test("Cisco negotiation failure offers an explicit one-click compatibility retry", () => {
  const page = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");
  assert.match(page, /CISCO_SSH_NEGOTIATION_FAILED/);
  assert.match(page, /retryCiscoWithCompatibility/);
  assert.match(page, /ciscoLegacyCompatibilityApproved: true/);
  assert.match(page, /onboarding-cisco-compatibility/);
});

test("onboarding makes edit mode explicit and invalidates stale connection evidence", () => {
  const page = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");
  assert.match(page, /const isEditing = Boolean\(params\.deviceId\)/);
  assert.match(page, /Save device changes/);
  assert.match(page, /status: "draft", test: null, detection: null, discovery: null, preview: null/);
  assert.match(page, /onboarding-context-bar/);
});
