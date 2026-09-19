import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { findMutationPermission } from "../src/security/authorization.js";
import { hasPermission } from "../src/security/permissions.js";

test("Task 32 only administrators receive session termination permission", () => {
  assert.equal(hasPermission("admin", "auth.session.terminate"), true);
  assert.equal(hasPermission("operator", "auth.session.terminate"), false);
  assert.equal(hasPermission("viewer", "auth.session.terminate"), false);
  assert.equal(findMutationPermission("DELETE", "/api/auth/sessions/session-1"), "auth.session.terminate");
  assert.equal(findMutationPermission("POST", "/api/auth/logout-all"), "auth.session.terminate");
  assert.equal(findMutationPermission("POST", "/api/auth/logout"), "auth.session.manage");
  assert.equal(findMutationPermission("POST", "/api/auth/change-password"), "auth.session.manage");
});

test("Task 32 session listing and frontend controls are admin gated", () => {
  const routes = readFileSync(join(process.cwd(), "src", "routes", "auth.ts"), "utf8");
  const settings = readFileSync(join(process.cwd(), "..", "src", "features", "settings", "pages", "SettingsPage.tsx"), "utf8");
  assert.match(routes, /hasPermission\(request\.authUser!\.role, "auth\.session\.terminate"\)/);
  assert.match(settings, /if \(!isAdmin\) \{ setSessions/);
  assert.match(settings, /\{isAdmin \? <section className="account-security-panel account-sessions-panel"/);
});
