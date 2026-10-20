/** One bounded next segment in memory; never localStorage, disk or an unbounded video cache. */
export class ReplayBuffer<T> {
  private slot?: { key: string; abort: AbortController; promise: Promise<{ value?: T; error?: unknown }> };
  prepare(key: string, load: (signal: AbortSignal) => Promise<T>) {
    if (this.slot?.key === key) return;
    this.clear();
    const abort = new AbortController();
    this.slot = { key, abort, promise: load(abort.signal).then(value => ({ value }), error => ({ error })) };
  }
  async take(key: string, signal?: AbortSignal): Promise<T | undefined> {
    const slot = this.slot;
    if (!slot || slot.key !== key) { await this.clear(); return undefined; }
    this.slot = undefined;
    const abort = () => slot.abort.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const result = await slot.promise.finally(() => signal?.removeEventListener("abort", abort));
    if (slot.abort.signal.aborted) return undefined;
    if (result.error) throw result.error;
    return result.value;
  }
  clear(): Promise<void> {
    const slot = this.slot; this.slot = undefined;
    slot?.abort.abort();
    return slot ? slot.promise.then(() => undefined) : Promise.resolve();
  }
}
