import type { NvrReport } from "./nvr-monitor.js";

/** Non-destructive diagnosis of actual fresh vendor readings, not a SMART self-test. */
export function diagnoseNvrDisks(report: NvrReport | null) {
  const measured = report?.storage?.status === "measured", disks = report?.storage?.disks ?? [];
  const checks = disks.map(disk => {
    const warnings: string[] = [];
    if (disk.health === "error") warnings.push("reported_disk_error");
    if (disk.smart === "failed") warnings.push("smart_failed");
    if (disk.temperatureC !== null && disk.temperatureC >= 55) warnings.push("high_temperature");
    const completeCapacity = disk.capacityBytes !== null && disk.usedBytes !== null && disk.freeBytes !== null;
    const consistent = completeCapacity ? Math.abs(disk.capacityBytes! - disk.usedBytes! - disk.freeBytes!) <= Math.max(1024 * 1024, disk.capacityBytes! * .001) : null;
    if (consistent === false) warnings.push("inconsistent_capacity");
    return { id: disk.id, name: disk.name, reportedHealth: disk.health, smart: disk.smart, temperatureC: disk.temperatureC, capacityConsistent: consistent,
      utilizationPercent: disk.capacityBytes && disk.usedBytes !== null ? Math.round(disk.usedBytes / disk.capacityBytes * 1000) / 10 : null,
      assessment: warnings.some(code => ["reported_disk_error", "smart_failed"].includes(code)) ? "critical" : warnings.length ? "warning" : disk.smart === "passed" && disk.health === "reported_ok" ? "reported_pass" : "incomplete", warnings };
  });
  return { checkedAt: report?.checkedAt ?? null, readOnly: true, selfTestStarted: false, smartSelfTestSupported: false, measured,
    assessment: report && !report.reachable || measured && !disks.length || checks.some(check => check.assessment === "critical") ? "critical" : checks.some(check => check.assessment === "warning") ? "warning" : "incomplete",
    checks, missing: [!measured ? "disk_inventory" : null, disks.some(disk => disk.smart === "unknown") || !disks.length ? "smart" : null, disks.some(disk => disk.temperatureC === null) || !disks.length ? "temperature" : null].filter(Boolean) };
}
