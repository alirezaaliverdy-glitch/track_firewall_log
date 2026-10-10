import assert from "node:assert/strict";
import { test } from "node:test";
import { projectFleetResources } from "../src/services/fleet-health-projection.js";

const now = Date.parse("2026-09-29T10:00:00Z");
const sample = (metricKey: string, value: number, ageMs = 0, unit = "percent", labelsJson?: Record<string,string>) => ({metricKey,value,unit,timestamp:new Date(now-ageMs),labelsJson});

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
  const result=projectFleetResources([
    sample("datastore.usage_percent",40,0,"percent",{datastore:"slow"}),
    sample("datastore.total_bytes",1000,0,"bytes",{datastore:"slow"}),
    sample("datastore.used_bytes",400,0,"bytes",{datastore:"slow"}),
    sample("datastore.usage_percent",79,0,"percent",{datastore:"busy"}),
    sample("datastore.total_bytes",2000,0,"bytes",{datastore:"busy"}),
    sample("datastore.used_bytes",1580,0,"bytes",{datastore:"busy"}),
    sample("datastore.usage_percent",95,120_000,"percent",{datastore:"old"})
  ],now);
  const row=result.rows.find(row=>row.metricKey==="datastore.usage_percent");
  assert.equal(row?.value,79);
  assert.equal(row?.usedValue,1580);
  assert.equal(row?.totalValue,2000);
  assert.equal(row?.seriesLabel,"busy");
});
test("resource capacity is paired only with the same collection and is never fabricated",()=>{
  const result=projectFleetResources([
    sample("cpu.usage_percent",25),sample("cpu.total_cores",8,0,"count"),
    sample("memory.usage_percent",50),sample("memory.used_bytes",4*1024**3,0,"bytes"),sample("memory.total_bytes",8*1024**3,0,"bytes"),
    sample("disk.usage_percent",10),sample("disk.total_bytes",1000,60_000,"bytes")
  ],now);
  const cpu=result.rows.find(row=>row.metricKey==="cpu.usage_percent");
  const memory=result.rows.find(row=>row.metricKey==="memory.usage_percent");
  const disk=result.rows.find(row=>row.metricKey==="disk.usage_percent");
  assert.equal(cpu?.totalValue,8);
  assert.equal(cpu?.usedValue,null);
  assert.equal(memory?.usedValue,4*1024**3);
  assert.equal(memory?.totalValue,8*1024**3);
  assert.equal(disk?.totalValue,null);
});
