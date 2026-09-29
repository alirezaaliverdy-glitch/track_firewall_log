import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chartReadings, orderedReadings, latencyReadings } from "../../src/features/assets/components/assetChartData.ts";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 27, 10, minutes)).toISOString();
test("chart data sort and deduplicate timestamped readings without manufacturing samples", () => {
  const data = orderedReadings([{ timestamp: at(2), value: 5 }, { timestamp: at(1), value: 8 }, { timestamp: at(1), value: 9 }, { timestamp: "invalid", value: 0 }, { timestamp: at(4), value: NaN }]);
  assert.deepEqual(data.map(point => point.value), [9, 5]);
  assert.deepEqual(chartReadings([{ timestamp: at(1), value: 51 }], false), [[Date.parse(at(1)), 51]]);
  assert.deepEqual(chartReadings([], false), []);
});
test("availability does not imply continuous uptime through missing collector evidence", () => {
  const result = chartReadings([{ timestamp: at(1), value: 1 }, { timestamp: at(2), value: 1 }, { timestamp: at(30), value: 0 }], true);
  assert.equal(result.length, 4); assert.equal(result[2][1], null); assert.equal(result[3][1], 0);
});
test("response duration omits failed, passive, grace and unspecified zero readings", () => {
  const checks = [
    { checkedAt: at(0), status: "online", latencyMs: 24, message: "SSH_SESSION_AUTHENTICATED" },
    { checkedAt: at(1), status: "offline", latencyMs: 8000 },
    { checkedAt: at(2), status: "online", latencyMs: 0 },
    { checkedAt: at(3), status: "online", latencyMs: 4000, message: "RECENT_COLLECTION_VERIFIED" },
    { checkedAt: at(4), status: "online", latencyMs: 3, message: "PASSIVE_HEARTBEAT_FRESH" },
    { checkedAt: at(5), status: "online", latencyMs: NaN }
  ];
  assert.deepEqual(latencyReadings(checks).map(point => point.value), [24]);
});
test("all vendors share compact CPU, RAM, traffic and availability charts at the top of overview", () => {
  const page = readFileSync("/src/features/assets/pages/AssetDetailPage.tsx", "utf8");
  const overview = page.split("function renderOverviewTrends()")[1].split("function renderOverviewFirstViewport()")[0];
  assert.equal((overview.match(/<AssetLiveCharts /g) ?? []).length, 1);
  assert.match(overview, /cpu.usage_percent/);
  assert.match(overview, /memory.usage_percent/);
  assert.doesNotMatch(overview, /AssetMetricCard|latencyReadings/);
  assert.match(page, /className="asset-device-overview">\s*\{renderOverviewTrends\(\)\}/);
  const panel = readFileSync("/src/features/assets/components/AssetLiveCharts.tsx", "utf8");
  assert.equal((panel.match(/key: "(cpu|memory|traffic|availability)"/g) ?? []).length, 4);
  assert.match(panel, /Historical \/ unverified/);
  assert.match(panel, /data-motion=\{motion\}/);
  assert.doesNotMatch(overview, /const preferred|sessions.count|vpn.active_count/);
  const chart = readFileSync("/src/features/assets/components/AssetChartPlot.tsx", "utf8");
  assert.match(chart, /timezone: "Asia\/Tehran"/);
  assert.doesNotMatch(chart, /export.highcharts|code.highcharts|fetch\(/);
  const mini = readFileSync("/src/features/assets/components/AssetMiniChart.tsx", "utf8");
  assert.match(mini, /chartReadings\(s.points,binary\)/);
  assert.match(mini, /duration:900/);
  assert.match(mini, /prefers-reduced-motion/);
  assert.match(mini, /connectNulls:false/);
  assert.doesNotMatch(mini, /Math.random|fetch\(/);
});
test("dashboard retains paged resource summary rings rather than detailed line charts", () => {
  const dashboard = readFileSync("/src/features/dashboard/pages/FleetHealthPanel.tsx", "utf8");
  assert.match(dashboard, /fleet-summary-dial/);
  assert.match(dashboard, /memory.usage_percent/);
  assert.match(dashboard, /disk.usage_percent/);
  assert.match(dashboard, /datastore.usage_percent/);
  assert.match(dashboard, /device.score:null/);
  assert.doesNotMatch(dashboard, /AssetMiniChart|FleetMiniChart|fleet-device-plots/);
});
