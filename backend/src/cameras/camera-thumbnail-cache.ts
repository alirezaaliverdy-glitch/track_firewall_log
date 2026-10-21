import { CameraError } from "./camera-network.js";

export const THUMBNAIL_INTERVAL_MS = 3 * 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000, RETRY_MS = 5 * 60 * 1000;
type Entry = { cameraId: string; revision: string; bytes?: Buffer; capturedAt?: number; retryAt: number; touched: number };
export class CameraThumbnailCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<{ bytes: Buffer; capturedAt: number; stale: boolean }>>();
  private running = 0;
  constructor(private options = { maxBytes: 64 * 1024 * 1024, maxEntries: 512, now: () => Date.now() }) {}
  clear(cameraId?: string) {
    for (const [key, entry] of this.entries) if (!cameraId || entry.cameraId === cameraId) { this.entries.delete(key); this.pending.delete(key); }
  }
  sweep() {
    const now = this.options.now();
    for (const [key, entry] of this.entries) if (!this.pending.has(key) && now - (entry.capturedAt ?? entry.touched) >= RETENTION_MS) this.entries.delete(key);
  }
  private trim() {
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + (entry.bytes?.length ?? 0), 0);
    for (const [key, entry] of [...this.entries].sort((a,b) => a[1].touched-b[1].touched)) {
      if (bytes <= this.options.maxBytes && this.entries.size <= this.options.maxEntries) break;
      if (this.pending.has(key)) continue;
      bytes -= entry.bytes?.length ?? 0; this.entries.delete(key);
    }
  }
  async get(input: { ownerId: string; cameraId: string; profile: string; revision: string }, load: () => Promise<Buffer>) {
    this.sweep();
    const key = JSON.stringify([input.ownerId,input.cameraId,input.profile]), now = this.options.now();
    let entry = this.entries.get(key);
    if (entry && entry.revision !== input.revision) { this.entries.delete(key); this.pending.delete(key); entry = undefined; }
    if (entry) {
      entry.touched = now;
      if (entry.bytes && now - entry.capturedAt! < THUMBNAIL_INTERVAL_MS) return { bytes: entry.bytes, capturedAt: entry.capturedAt!, stale: false };
      if (now < entry.retryAt) {
        if (entry.bytes) return { bytes: entry.bytes, capturedAt: entry.capturedAt!, stale: true };
        throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 503);
      }
    }
    const existing = this.pending.get(key); if (existing) return existing;
    if (this.running >= 2) throw new CameraError("CAMERA_THUMBNAIL_BUSY", 429);
    entry ??= { cameraId: input.cameraId, revision: input.revision, retryAt: 0, touched: now };
    this.entries.set(key, entry); this.running++;
    const current = entry;
    const job = (async () => {
      try {
        const bytes = await Promise.resolve().then(load);
        if (bytes.length > 128 * 1024 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 502);
        if (this.entries.get(key) !== current) throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 409);
        current.bytes = bytes; current.capturedAt = this.options.now(); current.retryAt = 0;
        return { bytes, capturedAt: current.capturedAt, stale: false };
      } catch {
        current.retryAt = this.options.now() + RETRY_MS;
        if (this.entries.get(key) === current && current.bytes) return { bytes: current.bytes, capturedAt: current.capturedAt!, stale: true };
        throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 503);
      } finally {
        this.running--; if (this.entries.get(key) === current) this.pending.delete(key); this.trim();
      }
    })();
    this.pending.set(key,job); return job;
  }
}
export const cameraThumbnails = new CameraThumbnailCache();
const expiry = setInterval(() => cameraThumbnails.sweep(), 60_000); expiry.unref();
