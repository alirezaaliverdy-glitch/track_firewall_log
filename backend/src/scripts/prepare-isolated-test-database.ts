import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Client } from "pg";
import { assertSafeTestDatabase } from "../testing/test-database-safety.js";

const testDatabaseName = process.env.TEST_DATABASE_NAME?.trim() || "firewall_log_analyzer_phase_a_test";
const applicationDatabaseUrl = process.env.DATABASE_URL;
const command = process.argv[2] ?? "prepare";

if (!applicationDatabaseUrl) {
  throw new Error("DATABASE_URL_REQUIRED_FOR_TEST_DB_PREP");
}

const applicationUrl = new URL(applicationDatabaseUrl);
const testUrl = new URL(applicationUrl.toString());
testUrl.pathname = `/${testDatabaseName}`;

const identity = assertSafeTestDatabase({
  testDatabaseUrl: testUrl.toString(),
  applicationDatabaseUrl
});

const maintenanceUrl = new URL(applicationUrl.toString());
maintenanceUrl.pathname = "/postgres";

async function prepareDatabase() {
  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [testDatabaseName]);
    if (existing.rowCount === 0) {
      await client.query(`create database ${testDatabaseName}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  console.info(JSON.stringify({ event: "isolated_test_database_ready", ...identity }));
}

function runChecked(label: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("../..", import.meta.url),
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    throw new Error(`${label}_FAILED`);
  }
}

await prepareDatabase();

if (command === "prepare") {
  process.exit(0);
}

const baseEnv = {
  ...process.env,
  APPLICATION_DATABASE_URL: applicationDatabaseUrl,
  TEST_DATABASE_URL: testUrl.toString()
};

if (command === "db-push") {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  runChecked("ISOLATED_TEST_DB_PUSH", [prismaCli, "db", "push"], {
    ...baseEnv,
    DATABASE_URL: testUrl.toString(),
    NODE_ENV: "test"
  });
} else if (command === "test") {
  const require = createRequire(import.meta.url);
  const tsxCli = require.resolve("tsx/cli");
  runChecked("ISOLATED_TEST_RUN", [tsxCli, "src/scripts/run-all-tests.ts", ...process.argv.slice(3)], {
    ...baseEnv,
    DATABASE_URL: applicationDatabaseUrl,
    NODE_ENV: "test"
  });
} else {
  throw new Error(`UNKNOWN_COMMAND:${command}`);
}
