import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Phase R2 execution serialization is database-backed, not process-local request state", () => {
  const rateLimit = source("src/security/rate-limit.ts");
  const plugin = source("src/plugins/security.plugin.ts");
  const lockService = source("src/actions/action-plan/action-execution-lock.service.ts");
  const executionService = source("src/actions/action-plan/action-plan-execution.service.ts");

  assert.doesNotMatch(rateLimit, /activeExecutions|acquireExecutionLock|releaseExecutionLock/);
  assert.doesNotMatch(plugin, /acquireExecutionLock|releaseExecutionLock|executionRateLimitLockKey/);
  assert.match(lockService, /pg_try_advisory_lock/);
  assert.match(lockService, /pg_advisory_unlock/);
  assert.match(lockService, /actionPlanId/);
  assert.match(lockService, /deviceId/);
  assert.match(lockService, /idempotencyKey/);
  assert.match(executionService, /withActionExecutionAdvisoryLock/);
});

test("Phase R2 analysis jobs are claimed from durable database state instead of setImmediate fire-and-forget", () => {
  const worker = source("src/services/worker.service.ts");

  assert.doesNotMatch(worker, /setImmediate/);
  assert.match(worker, /claimQueuedAnalysisJobs/);
  assert.match(worker, /runAnalysisWorkerOnce/);
  assert.match(worker, /JobStatus\.queued/);
  assert.match(worker, /JobStatus\.processing/);
  assert.match(worker, /updateMany/);
});

test("Phase R2 Action Center history clear archives terminal plans and preserves audit rows", () => {
  const actionCenter = source("src/services/action-center.service.ts");

  assert.doesNotMatch(actionCenter, /actionPlan\.deleteMany/);
  assert.match(actionCenter, /archivedAt/);
  assert.match(actionCenter, /action_center_history_archived/);
  assert.match(actionCenter, /retainedActive/);
});
