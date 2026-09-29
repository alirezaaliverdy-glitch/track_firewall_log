import assert from "node:assert/strict";
import { test } from "node:test";
import { projectFleetResources } from "../src/services/fleet-health-projection.js";

const now = Date.parse("2026-09-29T10:00:00Z");
const sample = (metricKey: string, value: number, ageMs = 0, unit = "percent") => ({metricKey,value,unit,timestamp:new Date(now-ageMs)});

test("unknown and unsupported sensors stay null, never zero", () => {
  const result = projectFleetResources([],now);
  assert.equal(result.score,null);
  assert.equal(result.rows.find(row=>row.metricKey==="cpu.usage_percent")?.value,null);
  assert.equal(result.measuredResources,0);
});
test("fresh vendor metrics are scored only from actual percentages", () => {
  const result=projectFleetResources([sample("cpu.usage_percent",80),sample("memory.usage_percent",30),sample("sessions.count",120,0,"count")],now);
  assert.equal(result.score,50);
  assert.equal(result.measuredResources,2);
  assert.equal(result.rows.find(row=>row.metricKey==="sessions.count")?.value,120);
});
test("stale, invalid, and future metrics cannot make a current score",()=>{
  const result=projectFleetResources([sample("cpu.usage_percent",22,600_000),sample("memory.usage_percent",101),sample("disk.usage_percent",2,-60_000)],now);
  assert.equal(result.score,null);
  assert.equal(result.fresh,false);
});
test("latest datastore collection uses its busiest member, not older readings",()=>{
  const result=projectFleetResources([sample("datastore.usage_percent",40),sample("datastore.usage_percent",79),sample("datastore.usage_percent",95,120_000)],now);
  assert.equal(result.rows.find(row=>row.metricKey==="datastore.usage_percent")?.value,79);
});
