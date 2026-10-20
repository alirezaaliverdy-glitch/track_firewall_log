export const MAX_REVIEW_SECONDS = 24 * 60 * 60;
export function reviewRange(from: string, until: string, now = Date.now()) {
  const start = Date.parse(from), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < Date.UTC(2000, 0, 1) || end > now || end - start < 5000 || end - start > MAX_REVIEW_SECONDS * 1000) throw new Error("CAMERA_REVIEW_RANGE_INVALID");
  return { start, end };
}
/** Every request remains within the chosen review range, including a short final tail. */
export function reviewSegment(range: { start: number; end: number }, target: number, maxSeconds = 60) {
  if (!Number.isInteger(maxSeconds) || maxSeconds < 5 || maxSeconds > 60) throw new Error("CAMERA_REVIEW_RANGE_INVALID");
  if (!Number.isFinite(target) || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end - range.start < 5000 || range.end - range.start > MAX_REVIEW_SECONDS * 1000) throw new Error("CAMERA_REVIEW_RANGE_INVALID");
  const at = Math.min(range.end - 1, Math.max(range.start, target));
  const start = Math.floor(Math.min(at, range.end - 5000) / 1000) * 1000;
  const bounded = Math.max(range.start, start), duration = Math.min(maxSeconds, Math.floor((range.end - bounded) / 1000));
  if (duration < 5) throw new Error("CAMERA_REVIEW_RANGE_INVALID");
  return { start: bounded, duration, offset: (at - bounded) / 1000 };
}
