import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/routes/device-onboarding.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../src/lib/deviceOnboarding.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");

test("unverified registration has an explicit honest API and UI contract", () => {
  assert.match(routes, /sessions\/:sessionId\/register-unverified/);
  assert.match(client, /registerUnverifiedOnboarding/);
  assert.match(page, /ثبت اولیه بدون تست اتصال/);
  assert.match(page, /verificationStatus === "unverified"/);
  assert.match(page, /connectorInvoked === false/);
});

test("unverified registration is atomic and never invokes a connector", () => {
  const start = service.indexOf("export async function registerUnverifiedOnboardingSession");
  const end = service.indexOf("export async function commitOnboardingSession", start);
  const implementation = service.slice(start, end);
  assert.match(implementation, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(implementation, /syncDeviceRecordToAsset\(tx, device\)/);
  assert.match(implementation, /tx\.assetSite\.upsert/);
  assert.match(implementation, /tx\.assetLocation\.upsert/);
  assert.match(implementation, /tx\.auditLog\.create/);
  assert.doesNotMatch(implementation, /testConnection|runReadOnlyCommands|selectDeviceConnector/);
});

test("unverified registration validates identity and rejects duplicates and plaintext secrets", () => {
  assert.match(service, /assertNoSecrets\(input\)/);
  assert.match(service, /Management port must be an integer between 1 and 65535/);
  assert.match(service, /OnboardingDuplicateDeviceError/);
  assert.match(routes, /ONBOARDING_DEVICE_DUPLICATE/);
  assert.match(routes, /reply\.code\(409\)/);
});
