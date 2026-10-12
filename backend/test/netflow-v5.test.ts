import assert from "node:assert/strict";
import { test } from "node:test";
import { netflowExporterSettings, parseNetflowV5, validExporterIp } from "../src/services/netflow-v5.service.js";

function packet() {
  const value = Buffer.alloc(72);
  value.writeUInt16BE(5, 0);
  value.writeUInt16BE(1, 2);
  value.writeUInt32BE(1234, 4);
  value.writeUInt32BE(99, 16);
  value.writeUInt16BE(1, 22);
  Buffer.from([192, 0, 2, 10]).copy(value, 24);
  Buffer.from([198, 51, 100, 20]).copy(value, 28);
  value.writeUInt16BE(2, 36);
  value.writeUInt16BE(4, 38);
  value.writeUInt32BE(1800, 44);
  value.writeUInt16BE(43210, 56);
  value.writeUInt16BE(443, 58);
  return value;
}

test("NetFlow v5 decodes exporter flow bytes, endpoints, ports and ifIndex", () => {
  const result = parseNetflowV5(packet());
  assert.equal(result?.sequence, 99);
  assert.equal(result?.samplingRate, 1);
  assert.deepEqual(result?.flows[0], { sourceIp: "192.0.2.10", destinationIp: "198.51.100.20", sourcePort: 43210, destinationPort: 443, inputIndex: 2, outputIndex: 4, bytes: 1800 });
});

test("unsupported or malformed flow datagrams fail closed", () => {
  const valid = packet();
  assert.equal(parseNetflowV5(valid.subarray(0, 70)), null);
  valid.writeUInt16BE(9, 0);
  assert.equal(parseNetflowV5(valid), null);
});

test("exporter configuration requires explicit enabled unicast IPv4", () => {
  assert.equal(validExporterIp("192.0.2.10"), true);
  assert.equal(validExporterIp("224.0.0.1"), false);
  assert.deepEqual(netflowExporterSettings({ netflowV5: { enabled: true, exporterIp: "192.0.2.10" } }), { enabled: true, exporterIp: "192.0.2.10" });
  assert.equal(netflowExporterSettings({}).enabled, false);
});
