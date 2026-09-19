export type CollectorScheduleState = {
  deviceId?: string;
  intervalSeconds: number;
  lastCollectedAt: Date | null;
  lastSuccessAt?: Date | null;
  lastErrorAt: Date | null;
  consecutiveIdleRuns?: number;
  consecutiveFailures?: number;
};

function stableJitter(deviceId = "collector") {
  let hash = 0;
  for (const character of deviceId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return 0.9 + (Math.abs(hash) % 21) / 100;
}

export function effectiveCollectorIntervalSeconds(state: CollectorScheduleState) {
  const base = Math.max(10, state.intervalSeconds);
  const lastFailureIsCurrent = Boolean(state.lastErrorAt && (!state.lastSuccessAt || state.lastErrorAt > state.lastSuccessAt));
  const failureMultiplier = lastFailureIsCurrent ? 2 ** Math.min(4, Math.max(1, state.consecutiveFailures ?? 1)) : 1;
  const idleMultiplier = lastFailureIsCurrent ? 1 : 2 ** Math.min(2, Math.floor(Math.max(0, state.consecutiveIdleRuns ?? 0) / 2));
  return Math.round(Math.min(900, base * failureMultiplier * idleMultiplier) * stableJitter(state.deviceId));
}

export function isCollectorDue(state: CollectorScheduleState, now = new Date()) {
  const lastAttempt = [state.lastCollectedAt, state.lastErrorAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (!lastAttempt) return true;
  return now.getTime() - lastAttempt.getTime() >= effectiveCollectorIntervalSeconds(state) * 1000;
}
