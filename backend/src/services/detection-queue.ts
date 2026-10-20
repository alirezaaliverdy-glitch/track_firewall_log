/** One pending promise per scope, fixed debounce deadline and no concurrent run of a scope. */
export function detectionQueue<S, R>(run: (scope: S) => Promise<R>, keyOf: (scope: S) => string, concurrency = 2, debounceMs = 750) {
  type Batch = { scope: S; promise: Promise<R>; resolve: (value: R) => void; reject: (error: unknown) => void; ready: boolean };
  const waiting = new Map<string, Batch>(), active = new Set<string>(), completedAt = new Map<string, number>();
  let completed = 0, failed = 0;
  function pump() {
    for (const [key, batch] of waiting) {
      if (active.size >= concurrency) break;
      if (!batch.ready || active.has(key)) continue;
      waiting.delete(key); active.add(key);
      void Promise.resolve().then(() => run(batch.scope)).then(result => {
        completed++; completedAt.delete(key); completedAt.set(key, Date.now());
        if (completedAt.size > 4096) completedAt.delete(completedAt.keys().next().value!);
        batch.resolve(result);
      }, error => { failed++; batch.reject(error); }).finally(() => { active.delete(key); pump(); });
    }
  }
  return {
    schedule(scope: S, delay = debounceMs): Promise<R> {
      const key = keyOf(scope), existing = waiting.get(key);
      if (existing) return existing.promise;
      if (waiting.size >= 4096) return Promise.reject(new Error("DETECTION_QUEUE_BUSY"));
      let resolve!: Batch["resolve"], reject!: Batch["reject"];
      const promise = new Promise<R>((yes, no) => { resolve = yes; reject = no; });
      const batch: Batch = { scope, promise, resolve, reject, ready: false };
      waiting.set(key, batch);
      const timer = setTimeout(() => { batch.ready = true; pump(); }, Math.max(0, Math.min(delay, debounceMs)));
      timer.unref();
      return promise;
    },
    status: () => ({ active: active.size, pending: waiting.size, completed, failed }),
    recentlyCompleted: (scope: S, after: Date) => (completedAt.get(keyOf(scope)) ?? 0) >= after.getTime()
  };
}
