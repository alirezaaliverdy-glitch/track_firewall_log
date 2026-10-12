import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInterfaceRates, normalizedFlowBytes } from "../src/services/device-traffic-overview.service.js";

const at = (seconds: number) => new Date(1_700_000_000_000 + seconds * 1000);
const sample = (metricKey: string, value: number, seconds: number, name: string) => ({ metricKey, value, timestamp: at(seconds), labelsJson: { interface: name } });

test("ranks separate interfaces by measured receive and transmit throughput", () => {
  const rows = [
    sample("network.rx_bytes", 1000, 0, "eth0"), sample("network.rx_bytes", 1001000, 10, "eth0"),
    sample("network.tx_bytes", 2000, 0, "eth0"), sample("network.tx_bytes", 2002000, 10, "eth0"),
    sample("network.rx_bytes", 1000, 0, "eth1"), sample("network.rx_bytes", 3000, 10, "eth1")
  ];
  const result = buildInterfaceRates(rows, at(15).getTime());
  assert.equal(result[0].name, "eth0");
  assert.equal(result[0].rxMbps, 0.8);
  assert.equal(result[0].txMbps, 1.6);
  assert.equal(result[0].totalMbps, 2.4);
  assert.equal(result[1].name, "eth1");
});

test("does not rank stale counters, resets, or missing pairs as live traffic", () => {
  const rows = [sample("network.rx_bytes", 9000, 0, "reset"), sample("network.rx_bytes", 100, 10, "reset"), sample("network.rx_bytes", 100, 10, "single")];
  const fresh = buildInterfaceRates(rows, at(15).getTime());
  assert.equal(fresh.find((item) => item.name === "reset")?.totalMbps, null);
  assert.equal(fresh.find((item) => item.name === "single")?.totalMbps, null);
  const stale = buildInterfaceRates([sample("network.rx_mbps", 7, 10, "Gi0/1")], at(1000).getTime());
  assert.equal(stale[0].stale, true);
  assert.equal(stale[0].totalMbps, null);
});

test("Cisco five-minute rates are not treated as cumulative byte counters", () => {
  const result = buildInterfaceRates([sample("network.rx_mbps", 13, 10, "Gi0/1"), sample("network.tx_mbps", 2, 10, "Gi0/1")], at(15).getTime());
  assert.equal(result[0].method, "device_5m_average");
  assert.equal(result[0].totalMbps, 15);
});

test("flow bytes require explicit safe counters and do not double count totals", () => {
  assert.equal(normalizedFlowBytes({ bytes: 900, bytesSent: 400, bytesReceived: 500 }), 900);
  assert.equal(normalizedFlowBytes({ bytesSent: 400, bytesReceived: 500 }), 900);
  assert.equal(normalizedFlowBytes({ bytesSent: 400 }), null);
  assert.equal(normalizedFlowBytes({ count: 900 }), null);
});
