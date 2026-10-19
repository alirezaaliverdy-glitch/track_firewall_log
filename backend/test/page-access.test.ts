import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAGE_ACCESS, PAGE_GRANTS, canAccessPage, effectivePageGrants, firstAccessibleRoute, pageForLocation } from "../src/security/page-access.js";
import { canAccessApi, normalizeApplicationSections } from "../src/security/section-access.js";
import { getProductNavigation, getProductStateContract, PRODUCT_FEATURES } from "../src/product-state/product-state.registry.js";
import { publicUser } from "../src/services/auth.service.js";

test("page access contract is identical in web and API and covers every visible tab", () => {
  assert.equal(readFileSync("src/security/page-access.ts", "utf8").replaceAll("\r\n", "\n"), readFileSync("../src/lib/pageAccess.ts", "utf8").replaceAll("\r\n", "\n"));
  for (const feature of PRODUCT_FEATURES.filter(item => item.navigationVisible)) assert.ok(PAGE_ACCESS.some(([key]) => key === feature.key), feature.key);
});

for (const role of ["viewer", "operator"] as const) test(`${role}: only camera/VPN pages, menus, metadata and API remain accessible`, () => {
  const user = { role, allowedSections: ["page:assets.cameras", "page:tools.vpn"] };
  assert.deepEqual(effectivePageGrants(user), user.allowedSections);
  const nav = getProductNavigation(user.allowedSections);
  assert.deepEqual(nav.map(group => group.route), ["/assets/cameras", "/tools/vpn"]);
  assert.equal(nav.every(group => group.items.length === 1), true);
  assert.deepEqual(getProductStateContract(user.allowedSections).features.filter(item => item.navigationVisible).map(item => item.key).sort(), ["assets.cameras", "tools.vpn"]);
  for (const path of ["/api/cameras", "/api/cameras/companies", "/api/cameras/fixture/monitor", "/api/vpn", "/api/auth/csrf", "/api/product-state/navigation"]) assert.equal(canAccessApi(user, path), true, path);
  for (const path of ["/api/devices", "/api/assets", "/api/dashboard", "/api/security/findings", "/api/actions", "/api/scheduled-tasks", "/api/diagnostics/network-inventory", "/api/ai/chat", "/api/ai/provider/config", "/api/community/threads", "/api/reports/company-status", "/api/backups", "/api/credentials", "/api/admin/users", "/api/new-unclassified-endpoint"]) assert.equal(canAccessApi(user, path), false, path);
  assert.equal(canAccessPage(user, "settings"), false);
  assert.equal(firstAccessibleRoute(user), "/assets/cameras");
  assert.equal(pageForLocation("/assets/devices/nvr-fixture"), "assets.cameras");
  assert.equal(pageForLocation("/assets/devices/new", "?vendor=nvr"), "assets.cameras");
  assert.equal(pageForLocation("/assets/devices/new", "?vendor=linux"), "assets.device_onboarding_new");
  assert.equal(pageForLocation("/assets/devices/fixture/terminal"), "assets.devices");
  assert.deepEqual(publicUser({ ...user, id: "fixture", username: "fixture", displayName: "Fixture" }).allowedSections, user.allowedSections);
});

test("individual page grants never imply their siblings or parent landing", () => {
  for (const grant of PAGE_GRANTS) {
    const user = { role: "viewer", allowedSections: [grant] };
    for (const [key] of PAGE_ACCESS) assert.equal(canAccessPage(user, key), grant === `page:${key}`, `${grant} -> ${key}`);
    assert.equal(getProductNavigation([grant]).flatMap(group => group.items).every(item => grant === `page:${item.key}`), true);
  }
  const camera = { role: "operator", allowedSections: ["page:assets.cameras"] };
  assert.equal(canAccessApi(camera, "/api/cameras/fixture/actions/preview", "POST"), true);
  assert.equal(canAccessApi(camera, "/api/vpn", "POST"), false);
});

test("legacy effective access is preserved until explicit save; admin keeps full control", () => {
  assert.deepEqual(effectivePageGrants({ role: "viewer", allowedSections: ["dashboard"] }), PAGE_GRANTS);
  assert.ok(effectivePageGrants({ role: "operator", allowedSections: ["assets"] }).includes("page:assets.cameras"));
  assert.equal(effectivePageGrants({ role: "operator", allowedSections: ["assets"] }).includes("page:tools.vpn"), false);
  assert.deepEqual(effectivePageGrants({ role: "admin", allowedSections: [] }), PAGE_GRANTS);
  assert.throws(() => normalizeApplicationSections(["page:typo"]), /INVALID_SECTION_ACCESS/);
  assert.throws(() => normalizeApplicationSections([]), /SECTION_ACCESS_REQUIRED/);
});

test("selected dashboard has bounded read dependencies without sibling pages or mutations", () => {
  const dashboard = { role: "operator", allowedSections: ["page:dashboard.overview"] };
  for (const path of ["/api/dashboard/activity", "/api/assets", "/api/security/findings", "/api/monitoring/linux/summary", "/api/security/monitoring/status"]) assert.equal(canAccessApi(dashboard, path), true, path);
  assert.equal(canAccessPage(dashboard, "security.findings"), false);
  assert.equal(canAccessApi(dashboard, "/api/security/findings/fixture"), false);
  assert.equal(canAccessApi(dashboard, "/api/assets", "POST"), false);
  assert.equal(canAccessApi(dashboard, "/api/actions/fixture/execute", "POST"), false);
});
