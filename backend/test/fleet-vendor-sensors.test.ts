import assert from "node:assert/strict";
import { test } from "node:test";
import { vendorMeasurements, ciscoMeasurements, routerOsBytes } from "../src/services/vendor-metric-samples.service.js";
import type { DeviceConnectionTestResult } from "../src/connectors/types.js";
import { parseMikroTikInterfaceCounters } from "../src/connectors/mikrotik-interface-counters.js";
test("MikroTik traffic parses quoted names, wrapped fields and grouped byte counters",()=>{
  assert.deepEqual(parseMikroTikInterfaceCounters('0 R name="ether1" link-downs=2\n rx-byte=205 164 277 tx-byte=147 977 500 rx-packet=12\n1 name="ether2"\n rx-byte=0 tx-byte=0 rx-packet=0'),[{name:"ether1",rxBytes:205164277,txBytes:147977500},{name:"ether2",rxBytes:0,txBytes:0}]);
  assert.deepEqual(parseMikroTikInterfaceCounters('name="ether1" rx-byte=unknown tx-byte=10'),[]);
});
test("RouterOS resource units normalize without guessing malformed values",()=>{
  assert.equal(routerOsBytes("64.0MiB"),67108864);
  assert.equal(routerOsBytes("1024"),1024);
  assert.equal(routerOsBytes("unknown"),null);
});
test("MikroTik memory and storage use measured total/free, never zero for missing values",()=>{
  const result={connected:true,mikrotik:{cpuLoad:"12",cpuCount:"4",memoryFree:"64MiB",memoryTotal:"128MiB",storageFree:"8MiB",storageTotal:"16MiB",interfaces:[]}} as unknown as DeviceConnectionTestResult;
  const values=vendorMeasurements(result);
  assert.equal(values.find(v=>v.metricKey==="cpu.total_cores")?.value,4);
  assert.equal(values.find(v=>v.metricKey==="memory.usage_percent")?.value,50);
  assert.equal(values.find(v=>v.metricKey==="memory.used_bytes")?.value,64*1024**2);
  assert.equal(values.find(v=>v.metricKey==="memory.total_bytes")?.value,128*1024**2);
  assert.equal(values.find(v=>v.metricKey==="disk.usage_percent")?.value,50);
  assert.equal(values.find(v=>v.metricKey==="disk.used_bytes")?.value,8*1024**2);
  assert.equal(values.find(v=>v.metricKey==="disk.total_bytes")?.value,16*1024**2);
  delete result.mikrotik!.memoryTotal;
  assert.equal(vendorMeasurements(result).some(v=>v.metricKey==="memory.usage_percent"),false);
  assert.equal(vendorMeasurements(result).some(v=>v.metricKey==="memory.total_bytes"),false);
});
test("Cisco processor pool uses valid measured utilization",()=>{
  const values=ciscoMeasurements({memory:"Processor Pool Total: 1000 Used: 250 Free: 750"});
  assert.equal(values.find(v=>v.metricKey==="memory.usage_percent")?.value,25);
  assert.equal(values.find(v=>v.metricKey==="memory.total_bytes")?.value,1000);
  assert.equal(values.find(v=>v.metricKey==="memory.used_bytes")?.value,250);
  assert.equal(ciscoMeasurements({memory:"% Invalid input"}).length,0);
});
