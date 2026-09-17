import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import "dotenv/config";
import { assertSafeTestDatabase } from "../testing/test-database-safety.js";

const tests = readdirSync(new URL("../../test", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => `test/${entry.name}`)
  .sort();

if (tests.length === 0) throw new Error("No backend test files were discovered.");
if (new Set(tests).size !== tests.length) throw new Error("Duplicate backend test files were discovered.");

const applicationDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseIdentity = assertSafeTestDatabase({ testDatabaseUrl, applicationDatabaseUrl });
console.info(JSON.stringify({ event: "test_database_safety_verified", ...testDatabaseIdentity }));
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const forwarded = process.argv.slice(2);
const requestedFiles = forwarded.filter((argument) => argument.endsWith(".test.ts"));
const selectedTests = requestedFiles.length > 0 ? requestedFiles : tests;
const options = forwarded.filter((argument) => !argument.endsWith(".test.ts"));
const result = spawnSync(process.execPath, [tsxCli, "--test", "--test-force-exit", "--test-concurrency=1", ...options, ...selectedTests], {
  cwd: new URL("../..", import.meta.url),
  env: {
    ...process.env,
    APPLICATION_DATABASE_URL: applicationDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: "test"
  },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
