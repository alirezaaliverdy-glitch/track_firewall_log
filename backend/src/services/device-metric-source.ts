// Reused device IDs keep their history. ESXi charts must not turn readings
// collected from that ID's former Linux identity into ESXi sensor data.
export function metricSourceForVendor(vendor: string): string | null {
  return vendor.trim().toLowerCase() === "esxi" ? "esxi" : null;
}

export function matchesDeviceMetricSource(vendor: string, source: string): boolean {
  const expected = metricSourceForVendor(vendor);
  return expected === null || source === expected;
}
