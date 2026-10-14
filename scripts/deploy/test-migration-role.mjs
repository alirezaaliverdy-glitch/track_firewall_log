import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./read-api-migration-role.mjs", import.meta.url));
function check(values) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.POSTGRES_USER;
  Object.assign(env, values);
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}
test("file-backed production uses the entrypoint's configured database role", () => {
  const result = check({ POSTGRES_USER: "legacy_api" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "legacy_api");
});
test("fresh file-backed production uses the entrypoint's default role", () => {
  assert.equal(check({}).stdout, "firewall_app");
});
test("explicit URL overrides POSTGRES_USER without printing its password", () => {
  const result = check({ POSTGRES_USER: "other_role", DATABASE_URL: "postgresql://url_api:fixture-only@db:5432/app" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "url_api");
  assert.equal(result.stderr, "");
});
test("invalid configuration fails with sanitized output", () => {
  for (const DATABASE_URL of ["invalid-fixture-only", "postgresql://bad%27role:fixture-only@db/app"]) {
    const result = check({ DATABASE_URL });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes("fixture-only"));
    assert.ok(!result.stderr.includes(DATABASE_URL));
  }
});
