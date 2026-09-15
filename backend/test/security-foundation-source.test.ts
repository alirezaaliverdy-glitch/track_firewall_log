import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { findMutationPermission, MUTATION_PERMISSION_POLICIES, requiredExecutionPermissionForRisk } from "../src/security/authorization.js";
import { hasPermission } from "../src/security/permissions.js";
import { csrfTokenForSession, validateCsrfToken } from "../src/security/csrf.js";
import { assertLoginRateLimit, resetLoginRateLimit } from "../src/security/rate-limit.js";
import { passwordPolicyViolations } from "../src/security/password-policy.js";
import { sensitiveLogPaths } from "../src/security/redaction.js";

const routeDir = join(process.cwd(), "src", "routes");
const routeFiles = [
  "action-sessions.ts",
  "actions.ts",
  "ai.ts",
  "analysis.ts",
  "assessments.ts",
  "assets.ts",
  "auth.ts",
  "collectors.ts",
  "command-catalog.ts",
  "connector-plans.ts",
  "credentials.ts",
  "detections.ts",
  "device-onboarding.ts",
  "device-workspaces.ts",
  "devices.ts",
  "diagnostics.ts",
  "events.ts",
  "incidents.ts",
  "linux-health.ts",
  "linux-telemetry.ts",
  "security-platform.ts",
  "telemetry-findings.ts",
  "uploads.ts",
  "vendors.ts"
];

function mutationRoutesFromSource() {
  const routes: Array<{ method: string; path: string }> = [];
  for (const file of routeFiles) {
    const source = readFileSync(join(routeDir, file), "utf8");
    const regex = /app\.(post|patch|put|delete)<[\s\S]*?\>\(\s*["']([^"']+)["']|app\.(post|patch|put|delete)\(\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(regex)) {
      routes.push({
        method: (match[1] ?? match[3]).toUpperCase(),
        path: match[2] ?? match[4]
      });
    }
  }
  return routes;
}

test("Phase A role matrix keeps viewer read-only, operator scoped, and admin complete", () => {
  assert.equal(hasPermission("viewer", "assistant.chat"), true);
  assert.equal(hasPermission("viewer", "devices.manage"), false);
  assert.equal(hasPermission("viewer", "actions.execute.write"), false);
  assert.equal(hasPermission("operator", "actions.execute.write"), true);
  assert.equal(hasPermission("operator", "credentials.manage"), false);
  assert.equal(hasPermission("operator", "actions.execute.high_risk"), false);
  assert.equal(hasPermission("admin", "credentials.manage"), true);
  assert.equal(hasPermission("admin", "actions.execute.high_risk"), true);
});

test("every authenticated mutation route has a central permission declaration", () => {
  const missing = mutationRoutesFromSource()
    .filter(({ path }) => path !== "/api/auth/login")
    .filter(({ method, path }) => !findMutationPermission(method, path));
  assert.deepEqual(missing, []);
});

test("mutation policy registry has no duplicate method/path declarations", () => {
  const keys = MUTATION_PERMISSION_POLICIES.map((policy) => `${policy.method} ${policy.path}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("high-risk execution requires high-risk permission", () => {
  assert.equal(requiredExecutionPermissionForRisk("low"), "actions.execute.write");
  assert.equal(requiredExecutionPermissionForRisk("medium"), "actions.execute.write");
  assert.equal(requiredExecutionPermissionForRisk("high"), "actions.execute.high_risk");
  assert.equal(requiredExecutionPermissionForRisk("critical"), "actions.execute.high_risk");
});

test("concrete mutation paths resolve through centralized permission policy", () => {
  assert.equal(findMutationPermission("POST", "/api/actions/plan-1/execute"), "actions.execute.write");
  assert.equal(findMutationPermission("POST", "/api/credentials"), "credentials.manage");
  assert.equal(findMutationPermission("POST", "/api/auth/logout"), "auth.session.manage");
  assert.equal(findMutationPermission("POST", "/api/auth/logout-all"), "auth.session.terminate");
  assert.equal(findMutationPermission("POST", "/api/auth/change-password"), "auth.session.manage");
  assert.equal(findMutationPermission("DELETE", "/api/auth/sessions/session-1"), "auth.session.terminate");
  assert.equal(findMutationPermission("POST", "/api/not-declared"), null);
});

test("central login limiter returns 429-ready retry metadata", () => {
  const username = `phase-a-${Date.now()}`;
  const ip = "203.0.113.10";
  for (let i = 0; i < 5; i += 1) {
    assert.equal(assertLoginRateLimit(ip, username).allowed, true);
  }
  const blocked = assertLoginRateLimit(ip, username);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasonCode, "RATE_LIMIT_LOGIN");
  assert.ok(blocked.retryAfterSeconds > 0);
  resetLoginRateLimit(ip, username);
});

test("login limiter also blocks username spraying from one address", () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 100) + 1}`;
  for (let i = 0; i < 25; i += 1) {
    assert.equal(assertLoginRateLimit(ip, `spray-${Date.now()}-${i}`).allowed, true);
  }
  const blocked = assertLoginRateLimit(ip, `spray-${Date.now()}-blocked`);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasonCode, "RATE_LIMIT_LOGIN_IP");
});

test("password policy rejects weak, common, oversized, and username-derived passwords", () => {
  assert.deepEqual(passwordPolicyViolations("Strong-Passphrase-2026!", "operator"), []);
  assert.ok(passwordPolicyViolations("short", "operator").includes("PASSWORD_TOO_SHORT"));
  assert.ok(passwordPolicyViolations("password1234", "operator").includes("PASSWORD_TOO_COMMON"));
  assert.ok(passwordPolicyViolations("operator-secure-2026", "operator").includes("PASSWORD_CONTAINS_USERNAME"));
  assert.ok(passwordPolicyViolations("x".repeat(129), "operator").includes("PASSWORD_TOO_LONG"));
});

test("authentication secrets are explicitly redacted from request logging", () => {
  assert.ok(sensitiveLogPaths.includes("req.body.password"));
  assert.ok(sensitiveLogPaths.includes("req.body.currentPassword"));
  assert.ok(sensitiveLogPaths.includes("req.body.newPassword"));
  assert.ok(sensitiveLogPaths.includes("req.headers.cookie"));
});

test("CSRF tokens are session-bound and reject missing or wrong values", () => {
  const token = csrfTokenForSession("session-a");
  assert.equal(validateCsrfToken("session-a", token), true);
  assert.equal(validateCsrfToken("session-a", undefined), false);
  assert.equal(validateCsrfToken("session-a", csrfTokenForSession("session-b")), false);
});
