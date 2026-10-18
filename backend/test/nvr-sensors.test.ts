import assert from "node:assert/strict";
import { test } from "node:test";
import { nvrSensors } from "../src/cameras/nvr-sensors.js";
import type { NvrReport } from "../src/cameras/nvr-monitor.js";
const now = Date.parse("2026-10-18T10:00:00Z");
const report = (): NvrReport => ({ checkedAt: new Date(now).toISOString(), adapter: "onvif", reachable: true, durationMs: 121, identity: {}, configuredChannels: 16, clockDriftSeconds: -121,
  storageConfigurations: null, recordingCount: null, jobs: [{ token: "job1", state: "Idle", error: false }], interfaces: [], coverage: { identity: "measured", recordingJobs: "measured" }, warnings: [], truncated: false,
  storage: { source: "xiongmai", status: "measured", truncated: false, disks: [{ id: "1", name: "HDD", capacityBytes: 1e12, usedBytes: 1e12, freeBytes: 0, temperatureC: 56, health: "reported_ok", reportedState: "Normal", smart: "unknown" }] } });
test("NVR sensors never manufacture healthy hardware or zero values from missing data", () => {
  const sensors = nvrSensors(null, 300, now);
  assert.equal(sensors.length, 13); assert.ok(sensors.every(s => s.value === null && s.status === "unknown"));
  const measured = nvrSensors(report(), 300, now), at = (id: string) => measured.find(s => s.id === id)!;
  assert.equal(at("cpu").value, null); assert.equal(at("memory").status, "unknown"); assert.equal(at("smart").status, "unknown");
  assert.equal(at("usage").value, 100); assert.equal(at("usage").status, "ok", "overwrite-full is not a failure");
  assert.equal(at("clock").status, "warning"); assert.equal(at("temperature").status, "warning");
  assert.equal(at("job_errors").value, 0); assert.equal(at("job_errors").status, "ok", "Idle is not a recording error");
  assert.equal(at("channels").value, 16); assert.ok(at("channels").noteEn.includes("not online"));
});
test("NVR sensor age, failed disks, missing capacity and partial temperatures remain explicit", () => {
  const value = report(); value.storage!.disks.push({ ...value.storage!.disks[0], id: "2", capacityBytes: null, usedBytes: null, health: "error", smart: "failed", temperatureC: 67 });
  let sensors = nvrSensors(value, 300, now), at = (id: string) => sensors.find(s => s.id === id)!;
  assert.equal(at("capacity").value, null); assert.equal(at("usage").value, null); assert.equal(at("disk_health").status, "critical"); assert.equal(at("smart").status, "critical"); assert.equal(at("temperature").value, 67);
  for (const checkedAt of [new Date(now - 601000).toISOString(), new Date(now + 60000).toISOString(), "invalid"]) {
    sensors = nvrSensors({ ...value, checkedAt }, 300, now); assert.equal(at("disk_health").status, "stale"); assert.equal(at("capacity").status, "unknown");
  }
  value.storage!.disks = []; sensors = nvrSensors(value, 300, now); assert.equal(at("disks").value, 0); assert.equal(at("disks").status, "critical"); assert.equal(at("disk_health").value, null);
  value.coverage.recordingJobs = "denied"; sensors = nvrSensors(value, 300, now); assert.equal(at("job_errors").value, null);
  value.coverage.recordingJobs = "measured"; value.jobs[0].state = "Unknown"; sensors = nvrSensors(value, 300, now); assert.equal(at("job_errors").value, null, "missing job states must not look healthy");
  value.jobs[0] = { token: "error", state: "Error", error: true }; sensors = nvrSensors(value, 300, now); assert.equal(at("job_errors").status, "critical");
});
