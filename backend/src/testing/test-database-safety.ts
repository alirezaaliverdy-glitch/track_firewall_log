export const HISTORICAL_DATABASE_NAME = "firewall_log_analyzer";

export type SafeTestDatabaseIdentity = {
  host: string;
  port: string;
  database: string;
};

type TestDatabaseSafetyInput = {
  testDatabaseUrl: string | undefined;
  applicationDatabaseUrl: string | undefined;
};

function parseDatabaseUrl(value: string, code: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("unsupported protocol");
    if (!parsed.hostname || !parsed.pathname.slice(1)) throw new Error("missing database identity");
    return parsed;
  } catch {
    throw new Error(code);
  }
}

function normalizedHost(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "[::1]" || value === "::1" ? "127.0.0.1" : value;
}

function databaseName(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
}

function canonicalIdentity(url: URL) {
  return [normalizedHost(url.hostname), url.port || "5432", databaseName(url)].join("|");
}

export function assertSafeTestDatabase(input: TestDatabaseSafetyInput): SafeTestDatabaseIdentity {
  const rawTestUrl = input.testDatabaseUrl?.trim();
  if (!rawTestUrl) throw new Error("TEST_DATABASE_URL_REQUIRED");

  const testUrl = parseDatabaseUrl(rawTestUrl, "TEST_DATABASE_URL_INVALID");
  const testDatabase = databaseName(testUrl);
  if (testDatabase.toLowerCase() === HISTORICAL_DATABASE_NAME) {
    throw new Error("TEST_DATABASE_URL_HISTORICAL_DATABASE_FORBIDDEN");
  }

  const rawApplicationUrl = input.applicationDatabaseUrl?.trim();
  if (rawApplicationUrl) {
    const applicationUrl = parseDatabaseUrl(rawApplicationUrl, "DATABASE_URL_INVALID_FOR_TEST_COMPARISON");
    if (canonicalIdentity(testUrl) === canonicalIdentity(applicationUrl)) {
      throw new Error("TEST_DATABASE_URL_MATCHES_DATABASE_URL");
    }
  }

  return {
    host: normalizedHost(testUrl.hostname),
    port: testUrl.port || "5432",
    database: testDatabase
  };
}

export function assertSafeTestDatabaseEnvironment() {
  return assertSafeTestDatabase({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPLICATION_DATABASE_URL ?? process.env.DATABASE_URL
  });
}
