import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Task 31 managed account passwords accept six characters end to end", () => {
  const backend = readFileSync(join(process.cwd(), "src", "services", "user-management.service.ts"), "utf8");
  const auth = readFileSync(join(process.cwd(), "src", "services", "auth.service.ts"), "utf8");
  const frontend = readFileSync(join(process.cwd(), "..", "src", "features", "settings", "pages", "SettingsPage.tsx"), "utf8");
  assert.match(backend, /value\.length < 6/);
  assert.doesNotMatch(backend, /passwordPolicyViolations/);
  assert.match(auth, /password\.length < 6/);
  assert.match(frontend, /editor\.password\.length < 6/);
  assert.match(frontend, /minLength=\{6\}/);
  assert.match(frontend, /resetPassword\.length < 6/);
});

test("Task 31 personal password changes keep the stronger twelve-character policy", () => {
  const policy = readFileSync(join(process.cwd(), "src", "security", "password-policy.ts"), "utf8");
  const frontend = readFileSync(join(process.cwd(), "..", "src", "features", "settings", "pages", "SettingsPage.tsx"), "utf8");
  assert.match(policy, /password\.length < 12/);
  assert.match(frontend, /newPassword\.length < 12/);
});
