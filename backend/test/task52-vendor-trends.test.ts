import assert from "node:assert/strict";
import test from "node:test";
import type { DeviceConnectionTestResult } from "../src/connectors/types.js";
import { buildDeviceTrafficSeries } from "../src/services/device-traffic-series.js";
import { ciscoMeasurements, vendorMeasurements } from "../src/services/vendor-metric-samples.service.js";

const at = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);
const counter = (metricKey: string, value: number, seconds: number, name = "ether1") => ({
  metricKey, value, timestamp: at(seconds), labelsJson: { interface: name }
});

test("traffic graph uses elapsed time, not cumulative byte totals", () => {
  const traffic = buildDeviceTrafficSeries([
    counter("network.rx_bytes", 1_000_000, 0),
    counter("network.tx_bytes", 500_000, 0),
    counter("network.rx_bytes", 2_000_000, 10),
    counter("network.tx_bytes", 750_000, 10)
  ]);
  assert.equal(traffic.interface, "ether1");
  assert.equal(traffic.rx[0].value, 0.8);
  assert.equal(traffic.tx[0].value, 0.2);
});

test("counter reset and insufficient samples never create a false traffic rate", () => {
  const traffic = buildDeviceTrafficSeries([
    counter("network.rx_bytes", 1_000_000, 0),
    counter("network.rx_bytes", 100, 10),
    counter("network.tx_bytes", 50, 10)
  ]);
  assert.deepEqual(traffic.rx, []);
  assert.deepEqual(traffic.tx, []);
});

test("vendor metrics omit unavailable values and keep the interface identity", () => {
  const result = {
    connected: true,
    vendor: "mikrotik",
    mikrotik: { cpuLoad: "", interfaceCounters: [{ name: "ether1", rxBytes: 500, txBytes: 800 }] }
  } as DeviceConnectionTestResult;
  const metrics = vendorMeasurements(result);
  assert.equal(metrics.length, 2);
  assert.deepEqual(metrics[0].labels, { interface: "ether1" });
  assert.equal(metrics[0].value, 500);
});

test("Cisco five-minute rates are recorded as rates, not byte counters", () => {
  const metrics = ciscoMeasurements({
    cpu: "CPU utilization for five seconds: 7%; one minute: 9%; five minutes: 10%",
    interfacesDetailed: "GigabitEthernet0/0 is up, line protocol is up\n  5 minute input rate 2000000 bits/sec, 3 packets/sec\n  5 minute output rate 1000000 bits/sec, 2 packets/sec"
  });
  assert.ok(metrics.some((item) => item.metricKey === "cpu.usage_percent" && item.value === 7));
  assert.ok(metrics.some((item) => item.metricKey === "network.rx_mbps" && item.value === 2 && item.labels?.window === "5m"));
});
