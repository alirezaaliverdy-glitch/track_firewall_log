import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/routes/device-onboarding.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../src/lib/deviceOnboarding.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");

test("Cisco legacy compatibility is carried through onboarding session boundaries", () => {
  assert.match(serviceSource, /ciscoLegacyCompatibilityApproved:\s*\(input\.ciscoLegacyCompatibilityApproved === true\)/);
  assert.match(serviceSource, /ciscoLegacyCompatibilityApproved:\s*input\.ciscoLegacyCompatibilityApproved === undefined \? session\.draft\.ciscoLegacyCompatibilityApproved === true : input\.ciscoLegacyCompatibilityApproved === true/);
  assert.match(serviceSource, /runReadOnlyCommands\(asDevice\(session, "modern"\), \["platform"\]\)/);
  assert.match(serviceSource, /session\.draft\.ciscoLegacyCompatibilityApproved !== true/);
  assert.match(serviceSource, /runReadOnlyCommands\(asDevice\(session, "legacy_cisco"\), \["platform"\]\)/);
  assert.match(serviceSource, /sshCompatibilityProfile: "legacy_cisco"/);
  assert.match(pageSource, /change\("ciscoLegacyCompatibilityApproved", event\.target\.checked\)/);
  assert.match(apiSource, /ciscoLegacyCompatibilityApproved\?: boolean/);
});

test("Test Connection records connector invocation and sanitized diagnostics", () => {
  assert.match(serviceSource, /session\.test = \{ connected: false, connectorInvoked: true/);
  assert.match(serviceSource, /legacyCompatibilityRequested: result\.connection\.diagnostic\.legacyCompatibilityRequested/);
  assert.match(serviceSource, /legacyCompatibilityApplied: result\.connection\.diagnostic\.legacyCompatibilityApplied/);
  assert.match(serviceSource, /connectionPhase: result\.connection\.diagnostic\.connectionPhase/);
  assert.match(serviceSource, /connectorInvoked: ciscoDiagnostic\?\.connectorInvoked \?\? session\.test\?\.connectorInvoked === true/);
  assert.match(routeSource, /diagnostic\?\.connectorInvoked \?\? false/);
  assert.doesNotMatch(serviceSource, /password:\s*session\.test|privateKey:\s*session\.test|passphrase:\s*session\.test|enableSecret:\s*session\.test/);
});

test("authentication failure does not trigger legacy retry", () => {
  assert.match(serviceSource, /const negotiationFailed = diagnostic\?\.stage === "ssh_negotiation" \|\| diagnostic\?\.code === "CISCO_SSH_NEGOTIATION_FAILED"/);
  assert.match(serviceSource, /if \(!negotiationFailed \|\| session\.draft\.ciscoLegacyCompatibilityApproved !== true\) throw error/);
});

test("successful Cisco SSH with unsupported platform reaches review instead of negotiation failure", () => {
  assert.match(serviceSource, /status: "platform_unsupported"/);
  assert.match(serviceSource, /connectivityVerified: true/);
  assert.match(serviceSource, /connectorInvoked: session\.test\?\.connectorInvoked === true/);
  assert.match(pageSource, /onboarding\.messages\.platformUnsupported/);
  assert.match(pageSource, /setStep\(3\)/);
});

test("managementIp registration is idempotent and exposes structured conflicts", () => {
  assert.match(serviceSource, /function normalizeManagementAddress/);
  assert.match(serviceSource, /findUnique\(\{ where: \{ managementIp \}, include: \{ device: true \} \}\)/);
  assert.match(serviceSource, /resolveOnboardingRegistrationTarget\(tx, draft, session\.deviceId\)/);
  assert.match(serviceSource, /tx\.device\.update\(\{ where: \{ id: target\.deviceId \}, data \}\)/);
  assert.match(serviceSource, /syncDeviceRecordToAsset\(tx, device\)/);
  assert.match(serviceSource, /mergeReactivatedCapabilities/);
  assert.match(routeSource, /code: "DEVICE_MANAGEMENT_IP_CONFLICT"/);
  assert.match(routeSource, /reply\.code\(409\)\.send\(conflictPayload\(error\)\)/);
  assert.match(apiSource, /existingDeviceId/);
  assert.match(apiSource, /route/);
  assert.match(pageSource, /onboarding\.conflict\.openExisting/);
  assert.match(pageSource, /onboarding\.conflict\.editAddress/);
  assert.match(pageSource, /onboarding\.conflict\.cancel/);
  assert.doesNotMatch(routeSource, /PrismaClientKnownRequestError|source file|\.ts:/);
});