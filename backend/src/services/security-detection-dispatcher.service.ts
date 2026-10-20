import { runSecurityDetection } from "../assets/asset-intelligence.service.js";
import { detectionQueue } from "./detection-queue.js";

export type DetectionScope = { deviceId?: string; assetId?: string };
const queue = detectionQueue(runSecurityDetection, (scope: DetectionScope) => scope.deviceId ? `device:${scope.deviceId}` : scope.assetId ? `asset:${scope.assetId}` : "global");
export function scheduleSecurityDetection(scope: DetectionScope = {}, debounceMs = 750) { return queue.schedule(scope, debounceMs); }
export const wasDetectionRecentlyCompleted = queue.recentlyCompleted;
export function getDetectionDispatcherStatus() {
  return { strategy: "event_debounce_with_incremental_fallback" as const, debounceMs: 750, maxConcurrency: 2, ...queue.status() };
}
