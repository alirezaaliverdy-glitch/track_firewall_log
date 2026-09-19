import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { findMutationPermission } from "../src/security/authorization.js";
import { hasPermission } from "../src/security/permissions.js";
import { APPLICATION_SECTIONS, hasSectionAccess, normalizeApplicationSections, sectionForApiPath } from "../src/security/section-access.js";
import { getProductNavigation } from "../src/product-state/product-state.registry.js";

test("Task 30 normalizes section grants and rejects empty or unknown access", () => {
  assert.deepEqual(normalizeApplicationSections(["dashboard", "assets", "dashboard"]), ["dashboard", "assets"]);
  assert.throws(() => normalizeApplicationSections([]), /SECTION_ACCESS_REQUIRED/);
  assert.throws(() => normalizeApplicationSections(["dashboard", "root"]), /INVALID_SECTION_ACCESS/);
  assert.equal(APPLICATION_SECTIONS.length, 7);
});

test("Task 30 maps sensitive API paths to their product section", () => {
  assert.equal(sectionForApiPath("/api/security/attackers"), "attackers");
  assert.equal(sectionForApiPath("/api/security/findings"), "security");
  assert.equal(sectionForApiPath("/api/devices/device-1/telemetry/linux/overview"), "monitoring");
  assert.equal(sectionForApiPath("/api/devices/device-1/findings"), "security");
  assert.equal(sectionForApiPath("/api/devices"), "assets");
  assert.equal(sectionForApiPath("/api/actions/plan-1/execute"), "actions");
  assert.equal(sectionForApiPath("/api/ai/chat"), "assistant");
  assert.equal(sectionForApiPath("/api/auth/sessions"), null);
});

test("Task 30 applies least privilege and reserves user administration for admins", () => {
  assert.equal(hasSectionAccess({ role: "viewer", allowedSections: ["dashboard"] }, "dashboard"), true);
  assert.equal(hasSectionAccess({ role: "viewer", allowedSections: ["dashboard"] }, "security"), false);
  assert.equal(hasSectionAccess({ role: "admin", allowedSections: [] }, "security"), true);
  assert.equal(hasPermission("viewer", "users.manage"), false);
  assert.equal(hasPermission("operator", "users.manage"), false);
  assert.equal(hasPermission("admin", "users.manage"), true);
  assert.equal(findMutationPermission("POST", "/api/admin/users"), "users.manage");
  assert.equal(findMutationPermission("PATCH", "/api/admin/users/user-1"), "users.manage");
  assert.equal(findMutationPermission("POST", "/api/admin/users/user-1/reset-password"), "users.manage");
});

test("Task 30 filters navigation and keeps settings available", () => {
  const groups = getProductNavigation(["dashboard", "security"]);
  assert.deepEqual(groups.map((group) => group.key), ["dashboard", "security", "settings"]);
  assert.ok(groups.flatMap((group) => group.items).some((item) => item.route === "/settings"));
  assert.ok(!groups.flatMap((group) => group.items).some((item) => item.route === "/assets"));
});

test("Task 30 ships a motion-safe sidebar and functional access editor", () => {
  const frontend = join(process.cwd(), "..");
  const settingsSource = readFileSync(join(frontend, "src", "features", "settings", "pages", "SettingsPage.tsx"), "utf8");
  const settingsCss = readFileSync(join(frontend, "src", "features", "settings", "pages", "SettingsPage.css"), "utf8");
  const sidebarSource = readFileSync(join(frontend, "src", "components", "layout", "AppShell.tsx"), "utf8");
  const sidebarCss = readFileSync(join(frontend, "src", "components", "layout", "AppShellNavigation.css"), "utf8");
  const serviceSource = readFileSync(join(process.cwd(), "src", "services", "user-management.service.ts"), "utf8");
  assert.match(settingsSource, /createManagedUser/);
  assert.match(settingsSource, /allowedSections/);
  assert.match(settingsSource, /resetManagedUserPassword/);
  assert.match(sidebarSource, /platform-sidebar__brand-mark/);
  assert.match(sidebarSource, /navigationTones/);
  assert.match(settingsCss + sidebarCss, /prefers-reduced-motion/);
  assert.match(serviceSource, /LAST_ACTIVE_ADMIN_REQUIRED/);
  assert.match(serviceSource, /authSession\.deleteMany/);
});
