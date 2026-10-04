import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const validator = fileURLToPath(new URL("./validate-frontend-env.mjs", import.meta.url));

function validate(contents) {
  const directory = mkdtempSync(join(tmpdir(), "firewall-frontend-env-test-"));
  try {
    writeFileSync(join(directory, ".env.production"), contents);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITE_")));
    return spawnSync(process.execPath, [validator], { cwd: directory, env, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("accepts public production configuration from .env.production", () => {
  const result = validate("VITE_APP_ENV=production\nVITE_API_BASE_URL=/firewall-api\n");
  assert.equal(result.status, 0, result.stderr);
});

test("rejects secret-like variables loaded from .env.production without echoing values", () => {
  const result = validate("VITE_APP_ENV=production\nVITE_API_BASE_URL=/firewall-api\nVITE_SESSION_SECRET=do-not-print-this\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_SESSION_SECRET/);
  assert.doesNotMatch(result.stderr, /do-not-print-this/);
});

test("rejects credentials embedded in a public API URL", () => {
  const result = validate("VITE_APP_ENV=production\nVITE_API_BASE_URL=https://user:password@example.com/api\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not contain credentials/);
  assert.doesNotMatch(result.stderr, /password@example/);
});
