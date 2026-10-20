import { getVendorTelemetryProfile } from "../telemetry/vendor-telemetry-profiles.js";
import { DAILY_CHECK_VENDOR_GUIDANCE, getVendorDailyCheckProfile } from "../daily-check/vendor-daily-check-profiles.js";

type Device = { id: string; name: string; vendor: string; type?: unknown; liveCollectorSupported: boolean };
type Collector = { deviceId: string; enabled: boolean; effectiveIntervalSeconds: number; lastSuccessAt: Date | string | null; lastErrorAt: Date | string | null; consecutiveFailures: number };
export type CollectionState = "fresh" | "stale" | "failed" | "disabled" | "not_checked" | "not_configured" | "unsupported";
const timestamp = (date: Date | string | null) => date ? new Date(date).getTime() : NaN;

/** Capability coverage, never a compliance certificate or proof that an entire vendor is safe. */
export function monitoringCoverage(devices: Device[], collectors: Collector[], now = new Date()) {
  const byDevice = new Map(collectors.map(item => [item.deviceId, item]));
  const rows = devices.map(device => {
    const profile = getVendorTelemetryProfile(device.vendor, device.type), daily = getVendorDailyCheckProfile(device.vendor, device.type), collector = byDevice.get(device.id);
    const age = collector ? now.getTime() - timestamp(collector.lastSuccessAt) : NaN;
    const interval = collector && Number.isFinite(collector.effectiveIntervalSeconds) ? Math.max(1, collector.effectiveIntervalSeconds) : null;
    let state: CollectionState = !device.liveCollectorSupported ? "unsupported" : !collector ? "not_configured" : !collector.enabled ? "disabled" : "not_checked";
    if (collector?.enabled && device.liveCollectorSupported) {
      if (collector.consecutiveFailures > 0 || Number.isFinite(timestamp(collector.lastErrorAt)) && (!Number.isFinite(timestamp(collector.lastSuccessAt)) || timestamp(collector.lastErrorAt) > timestamp(collector.lastSuccessAt))) state = "failed";
      else if (Number.isFinite(age) && age >= -30_000) state = age <= Math.max(120, (interval ?? 60) * 3) * 1000 ? "fresh" : "stale";
    }
    return {
      deviceId: device.id, deviceName: device.name, vendor: profile?.vendorId ?? daily?.vendor ?? device.vendor,
      state, observedAt: Number.isFinite(age) ? new Date(collector!.lastSuccessAt!).toISOString() : null, intervalSeconds: interval,
      eventRuleCount: profile?.findingRules.filter(rule => rule.eventPattern).length ?? 0,
      snapshotRuleCount: profile?.findingRules.filter(rule => rule.snapshotPath).length ?? 0,
      profileState: profile?.implemented ?? "unsupported",
      dailyCheck: daily?.implementationState ?? "unsupported",
      // References describe guidance, not proof that every recommendation is automated.
      officialGuide: daily ? DAILY_CHECK_VENDOR_GUIDANCE[daily.vendor] ?? null : null,
    };
  });
  return {
    assessedAt: now.toISOString(), scope: "configured-checks-only" as const,
    eventDetection: "event-driven-with-polling-fallback" as const, dashboardRefreshSeconds: 5,
    automaticRemediation: false as const,
    summary: { total: rows.length, fresh: rows.filter(row => row.state === "fresh").length, gaps: rows.filter(row => row.state !== "fresh").length },
    devices: rows,
  };
}
