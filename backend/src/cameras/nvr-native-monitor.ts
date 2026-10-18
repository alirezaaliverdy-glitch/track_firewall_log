import type { CameraConnection } from "./camera-onvif.js";
import { readDvripNative } from "./nvr-dvrip.js";
import type { NvrReport } from "./nvr-monitor.js";

export async function probeNativeNvr(host: string, port: number, connection: CameraConnection): Promise<NvrReport> {
  const started = Date.now(), checkedAt = new Date().toISOString();
  const native = await readDvripNative(host, port, connection.storage?.username ? connection.storage : connection);
  const report: NvrReport = { checkedAt, adapter: "dvrip", reachable: true, durationMs: Date.now() - started, identity: native.identity,
    configuredChannels: native.configuredChannels ?? 0, clockDriftSeconds: null, storageConfigurations: null, recordingCount: null, jobs: [], interfaces: [],
    coverage: { identity: Object.keys(native.identity).length ? "measured" : "unavailable", configuredChannels: native.configuredChannels !== null ? "measured" : "unavailable",
      clock: "unsupported", network: "unsupported", storageConfiguration: "unsupported", recordings: "unsupported", recordingJobs: "unsupported", cpu: "unsupported", memory: "unsupported",
      channelOnline: native.channels.some(c => c.signalPresent !== null) ? "measured" : "unavailable" }, warnings: [], truncated: false, native,
    storage: { source: "xiongmai", status: native.disks !== null ? "measured" : native.errors.StorageInfo === "NVR_ACCESS_DENIED" ? "denied" : "unsupported",
      disks: native.disks ?? [], truncated: false, ...(native.errors.StorageInfo ? { errorCode: native.errors.StorageInfo } : {}) } };
  report.coverage.diskCapacity = native.disks?.some(d => d.capacityBytes !== null) ? "measured" : "unavailable";
  report.coverage.diskHealth = native.disks?.some(d => d.health !== "unknown") ? "measured" : "unsupported";
  if (native.disks?.length === 0) report.warnings.push("no_disks_reported");
  if (Object.keys(native.errors).length) report.warnings.push("native_partial_coverage");
  return report;
}
