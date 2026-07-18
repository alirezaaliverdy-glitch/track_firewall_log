import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabase } from "../src/testing/test-database-safety.js";

test("database-writing tests require TEST_DATABASE_URL", () => {
  assert.throws(
    () => assertSafeTestDatabase({ testDatabaseUrl: undefined, applicationDatabaseUrl: "postgresql://db-host/application" }),
    /TEST_DATABASE_URL_REQUIRED/
  );
});

test("test database must not equal the application database", () => {
  assert.throws(
    () => assertSafeTestDatabase({
      testDatabaseUrl: "postgresql://localhost:5432/application_test",
      applicationDatabaseUrl: "postgresql://127.0.0.1/application_test"
    }),
    /TEST_DATABASE_URL_MATCHES_DATABASE_URL/
  );
});

test("historical application database is forbidden as a test target", () => {
  assert.throws(
    () => assertSafeTestDatabase({
      testDatabaseUrl: "postgresql://isolated-db/firewall_log_analyzer",
      applicationDatabaseUrl: "postgresql://application-db/application"
    }),
    /TEST_DATABASE_URL_HISTORICAL_DATABASE_FORBIDDEN/
  );
});

test("safe identity excludes user information and query parameters", () => {
  assert.deepEqual(
    assertSafeTestDatabase({
      testDatabaseUrl: "postgresql://isolated_user@isolated-db:5544/firewall_log_phase_a_test?schema=public",
      applicationDatabaseUrl: "postgresql://application-db/application"
    }),
    { host: "isolated-db", port: "5544", database: "firewall_log_phase_a_test" }
  );
});
