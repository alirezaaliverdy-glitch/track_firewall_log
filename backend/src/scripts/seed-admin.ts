import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "../config/database-url.js";

type BootstrapCredentials = {
  username: string;
  password: string;
  createdAt: string;
};

const DEFAULT_CREDENTIALS_FILE = "./storage/bootstrap/initial-admin.json";

function resolveCredentialsFile() {
  return resolve(process.env.BOOTSTRAP_ADMIN_CREDENTIALS_FILE?.trim() || DEFAULT_CREDENTIALS_FILE);
}

function resolveBootstrapUsername() {
  return (process.env.BOOTSTRAP_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
}

function resolveBootstrapDisplayName() {
  return (process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || process.env.ADMIN_DISPLAY_NAME || "Administrator").trim();
}

async function readExistingCredentials(credentialsFile: string) {
  try {
    const parsed = JSON.parse(await readFile(credentialsFile, "utf8")) as Partial<BootstrapCredentials>;
    if (typeof parsed.password === "string" && parsed.password.length >= 16) {
      return parsed.password;
    }
    throw new Error(`Bootstrap credentials file is present but invalid: ${credentialsFile}`);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function createBootstrapCredentials(credentialsFile: string, username: string) {
  const password = randomBytes(24).toString("base64url");
  const credentials: BootstrapCredentials = {
    username,
    password,
    createdAt: new Date().toISOString()
  };

  await mkdir(dirname(credentialsFile), { recursive: true, mode: 0o700 });
  await writeFile(credentialsFile, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await chmod(credentialsFile, 0o600).catch(() => undefined);
  return password;
}

async function getBootstrapPassword(credentialsFile: string, username: string) {
  const existing = await readExistingCredentials(credentialsFile);
  if (existing) return existing;
  try {
    return await createBootstrapCredentials(credentialsFile, username);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "EEXIST") {
      const existingAfterRace = await readExistingCredentials(credentialsFile);
      if (existingAfterRace) return existingAfterRace;
    }
    throw error;
  }
}

async function main() {
  const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the initial admin user");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 2
  });
  const adapter = new PrismaPg(pool, { disposeExternalPool: false });
  const prisma = new PrismaClient({ adapter });

  try {
    const [userCount, adminCount] = await Promise.all([
      prisma.appUser.count(),
      prisma.appUser.count({ where: { role: "admin" } })
    ]);

    if (adminCount > 0 || userCount > 0) {
      console.info(JSON.stringify({
        event: "seed_admin_skipped",
        reasonCode: adminCount > 0 ? "ADMIN_EXISTS" : "USERS_EXIST",
        userCount,
        adminCount
      }));
      return;
    }

    const username = resolveBootstrapUsername();
    const displayName = resolveBootstrapDisplayName();
    const credentialsFile = resolveCredentialsFile();
    const password = await getBootstrapPassword(credentialsFile, username);
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.appUser.create({
      data: {
        username,
        passwordHash,
        displayName,
        role: "admin"
      }
    });

    console.info(JSON.stringify({
      event: "seed_admin_created",
      username,
      credentialsFile
    }));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "seed_admin_failed",
    message: error instanceof Error ? error.message : "Unknown seed failure"
  }));
  process.exitCode = 1;
});
