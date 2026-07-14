import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getDatabaseUrl() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required to start the backend");
  }

  try {
    const url = new URL(env.databaseUrl);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
  } catch {
    return env.databaseUrl;
  }
  return env.databaseUrl;
}

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl()
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
