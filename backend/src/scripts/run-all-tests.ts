import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { env } from "../config/env.js";

const tests = readdirSync(new URL("../../test", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => `test/${entry.name}`)
  .sort();

if (tests.length === 0) throw new Error("No backend test files were discovered.");
if (new Set(tests).size !== tests.length) throw new Error("Duplicate backend test files were discovered.");

if (!env.databaseUrl) throw new Error("DATABASE_URL is required to derive the isolated onboarding test database.");
const sourceUrl = new URL(env.databaseUrl);
sourceUrl.pathname = "/firewall_log_analyzer_onboarding_test";
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const forwarded = process.argv.slice(2);
const requestedFiles = forwarded.filter((argument) => argument.endsWith(".test.ts"));
const selectedTests = requestedFiles.length > 0 ? requestedFiles : tests;
const options = forwarded.filter((argument) => !argument.endsWith(".test.ts"));
const result = spawnSync(process.execPath, [tsxCli, "--test", "--test-force-exit", "--test-concurrency=1", ...options, ...selectedTests], {
  cwd: new URL("../..", import.meta.url),
  env: { ...process.env, DATABASE_URL: sourceUrl.toString(), NODE_ENV: "test" },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
