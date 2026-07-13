import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { PRODUCT_FEATURES } from "../src/product-state/product-state.registry.js";
import { resetOnboardingSessionsForTest } from "../src/services/device-onboarding.service.js";

test("Task 19.1 onboarding exposes one safe session engine for every required route", async () => {
  resetOnboardingSessionsForTest();
  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "cisco", platform: "cisco-ios-xe" } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().draft.vendor, "cisco");
    assert.equal(response.json().draft.platform, "cisco-ios-xe");
    assert.equal(response.json().status, "draft");
    assert.equal("privateEvidence" in response.json(), false);

    const routeSource = readFileSync(join(process.cwd(), "..", "src", "routes", "appRoutes.tsx"), "utf8");
    for (const route of ["/assets/devices/new", "/assets/onboarding", "/assets/vendors/:vendorKey/devices/new", "/assets/devices/:deviceId/setup"]) {
      assert.match(routeSource, new RegExp(route.replace(/[/:]/g, (value) => value === "/" ? "\\/" : value === ":" ? "\\:" : value)));
    }
    assert.equal((routeSource.match(/component: DeviceOnboardingPage/g) ?? []).length, 4);
  } finally { await app.close(); }
});

test("Task 19.1 onboarding rejects plaintext secrets and unsupported targets", async () => {
  resetOnboardingSessionsForTest();
  const app = await buildApp({ authRequired: false });
  try {
    const unsupported = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "pfsense" } });
    assert.equal(unsupported.statusCode, 400);
    assert.equal(unsupported.json().error.code, "ONBOARDING_SESSION_INVALID");

    const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux" } });
    const id = created.json().id;
    const secret = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/answers`, payload: { password: "must-not-be-accepted" } });
    assert.equal(secret.statusCode, 400);
    assert.equal(secret.json().error.code, "ONBOARDING_ANSWERS_INVALID");

    const missing = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/test`, payload: {} });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error.connectorInvoked, false);
  } finally { await app.close(); }
});

test("Task 19.1 Product State makes onboarding and workspace real without primary-nav noise", () => {
  const required = [
    "assets.device_onboarding_new", "assets.device_onboarding", "assets.vendor_device_onboarding", "assets.device_setup",
    "assets.device_detail", "assets.device_workspace_section", "assets.vendor_detail"
  ];
  for (const key of required) {
    const feature = PRODUCT_FEATURES.find((item) => item.key === key);
    assert.ok(feature, `Missing Product State feature ${key}`);
    assert.equal(feature.state, "implemented");
    assert.equal(feature.backendReady && feature.apiReady && feature.uiReady && feature.tested, true);
    assert.equal(feature.navigationVisible, false);
  }

  const sources = [
    "src/features/assets/pages/AssetsOverviewPage.tsx",
    "src/features/assets/pages/AssetListPage.tsx",
    "src/features/vendors/cisco/pages/CiscoOverviewPage.tsx",
    "src/features/vendors/pages/VendorDetailPage.tsx"
  ].map((file) => readFileSync(join(process.cwd(), "..", file), "utf8")).join("\n");
  assert.match(sources, /ثبت دستگاه/);
  assert.match(sources, /assets\/vendors\/cisco\/devices\/new/);
});

test("Task 19.1 workspace endpoint returns a structured not-found contract", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "GET", url: "/api/device-workspaces/not-a-real-device" });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "DEVICE_WORKSPACE_NOT_FOUND");
  } finally { await app.close(); }
});
