import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { PRODUCT_FEATURES } from "../src/product-state/product-state.registry.js";
import { resetOnboardingSessionsForTest } from "../src/services/device-onboarding.service.js";
import { prisma } from "../src/db/prisma.js";
import { ciscoIosXeSshConnector } from "../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { createCredential } from "../src/services/credential.service.js";

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

test("Task 19.2A Cisco onboarding uses explicit connector-backed transitions and persists the Device", async (t) => {
  resetOnboardingSessionsForTest();
  const originalRun = ciscoIosXeSshConnector.runReadOnlyCommands.bind(ciscoIosXeSshConnector);
  const credential = await createCredential({ name: `task19-2a-cisco-${Date.now()}`, type: "password", username: "admin", password: "test-secret" });
  ciscoIosXeSshConnector.runReadOnlyCommands = async (_device, commandIds) => ({
    connectorInvoked: true,
    warnings: [],
    results: commandIds.map((commandId) => ({
      commandId,
      command: `show ${commandId}`,
      stdout: commandId === "platform"
        ? "Cisco IOS XE Software, Version 17.09\nModel Number : C9300-24T\ntehran-sw uptime is 1 week"
        : commandId === "interfacesStatus"
          ? "Gi1/0/1  connected  1  a-full a-1000"
          : commandId === "vlanBrief"
            ? "1 default active Gi1/0/1"
            : "NAME: Chassis, DESCR: Cisco Catalyst",
      stderr: "",
      exitCode: 0,
      durationMs: 1
    }))
  });
  t.after(async () => {
    ciscoIosXeSshConnector.runReadOnlyCommands = originalRun;
    await prisma.device.deleteMany({ where: { name: "task19-2a-cisco" } });
    await prisma.deviceCredential.deleteMany({ where: { id: credential.id } });
  });

  const app = await buildApp({ authRequired: false });
  try {
    const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "cisco", platform: "cisco-ios-xe" } });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;

    const answers = await app.inject({
      method: "POST",
      url: `/api/device-onboarding/sessions/${id}/answers`,
      payload: { vendor: "cisco", platform: "cisco-ios-xe", connectionMethod: "ssh", name: "task19-2a-cisco", host: "192.168.7.12", managementPort: 22, credentialId: credential.id, site: "Tehran", location: "Rack", environment: "lab" }
    });
    assert.equal(answers.statusCode, 200);
    assert.equal(answers.json().status, "answers_saved");
    assert.equal(answers.json().test, null);

    const connection = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/test`, payload: {} });
    assert.equal(connection.statusCode, 200);
    assert.equal(connection.json().status, "connection_verified");
    assert.equal(connection.json().test.connectorInvoked, true);

    const detection = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/detect`, payload: {} });
    assert.equal(detection.statusCode, 200);
    assert.equal(detection.json().status, "platform_detected");
    assert.equal(detection.json().detection.platform, "cisco-ios-xe");
    assert.ok(detection.json().detection.evidence.length > 0);

    const discovery = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/discover`, payload: {} });
    assert.equal(discovery.statusCode, 200);
    assert.equal(discovery.json().status, "discovery_completed");
    assert.equal(discovery.json().discovery.connectorInvoked, true);

    const preview = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/preview`, payload: {} });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.json().status, "preview_ready");
    assert.equal(preview.json().preview.deviceMutation, false);

    const commit = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/commit`, payload: {} });
    assert.equal(commit.statusCode, 200);
    assert.equal(commit.json().status, "completed");
    assert.equal(commit.json().result.connectorInvoked, true);
    assert.match(commit.json().result.route, /^\/assets\/devices\//);
    const persisted = await prisma.device.findUnique({ where: { id: commit.json().result.deviceId } });
    assert.equal(persisted?.name, "task19-2a-cisco");
    assert.equal(persisted?.host, "192.168.7.12");
  } finally { await app.close(); }
});

test("Task 20 onboarding exposes required endpoint aliases and recoverable retry", async () => {
  resetOnboardingSessionsForTest();
  const app = await buildApp({ authRequired: false });
  try {
    const created = await app.inject({ method: "POST", url: "/api/device-onboarding/sessions", payload: { vendor: "linux" } });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;

    const missingConnection = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/test-connection`, payload: {} });
    assert.equal(missingConnection.statusCode, 400);
    assert.equal(missingConnection.json().error.code, "ONBOARDING_CONNECTION_FAILED");
    assert.equal(missingConnection.json().error.connectorInvoked, false);

    const retry = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/retry`, payload: {} });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, "answers_saved");
    assert.equal(retry.json().result.retryFrom, "answers_saved");

    const detect = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/detect-platform`, payload: {} });
    assert.equal(detect.statusCode, 502);
    assert.equal(detect.json().error.code, "ONBOARDING_PLATFORM_UNSUPPORTED");

    const preview = await app.inject({ method: "POST", url: `/api/device-onboarding/sessions/${id}/build-preview`, payload: {} });
    assert.equal(preview.statusCode, 502);
    assert.equal(preview.json().error.code, "ONBOARDING_PREVIEW_BLOCKED");
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

test("Task 19.2A Dashboard quick actions route to tools and devices, not integrations", () => {
  const dashboard = readFileSync(join(process.cwd(), "..", "src", "features", "dashboard", "pages", "DashboardPage.tsx"), "utf8");
  const routes = readFileSync(join(process.cwd(), "..", "src", "routes", "appRoutes.tsx"), "utf8");
  assert.match(dashboard, /to="\/assets\/devices\/new"/);
  assert.match(dashboard, /to="\/tools\/network-check"/);
  assert.match(dashboard, /to="\/tools"/);
  assert.match(dashboard, /to="\/assets\/devices"/);
  assert.doesNotMatch(dashboard, /تست سریع شبکه<\/a>[\s\S]*href="\/integrations"/);
  assert.match(routes, /path: "\/tools"/);
  assert.match(routes, /path: "\/tools\/network-check"/);
});

test("Task 19.2A Linux monitoring summary returns a stable optional-schema contract", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "GET", url: "/api/monitoring/linux/summary" });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(typeof body.total, "number");
    assert.ok(["available", "not_configured"].includes(body.observability.state));
    if (body.observability.state === "not_configured") assert.equal(body.observability.reason, "OBSERVABILITY_SCHEMA_NOT_APPLIED");
  } finally { await app.close(); }
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
