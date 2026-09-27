import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DeviceStatus } from "@prisma/client";
import { isConnectivityTransition } from "../src/services/device-connectivity-sensor.service.js";
import { buildDeviceTrafficSeries } from "../src/services/device-traffic-series.js";

test("healthy repeated probes and service restart do not create online transitions", () => {
  assert.equal(isConnectivityTransition(undefined, DeviceStatus.online, DeviceStatus.online), false);
  assert.equal(isConnectivityTransition(DeviceStatus.online, DeviceStatus.offline, DeviceStatus.online), false);
  assert.equal(isConnectivityTransition(DeviceStatus.offline, DeviceStatus.online, DeviceStatus.online), true);
  assert.equal(isConnectivityTransition(DeviceStatus.online, DeviceStatus.online, DeviceStatus.offline), true);
});
test("traffic preserves the selected interface and does not mix averages with counter deltas", () => {
  const timestamp = new Date("2026-09-27T10:00:00Z");
  const sample = (metricKey: string, value: number, name: string, time = timestamp) => ({ metricKey, value, timestamp: time, labelsJson: { interface: name } });
  const traffic = buildDeviceTrafficSeries([
    sample("network.rx_mbps", .001, "Vlan1"), sample("network.rx_mbps", 12, "GigabitEthernet0/1"),
    sample("network.tx_mbps", 5, "GigabitEthernet0/1"), sample("network.rx_bytes", 10, "GigabitEthernet0/1", new Date(timestamp.getTime() - 10000)),
    sample("network.rx_bytes", 100, "GigabitEthernet0/1"), sample("network.tx_mbps", -1, "GigabitEthernet0/1")
  ]);
  assert.equal(traffic.interface, "GigabitEthernet0/1");
  assert.equal(traffic.method, "device_5m_average");
  assert.equal(traffic.rx.length, 1); assert.equal(traffic.tx.length, 1);
  assert.equal(traffic.rx[0].value, 12);
});
test("single readings have visible markers and traffic shares timestamp axes", () => {
  const source = readFileSync("/src/features/assets/components/AssetChartPlot.tsx", "utf8");
  assert.match(source, /Date.parse\(point.timestamp\) - start/);
  assert.match(source, /<circle/);
  assert.match(source, /Number.isFinite\(point.value\)/);
  assert.match(source, /binary \? `H/);
});
test("command review starts expanded and its scroll body cannot compress detail rows", () => {
  const dialog = readFileSync("/src/features/actions/components/ExecutionReviewDialog.tsx", "utf8");
  const css = readFileSync("/src/features/actions/pages/ActionsPage.css", "utf8");
  assert.match(dialog, /className="execution-review__commands" open/);
  assert.match(css, /\.execution-review__body \{\s*display: block;\s*flex: 1 1 auto;/);
  assert.match(dialog, /commands.length === 0/);
});
