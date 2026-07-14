import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { PRODUCT_FEATURES } from "../src/product-state/product-state.registry.js";
import { resetOnboardingSessionsForTest } from "../src/services/device-onboarding.service.js";
import { prisma } from "../src/db/prisma.js";

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

test("Task 19.2-A Product State keeps implemented onboarding visible in Assets navigation", () => {
  const required = [
    "assets.device_onboarding", "assets.vendor_device_onboarding", "assets.device_setup",
    "assets.device_detail", "assets.device_workspace_section", "assets.vendor_detail"
  ];
  for (const key of required) {
    const feature = PRODUCT_FEATURES.find((item) => item.key === key);
    assert.ok(feature, `Missing Product State feature ${key}`);
    assert.equal(feature.state, "implemented");
    assert.equal(feature.backendReady && feature.apiReady && feature.uiReady && feature.tested, true);
    assert.equal(feature.navigationVisible, false);
  }
  const addDevice = PRODUCT_FEATURES.find((item) => item.key === "assets.device_onboarding_new");
  assert.ok(addDevice, "Missing Product State feature assets.device_onboarding_new");
  assert.equal(addDevice.state, "implemented");
  assert.equal(addDevice.backendReady && addDevice.apiReady && addDevice.uiReady && addDevice.tested, true);
  assert.equal(addDevice.navigationVisible, true);
  assert.equal(addDevice.route, "/assets/devices/new");

  const sources = [
    "src/features/dashboard/pages/DashboardPage.tsx",
    "src/features/assets/pages/AssetsOverviewPage.tsx",
    "src/features/assets/pages/AssetListPage.tsx",
    "src/features/vendors/cisco/pages/CiscoOverviewPage.tsx",
    "src/features/vendors/pages/VendorDetailPage.tsx"
  ].map((file) => readFileSync(join(process.cwd(), "..", file), "utf8")).join("\n");
  assert.match(sources, /ثبت دستگاه/);
  assert.match(sources, /ثبت دستگاه جدید/);
  assert.match(sources, /ثبت دستگاه FortiGate/);
  assert.match(sources, /ثبت دستگاه MikroTik/);
  assert.match(sources, /ثبت سرور Linux/);
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

test("Task 19.1 R-F workspace exposes stored-data charts and capability-gated vendor sections", async (t) => {
  const device = await prisma.device.create({ data: { name: `task19-rf-${Date.now()}`, vendor: "linux", type: "linux_edge", host: "192.0.2.219", managementPort: 22, protocol: "ssh", environment: "lab", status: "unknown", capabilities: {} } });
  t.after(async () => { await prisma.device.deleteMany({ where: { id: device.id } }); });
  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "GET", url: `/api/device-workspaces/${device.id}` });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(Object.keys(body.charts).sort(), ["actions", "availability", "connectorResults", "findings", "healthScore", "recentChanges", "resources"]);
    assert.equal(body.charts.healthScore.length, 0, "workspace must not invent health history");
    assert.equal(body.vendor.key, "linux");
    assert.ok(body.vendor.sections.some((item: { key: string; state: string; requirement: string }) => item.key === "cpu" && item.state === "no_data" && item.requirement));

    const source = readFileSync(join(process.cwd(), "..", "src", "features", "assets", "pages", "AssetDetailPage.tsx"), "utf8");
    for (const range of ["1h", "6h", "24h", "7d", "30d"]) assert.match(source, new RegExp(`\\"${range}\\"`));
    assert.match(source, /workspace\.vendor\.sections/);
    assert.match(source, /No verified data is stored/);
  } finally { await app.close(); }
});
