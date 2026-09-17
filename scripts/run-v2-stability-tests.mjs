import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const backendTests = [
  "backend/test/workflow-contracts.test.ts",
  "backend/test/workflow-engine.test.ts",
  "backend/test/unified-action-registry.test.ts",
  "backend/test/dashboard-workflow-summary.test.ts",
  "backend/test/vendor-workflow-acceptance.test.ts",
  "backend/test/ai-target-device-context.test.ts",
  "backend/test/ai-structured-action-planner.test.ts",
  "backend/test/ai-actionplan-routing-regression.test.ts",
  "backend/test/task19-1-action-center-ux.test.ts",
];

const steps = [
  { name: "frontend build", command: "npm run build", cwd: root },
  { name: "i18n parity", command: "npm run test:i18n", cwd: root },
  { name: "utf8 guard", command: "npm run test:utf8", cwd: root },
  { name: "workflow lab guard", command: "npm run test:workflows", cwd: root },
  { name: "backend build", command: "npm run build", cwd: resolve(root, "backend") },
  { name: "command catalog validation", command: "npm run validate:command-catalog", cwd: resolve(root, "backend") },
  { name: "focused backend stability tests", command: `npx tsx --test ${backendTests.join(" ")}`, cwd: root },
];

for (const step of steps) {
  console.log(`\n[v2-stability] ${step.name}`);
  const result = spawnSync(step.command, {
    cwd: step.cwd,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "test",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/firewall_log_analyzer_test",
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[v2-stability] all focused checks passed");
