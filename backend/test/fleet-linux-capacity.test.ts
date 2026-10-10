import assert from "node:assert/strict";
import test from "node:test";
import { metricsFromOverview, linuxCapacityBytes } from "../src/monitoring/linux/linux-health.service.js";
import { parseLinuxServerOverview } from "../src/telemetry/linux/linux-telemetry.service.js";

test("Linux overview records measured CPU, memory and root disk capacities", () => {
  const overview = parseLinuxServerOverview({ deviceId:"linux-1",host:"192.0.2.10",connectionPort:22,output:[
    "__FLA_HOST__","server","Ubuntu","6.8","up 1 day",
    "__FLA_CPU__","4","0.1 0.2 0.3","%Cpu(s): 10.0 us, 70.0 id",
    "__FLA_MEMORY__","Mem: 8192 2048 0 0 0 6144","Swap: 0 0 0",
    "__FLA_DISK__","Filesystem Type Size Used Avail Use% Mounted on","/dev/sda1 ext4 100G 25G 75G 25% /"
  ].join("\n") });
  const metrics=metricsFromOverview(overview);
  assert.equal(metrics.find(item=>item.metricKey==="cpu.total_cores")?.value,4);
  assert.equal(metrics.find(item=>item.metricKey==="memory.total_bytes")?.value,8192*1024**2);
  assert.equal(metrics.find(item=>item.metricKey==="memory.used_bytes")?.value,2048*1024**2);
  assert.equal(metrics.find(item=>item.metricKey==="disk.total_bytes")?.value,100*1024**3);
  assert.equal(metrics.find(item=>item.metricKey==="disk.used_bytes")?.value,25*1024**3);
});

test("Linux capacity parser rejects unknown values instead of guessing", () => {
  assert.equal(linuxCapacityBytes("1.5TiB"),1.5*1024**4);
  assert.equal(linuxCapacityBytes("unknown"),null);
});
