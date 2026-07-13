import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { getProductNavigation, PRODUCT_FEATURES, validateProductState } from "../src/product-state/product-state.registry.js";
import type { ProductFeature } from "../src/product-state/product-state.types.js";

test("Task 19A product state rejects unsafe navigation mismatches", () => {
  assert.equal(validateProductState(), true);
  const invalid: ProductFeature[] = PRODUCT_FEATURES.map((item) => ({ ...item }));
  const settings = invalid.find((item) => item.key === "settings");
  assert.ok(settings);
  settings.navigationVisible = true;
  assert.throws(() => validateProductState(invalid), /forbidden state planned/);

  const incomplete: ProductFeature[] = PRODUCT_FEATURES.map((item) => ({ ...item }));
  const dashboard = incomplete.find((item) => item.key === "dashboard.overview");
  assert.ok(dashboard);
  dashboard.apiReady = false;
  assert.throws(() => validateProductState(incomplete), /backend\/API\/UI\/test mismatch/);
});

test("Task 19A navigation excludes planned, mock-only, not-configured and unverified routes", () => {
  const routes = getProductNavigation().flatMap((group) => group.items.map((item) => item.route));
  assert.ok(routes.includes("/dashboard"));
  assert.ok(routes.includes("/security/rules"));
  assert.ok(routes.includes("/monitoring/linux"));
  assert.ok(!routes.includes("/settings"));
  assert.ok(!routes.includes("/assets/sync"));
  assert.ok(!routes.includes("/assets/vendors/cisco"));
  assert.ok(!routes.includes("/integrations/netbox"));
  assert.ok(!routes.includes("/integrations/wazuh"));
  assert.ok(!routes.includes("/actions/pending"));
  assert.ok(!routes.includes("/actions/history"));
});

test("Task 19A backend feature keys and frontend route registry stay aligned", () => {
  const source = readFileSync(join(process.cwd(), "..", "src", "routes", "appRoutes.tsx"), "utf8");
  const frontendKeys = [...source.matchAll(/featureKey:\s*"([^"]+)"/g)].map((match) => match[1]);
  const backendKeys = new Set(PRODUCT_FEATURES.map((item) => item.key));
  assert.ok(frontendKeys.length > 0);
  assert.equal(new Set(frontendKeys).size, frontendKeys.length);
  for (const key of frontendKeys) assert.ok(backendKeys.has(key), `Frontend feature key is missing from product state: ${key}`);
  for (const item of PRODUCT_FEATURES.filter((feature) => feature.route)) assert.ok(frontendKeys.includes(item.key), `Product state feature is missing from frontend routes: ${item.key}`);
});

test("Task 19A product-state APIs expose one consistent contract", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const contract = await app.inject({ method: "GET", url: "/api/product-state" });
    const navigation = await app.inject({ method: "GET", url: "/api/product-state/navigation" });
    const features = await app.inject({ method: "GET", url: "/api/product-state/features" });
    const vendors = await app.inject({ method: "GET", url: "/api/product-state/vendors" });
    const integrations = await app.inject({ method: "GET", url: "/api/product-state/integrations" });
    for (const response of [contract, navigation, features, vendors, integrations]) assert.equal(response.statusCode, 200);
    assert.equal(contract.json().contractVersion, "19B.1");
    assert.deepEqual(contract.json().navigation, navigation.json().navigation);
    assert.deepEqual(contract.json().features, features.json().features);
    assert.deepEqual(contract.json().vendors, vendors.json().vendors);
    assert.deepEqual(contract.json().integrations, integrations.json().integrations);
    assert.equal(integrations.json().integrations.every((item: { mode: string; executable: boolean }) => item.mode === "mock" && item.executable === false), true);
  } finally {
    await app.close();
  }
});
