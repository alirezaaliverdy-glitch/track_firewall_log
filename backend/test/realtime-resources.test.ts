import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { detectionQueue } from "../src/services/detection-queue.js";
import { resourceIssues, type MeasuredResource } from "../src/services/resource-issues.js";
import { evaluateVendorTelemetry, resetFindingEngineWindows } from "../src/telemetry/vendor-finding-engine.js";
import { findingDiagnostic } from "../src/services/finding-diagnostic.js";
import { normalizeDetectionVendor } from "../src/security/vendor-detection-rule-library.js";

test("continuous events do not postpone detection and share one pending promise", async t => {
  const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive));
  let calls = 0;
  const queue = detectionQueue(async (key: string) => { calls++; return key; }, key => key, 2, 20);
  const first = queue.schedule("device");
  for (let i=0;i<100;i++) assert.equal(queue.schedule("device"), first);
  const stream=setInterval(()=>{void queue.schedule("device");},2);t.after(()=>clearInterval(stream));
  assert.equal(await first, "device"); assert.equal(calls, 1);
});
test("same scope never overlaps; events during a run get a separate follow-up; failures retry", async t => {
  const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive));
  let count = 0, active = 0, max = 0;
  const queue = detectionQueue(async (key: string) => { active++; max=Math.max(max,active); await delay(25); active--; if (++count === 1) throw new Error("fixture"); return key; }, key=>key, 2, 1);
  const first = queue.schedule("device"); const rejected = assert.rejects(first,/fixture/);
  await delay(8); const second = queue.schedule("device");
  assert.notEqual(first,second); await rejected; assert.equal(await second,"device"); assert.equal(max,1);
  assert.equal(queue.status().failed,1);
});
test("a busy fleet receives fair bounded dispatch, including device 101", async t => {
  const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive));
  let active=0,max=0;
  const visited: string[]=[];
  const queue=detectionQueue(async (id:string)=>{ active++;max=Math.max(max,active);await delay(1);visited.push(id);active--;return id; },id=>id,2,1);
  await Promise.all(Array.from({length:205},(_,i)=>queue.schedule(String(i))));
  assert.equal(new Set(visited).size,205);assert.equal(max,2);
});
const now=Date.now();
const sample=(value:number, age=1000, source="snmpv3", mount="/"):MeasuredResource=>({id:`${value}-${age}`,metricKey:"disk.usage_percent",value,unit:"percent",timestamp:new Date(now-age),source,labelsJson:{mount}});
test("vendor-neutral resource findings require two fresh valid same-series measurements",()=>{
  assert.equal(resourceIssues([sample(99)],now).length,0);
  assert.equal(resourceIssues([sample(99),sample(99)],now).length,0);
  assert.equal(resourceIssues([sample(99),sample(98,2000)],now)[0].severity,"critical");
  assert.equal(resourceIssues([sample(87),sample(88,2000)],now)[0].active,true);
  assert.equal(resourceIssues([sample(99),sample(98,2000,"other")],now).length,0);
  assert.equal(resourceIssues([sample(99),sample(98,2000,"snmpv3","/other")],now).length,0);
  for(const invalid of [NaN,Infinity,-1,101]) assert.equal(resourceIssues([sample(invalid),sample(98,2000)],now).length,0);
  assert.equal(resourceIssues([sample(99,301000),sample(98,302000)],now).length,0);
  assert.equal(resourceIssues([sample(99,-31000),sample(98,2000)],now).length,0);
});
test("hysteresis clears only two actual recovery measurements, never silence or a single dip",()=>{
  assert.equal(resourceIssues([],now).length,0);
  assert.equal(resourceIssues([sample(79),sample(91,2000)],now).length,0);
  assert.equal(resourceIssues([sample(81),sample(79,2000)],now).length,0);
  assert.equal(resourceIssues([sample(79),sample(78,2000)],now)[0].active,false);
});
test("normal vendor messages are not failures; stable event references cannot inflate thresholds",()=>{
  resetFindingEngineWindows();
  for (const [vendor,raw] of [["cisco","AAA login accepted; tunnel established; ike active"],["juniper","ike established"],["fortigate","vip created private destination; local-in accepted"],["pfsense","update completed successfully"]]) {
    const result=evaluateVendorTelemetry({device:{id:vendor,vendor},events:Array.from({length:25},(_,i)=>({id:String(i),raw})),now:new Date(now)});
    assert.equal(result.findings.length,0, vendor);
  }
  const device={id:"cisco-fail",vendor:"cisco"},event={id:"same-event",raw:"AAA login failed",timestamp:new Date(now)};
  for(let i=0;i<10;i++)assert.equal(evaluateVendorTelemetry({device,events:[event],now:new Date(now)}).findings.length,0);
  assert.ok(evaluateVendorTelemetry({device,events:Array.from({length:5},(_,i)=>({...event,id:`new-${i}`})),now:new Date(now)}).findings.length>0);
});
test("unsupported vendor never gets a pretend diagnostic; supported diagnostics are registered",()=>{
  assert.equal(findingDiagnostic("not-a-real-vendor"),undefined);
  for(const vendor of ["linux","mikrotik","fortigate","cisco"]){const item=findingDiagnostic(vendor,"cpu.usage_percent");assert.ok(item,vendor);assert.equal(item.implementationState,"implemented");assert.equal(item.readOnly,true);assert.equal(item.requiredParams.length,0);}
  for(const [alias,expected] of [["RouterOS","mikrotik"],["Ubuntu Linux","linux"],["FortiOS","fortigate"],["Cisco IOS XE","cisco"]])assert.equal(findingDiagnostic(alias)?.vendor,expected);
  assert.equal(normalizeDetectionVendor("generic-bios-device"),"generic-bios-device");
});
