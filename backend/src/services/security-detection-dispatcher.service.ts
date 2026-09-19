import { runSecurityDetection } from "../assets/asset-intelligence.service.js";

export type DetectionScope = { deviceId?: string; assetId?: string };
type DetectionResult = Awaited<ReturnType<typeof runSecurityDetection>>;
type Waiter = { resolve(value: DetectionResult): void; reject(reason: unknown): void };
type PendingRun = { scope: DetectionScope; timer: NodeJS.Timeout; waiters: Waiter[] };
type ReadyRun = { key: string; scope: DetectionScope; waiters: Waiter[] };

const DEBOUNCE_MS = 750;
const MAX_CONCURRENCY = 2;
const pending = new Map<string, PendingRun>();
const ready: ReadyRun[] = [];
let active = 0;
let completed = 0;
let failed = 0;
const lastCompletedAt = new Map<string, number>();

function scopeKey(scope: DetectionScope) {
  if (scope.deviceId) return `device:${scope.deviceId}`;
  if (scope.assetId) return `asset:${scope.assetId}`;
  return "global";
}

function pump() {
  while (active < MAX_CONCURRENCY && ready.length) {
    const item = ready.shift()!;
    active += 1;
    void runSecurityDetection(item.scope)
      .then((result) => {
        completed += 1;
        lastCompletedAt.set(item.key, Date.now());
        item.waiters.forEach((waiter) => waiter.resolve(result));
      })
      .catch((error) => {
        failed += 1;
        item.waiters.forEach((waiter) => waiter.reject(error));
      })
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function markReady(key: string) {
  const item = pending.get(key);
  if (!item) return;
  pending.delete(key);
  ready.push({ key, scope: item.scope, waiters: item.waiters });
  pump();
}

export function scheduleSecurityDetection(scope: DetectionScope = {}, debounceMs = DEBOUNCE_MS) {
  const key = scopeKey(scope);
  return new Promise<DetectionResult>((resolve, reject) => {
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.scope = scope;
      existing.waiters.push({ resolve, reject });
      existing.timer = setTimeout(() => markReady(key), Math.max(0, debounceMs));
      existing.timer.unref();
      return;
    }
    const timer = setTimeout(() => markReady(key), Math.max(0, debounceMs));
    timer.unref();
    pending.set(key, { scope, timer, waiters: [{ resolve, reject }] });
  });
}

export function getDetectionDispatcherStatus() {
  return {
    strategy: "event_debounce_with_incremental_fallback" as const,
    debounceMs: DEBOUNCE_MS,
    maxConcurrency: MAX_CONCURRENCY,
    active,
    pending: pending.size + ready.length,
    completed,
    failed
  };
}

export function wasDetectionRecentlyCompleted(scope: DetectionScope, after: Date) {
  return (lastCompletedAt.get(scopeKey(scope)) ?? 0) >= after.getTime();
}
