import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaPgAdapter?: PrismaPg;
  prismaShutdown?: Promise<void>;
};

function getDatabaseUrl() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required to start the backend");
  }
  return env.databaseUrl;
}

function getPgPool() {
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new Pool({
      connectionString: getDatabaseUrl(),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10
    });
  }
  return globalForPrisma.pgPool;
}

const pool = getPgPool();
const adapter = globalForPrisma.prismaPgAdapter ?? new PrismaPg(pool, { disposeExternalPool: false });
globalForPrisma.prismaPgAdapter = adapter;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? [] : ["warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function isTransientDatabaseStartupError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const nestedErrors = typeof error === "object" && error && "errors" in error && Array.isArray((error as { errors?: unknown }).errors)
    ? (error as { errors: unknown[] }).errors
    : [];
  const nestedMessages = nestedErrors.map((item) => item instanceof Error ? item.message : String(item)).join(" ");
  const nestedCodes = nestedErrors
    .map((item) => typeof item === "object" && item && "code" in item ? String((item as { code?: unknown }).code ?? "") : "")
    .filter(Boolean);
  const message = error instanceof Error ? `${error.message} ${(error.cause as Error | undefined)?.message ?? ""}` : String(error);
  return ["P1001", "P1002", "P1008", "P1017", "P2010", "ETIMEDOUT", "ECONNRESET"].includes(code) ||
    nestedCodes.some((item) => ["ETIMEDOUT", "ECONNRESET"].includes(item)) ||
    /ConnectionClosed|connection closed|timeout|timed out|ECONNRESET|ETIMEDOUT|socket hang up/i.test(`${message} ${nestedMessages}`);
}

export function databaseUnavailableReason(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "DATABASE_UNAVAILABLE") : "DATABASE_UNAVAILABLE";
  const transient = isTransientDatabaseStartupError(error);
  return {
    code: code || "DATABASE_UNAVAILABLE",
    transient,
    message: transient ? "Database connection is not ready." : "Database connectivity check failed."
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDatabaseStartupRetry<T>(label: string, operation: () => Promise<T>) {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = isTransientDatabaseStartupError(error);
      const reason = databaseUnavailableReason(error);
      if (!retryable || attempt === attempts) {
        console.error(JSON.stringify({
          event: "database_startup_failed",
          label,
          attempt,
          attempts,
          reasonCode: reason.code,
          retryable,
          message: reason.message
        }));
        throw new Error(`${label} failed: ${retryable ? "database connection did not become ready" : "database query failed"}.`, { cause: error });
      }
      const baseDelayMs = Math.min(2_000, 150 * 2 ** (attempt - 1));
      const jitterMs = Math.floor(Math.random() * 75);
      const delayMs = baseDelayMs + jitterMs;
      console.warn(JSON.stringify({
        event: "database_startup_retry",
        label,
        attempt,
        attempts,
        reasonCode: reason.code,
        retryable,
        delayMs
      }));
      await sleep(delayMs);
    }
  }
  throw new Error(`${label} failed: database connection did not become ready.`);
}

export async function checkDatabaseReady() {
  try {
    const rows = await prisma.$queryRaw<Array<{
      database: string;
      schema: string;
      core_tables_ready: boolean;
    }>>`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        (
          to_regclass('public."Device"') IS NOT NULL AND
          to_regclass('public."Asset"') IS NOT NULL AND
          to_regclass('public."ActionPlan"') IS NOT NULL AND
          to_regclass('public."Finding"') IS NOT NULL AND
          to_regclass('public."DeviceCapabilityCache"') IS NOT NULL AND
          to_regclass('public."CollectionRun"') IS NOT NULL AND
          to_regclass('public."MetricSample"') IS NOT NULL AND
          to_regclass('public."MetricAggregate"') IS NOT NULL AND
          to_regclass('public."HealthSnapshot"') IS NOT NULL AND
          to_regclass('public."MonitorIncident"') IS NOT NULL
        ) AS core_tables_ready
    `;
    const identity = rows[0];
    const [devices, assets] = await Promise.all([
      prisma.device.count(),
      prisma.asset.count()
    ]);
    return {
      ok: true as const,
      database: identity?.database ?? "unknown",
      schema: identity?.schema ?? "public",
      schemaReady: identity?.core_tables_ready === true,
      rowCountSmoke: { devices, assets }
    };
  } catch (error) {
    return { ok: false as const, reason: databaseUnavailableReason(error) };
  }
}

export async function shutdownDatabase() {
  if (!globalForPrisma.prismaShutdown) {
    globalForPrisma.prismaShutdown = (async () => {
      try {
        await prisma.$disconnect();
        await pool.end();
      } finally {
        globalForPrisma.prisma = undefined;
        globalForPrisma.pgPool = undefined;
        globalForPrisma.prismaPgAdapter = undefined;
      }
    })().finally(() => {
      globalForPrisma.prismaShutdown = undefined;
    });
  }
  return globalForPrisma.prismaShutdown;
}
