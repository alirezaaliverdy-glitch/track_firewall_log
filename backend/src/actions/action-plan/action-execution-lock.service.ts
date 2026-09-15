import { createHash } from "node:crypto";
import { Client } from "pg";
import type { ActionPlan } from "@prisma/client";
import { env } from "../../config/env.js";
import { ActionExecutionError, asObject, planRevision } from "./action-plan.shared.js";

type LockHandle = {
  client: Client;
  key: string;
};

function text(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

export function actionExecutionLockKey(plan: ActionPlan, input: Record<string, unknown> = {}) {
  const metadata = asObject(asObject(plan.parametersJson).metadata);
  const idempotencyKey = text(input.idempotencyKey ?? metadata.idempotencyKey, "default");
  const attempt = text(input.executionAttempt ?? metadata.executionAttempt ?? metadata.executingRevision ?? planRevision(metadata), "current");
  const rawKey = [
    "action-execution:v1",
    `actionPlanId=${plan.id}`,
    `deviceId=${plan.deviceId ?? "none"}`,
    `attempt=${attempt}`,
    `idempotencyKey=${idempotencyKey}`
  ].join(":");
  return createHash("sha256").update(rawKey).digest("hex");
}

async function tryAcquireActionExecutionLock(plan: ActionPlan, input: Record<string, unknown>): Promise<LockHandle | null> {
  if (!env.databaseUrl) {
    throw new ActionExecutionError("DATABASE_LOCK_UNAVAILABLE", "Database-backed execution locking requires DATABASE_URL.", 503);
  }
  const client = new Client({ connectionString: env.databaseUrl });
  const key = actionExecutionLockKey(plan, input);
  await client.connect();
  const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [key]);
  if (result.rows[0]?.locked === true) return { client, key };
  await client.end().catch(() => undefined);
  return null;
}

async function releaseActionExecutionLock(handle: LockHandle) {
  try {
    await handle.client.query("SELECT pg_advisory_unlock(hashtext($1))", [handle.key]);
  } finally {
    await handle.client.end().catch(() => undefined);
  }
}

export async function withActionExecutionAdvisoryLock<T>(plan: ActionPlan, input: Record<string, unknown>, run: () => Promise<T>) {
  const handle = await tryAcquireActionExecutionLock(plan, input);
  if (!handle) {
    throw new ActionExecutionError("ACTION_EXECUTION_ALREADY_RUNNING", "This ActionPlan is already executing for the same device and idempotency key.", 429);
  }
  try {
    return await run();
  } finally {
    await releaseActionExecutionLock(handle);
  }
}
