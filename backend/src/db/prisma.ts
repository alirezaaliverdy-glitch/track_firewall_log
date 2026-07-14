import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
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
const adapter = new PrismaPg(pool, { disposeExternalPool: false });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"]
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

export async function checkDatabaseReady() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, reason: databaseUnavailableReason(error) };
  }
}

export async function shutdownDatabase() {
  if (!globalForPrisma.prismaShutdown) {
    globalForPrisma.prismaShutdown = (async () => {
      await prisma.$disconnect();
      await pool.end();
      globalForPrisma.prisma = undefined;
      globalForPrisma.pgPool = undefined;
    })();
  }
  return globalForPrisma.prismaShutdown;
}
