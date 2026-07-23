import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M declares maintained Capacitor SQLite and secure vault dependencies", () => {
  const packageJson = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
  assert.match(packageJson.dependencies?.["@capacitor/core"] ?? "", /^\^?8\./);
  assert.match(packageJson.dependencies?.["@capacitor-community/sqlite"] ?? "", /^\^?8\./);
  assert.match(packageJson.dependencies?.["capacitor-secure-storage-plugin"] ?? "", /^\^?0\.13\./);
});

test("Phase M SQLite schema stores metadata and state without plaintext secrets", () => {
  const migrations = read("src/mobile-local/persistence/migrations.ts");
  for (const table of ["devices", "credential_metadata", "known_hosts", "action_plans", "approvals", "execution_state", "verification_evidence", "audit_events", "settings"]) {
    assert.match(migrations, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migrations, /schema_migrations/);
  assert.match(migrations, /credential_ref/);
  assert.match(migrations, /trusted_host_key_ref/);
  assert.match(migrations, /sha256_fingerprint/);
  assert.doesNotMatch(migrations, /password_value|private_key_value|secret_value|plaintext|localStorage|indexedDB/i);
});

test("Phase M SQLite repository uses deterministic migrations and transactions", () => {
  const repository = read("src/mobile-local/persistence/CapacitorSqliteRepository.ts");
  assert.match(repository, /@capacitor-community\/sqlite/);
  assert.match(repository, /addUpgradeStatement/);
  assert.match(repository, /beginTransaction/);
  assert.match(repository, /commitTransaction/);
  assert.match(repository, /rollbackTransaction/);
  assert.match(repository, /resetLocalData/);
  assert.doesNotMatch(repository, /@prisma\/client|fastify|node:|ssh2/);
});

test("Phase M secure vault uses native secure storage and avoids browser persistence", () => {
  const vault = read("src/mobile-local/vault/SecureVault.ts");
  assert.match(vault, /capacitor-secure-storage-plugin/);
  assert.match(vault, /SecureStoragePlugin\.set/);
  assert.match(vault, /SecureStoragePlugin\.remove/);
  assert.match(vault, /getSecretForNativeHandoff/);
  assert.doesNotMatch(vault, /localStorage|sessionStorage|indexedDB|console\.log/);
});

test("Phase M LocalMobileRuntime persists through repository boundary", () => {
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  assert.match(runtime, /LocalMobileRepository/);
  assert.match(runtime, /repository\.saveDevice/);
  assert.match(runtime, /repository\.savePlan/);
  assert.match(runtime, /repository\.saveApproval/);
  assert.match(runtime, /repository\.appendAuditEvent/);
  assert.doesNotMatch(runtime, /new Map<string, DeviceDetails>|new Map<string, ActionPlan>/);
});
