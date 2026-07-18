import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { resetOnboardingSessionsForTest } from "../src/services/device-onboarding.service.js";

const service = readFileSync(new URL("../src/services/device-onboarding.service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/routes/device-onboarding.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../src/lib/deviceOnboarding.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/features/assets/pages/DeviceOnboardingPage.tsx", import.meta.url), "utf8");

test.after(async () => { await prisma.$disconnect(); });

test("unverified registration has an explicit honest API and UI contract", () => {
  assert.match(routes, /sessions\/:sessionId\/register-unverified/);
  assert.match(client, /registerUnverifiedOnboarding/);
  assert.match(page, /ثبت اولیه بدون تست اتصال/);
  assert.match(page, /verificationStatus === "unverified"/);
  assert.match(page, /connectorInvoked === false/);
});

test("onboarding form makes required identity fields explicit and blocks an empty device name before the request", () => {
  assert.match(page, /نام دستگاه \*/);
  assert.match(page, /placeholder="مثال: edge-switch-01"/);
  assert.match(page, /نام دستگاه الزامی است؛ متن کم‌رنگ داخل کادر فقط نمونه است/);
  assert.match(page, /validateRegistration\(true\)/);
  assert.match(page, /aria-invalid=\{invalidField === "name"\}/);
  assert.match(page, /role="alert" className="state-card is-error"/);
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

test("unverified registration creates one Device and linked Asset without a credential, then rejects a duplicate", async (t) => {
  const suffix = Date.now().toString(36);
  const name = `unverified-${suffix}`;
  const host = `192.0.2.${Math.floor(Date.now() % 100) + 100}`;
  const app = await buildApp({ authRequired: false });
  let deviceId = "";
  let assetId = "";
  t.after(async () => {
    if (assetId) await prisma.asset.deleteMany({ where: { id: assetId } });
    if (deviceId) await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });
  const before = { devices: await prisma.device.count(), assets: await prisma.asset.count() };
  const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux", platform: "linux" } });
  const response = await app.inject({
    method: "POST", url: `/api/device-onboarding/sessions/${created.json().id}/register-unverified`,
    payload: { vendor: "linux", platform: "linux", connectionMethod: "ssh", name, host, managementPort: 22, credentialId: "", site: "", location: "", environment: "lab" }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "completed");
  assert.equal(response.json().result.verificationStatus, "unverified");
  assert.equal(response.json().result.connectorInvoked, false);
  assert.equal(response.json().result.connectionVerified, false);
  deviceId = response.json().result.deviceId;
  assetId = response.json().result.assetId;
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { asset: true } });
  assert.equal(device?.status, "unknown");
  assert.equal(device?.credentialId, null);
  assert.equal(device?.asset?.id, assetId);
  assert.equal(await prisma.device.count(), before.devices + 1);
  assert.equal(await prisma.asset.count(), before.assets + 1);

  const duplicateSession = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux", platform: "linux" } });
  const duplicate = await app.inject({
    method: "POST", url: `/api/device-onboarding/sessions/${duplicateSession.json().id}/register-unverified`,
    payload: { vendor: "linux", platform: "linux", connectionMethod: "ssh", name: `${name}-duplicate`, host, managementPort: 22, credentialId: "", site: "", location: "", environment: "lab" }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "ONBOARDING_DEVICE_DUPLICATE");
  assert.equal(duplicate.json().error.existingDeviceId, deviceId);
});

test("unsupported API is rejected, malformed credential is sanitized, and persisted sessions survive cache loss", async (t) => {
  const app = await buildApp({ authRequired: false });
  const credential = await prisma.deviceCredential.create({
    data: { name: `invalid-onboarding-${Date.now()}`, type: "password", username: "invalid", secretEncrypted: "v1:invalid:invalid:invalid" }
  });
  t.after(async () => { await prisma.deviceCredential.deleteMany({ where: { id: credential.id } }); await app.close(); });
  const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "fortigate", platform: "fortios" } });
  const id = created.json().id;
  const api = await app.inject({
    method: "POST", url: `/api/device-onboarding/sessions/${id}/answers`,
    payload: { vendor: "fortigate", platform: "fortios", connectionMethod: "api", name: "api-rejected", host: "192.0.2.240", managementPort: 443, credentialId: credential.id, site: "", location: "", environment: "lab" }
  });
  assert.equal(api.statusCode, 400);
  assert.match(api.json().error.message, /Use SSH or register unverified/);

  const ssh = await app.inject({
    method: "POST", url: `/api/device-onboarding/sessions/${id}/answers`,
    payload: { vendor: "fortigate", platform: "fortios", connectionMethod: "ssh", name: "credential-invalid", host: "192.0.2.240", managementPort: 22, credentialId: credential.id, site: "", location: "", environment: "lab" }
  });
  assert.equal(ssh.statusCode, 200);
  const connection = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/test`, payload: {} });
  assert.equal(connection.statusCode, 400);
  assert.equal(connection.json().error.code, "ONBOARDING_CREDENTIAL_INVALID");
  assert.doesNotMatch(connection.json().error.message, /decipher|auth tag|Unsupported state|v1:/i);

  resetOnboardingSessionsForTest();
  const restored = await app.inject({ method: "GET", url: `/api/device-onboarding/sessions/${id}` });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.json().status, "credential_invalid");
});

test("placement failure rolls back Device, Asset, health, and audit writes", async (t) => {
  const suffix = Date.now().toString(36);
  const desired = `rollback-desired-${suffix}`;
  const first = await prisma.assetSite.create({ data: { name: `rollback-first-${suffix}`, slug: desired } });
  const second = await prisma.assetSite.create({ data: { name: desired, slug: `rollback-second-${suffix}` } });
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await prisma.assetSite.deleteMany({ where: { id: { in: [first.id, second.id] } } }); await app.close(); });
  const name = `rollback-device-${suffix}`;
  const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux", platform: "linux" } });
  const response = await app.inject({
    method: "POST", url: `/api/device-onboarding/sessions/${created.json().id}/register-unverified`,
    payload: { vendor: "linux", platform: "linux", connectionMethod: "ssh", name, host: "192.0.2.241", managementPort: 22, credentialId: "", site: desired, location: "rack", environment: "lab" }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(await prisma.device.count({ where: { name } }), 0);
  assert.equal(await prisma.asset.count({ where: { name } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "device.onboarding_unverified_created", metadata: { path: ["siteId"], equals: first.id } } }), 0);
});

test("missing and expired sessions return 404 and cannot be resumed", async (t) => {
  const app = await buildApp({ authRequired: false });
  const id = `expired-${Date.now()}`;
  await prisma.deviceOnboardingSession.create({
    data: {
      id, status: "draft", step: "vendor", draftJson: {}, privateEvidenceJson: {},
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  t.after(async () => {
    await prisma.deviceOnboardingSession.deleteMany({ where: { id } });
    await app.close();
  });
  const missing = await app.inject({ method: "GET", url: "/api/device-onboarding/sessions/does-not-exist" });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "ONBOARDING_SESSION_NOT_FOUND");
  const expired = await app.inject({ method: "GET", url: `/api/device-onboarding/sessions/${id}` });
  assert.equal(expired.statusCode, 404);
  assert.match(expired.json().error.message, /expired/i);
});

test("verified commit cannot report success before a real connector invocation", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux", platform: "linux" } });
  const commit = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${created.json().id}/commit`, payload: {} });
  assert.equal(commit.statusCode, 502);
  assert.notEqual(commit.json().connectorInvoked, true);
  assert.match(commit.json().error.message, /connector-backed test/i);
});
