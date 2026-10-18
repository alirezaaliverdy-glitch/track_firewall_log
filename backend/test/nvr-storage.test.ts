import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { parseHikvisionDisks, parseDahuaDisks, probeNvrStorage } from "../src/cameras/nvr-storage.js";
import { probeNvr } from "../src/cameras/nvr-monitor.js";

test("HDD parsers preserve unknowns, validate units/capacity and never confuse API success with health", () => {
  const disk = parseHikvisionDisks('<hddList><hdd><id>1</id><capacity>2000000</capacity><freeSpace>500000</freeSpace><status>normal</status></hdd></hddList>')[0];
  assert.equal(disk.capacityBytes, 2e12); assert.equal(disk.usedBytes, 1.5e12); assert.equal(disk.smart, "unknown");
  assert.equal(parseHikvisionDisks('<hddList><hdd><capacity>1</capacity><freeSpace>2</freeSpace></hdd></hddList>')[0].freeBytes, null);
  const cgi = 'list[0].Name=/dev/sda\nlist[0].State=Success\nlist[0].Detail[0].TotalBytes=1000\nlist[0].Detail[0].UsedBytes=400\nlist[0].Detail[0].IsError=false\nlist[0].Detail[1].TotalBytes=2000\nlist[0].Detail[1].UsedBytes=1000\nlist[0].Detail[1].IsError=true';
  const d = parseDahuaDisks(cgi)[0]; assert.equal(d.capacityBytes, 3000); assert.equal(d.usedBytes, 1400); assert.equal(d.health, "error"); assert.equal(d.smart, "unknown");
  assert.equal(parseDahuaDisks('list[0].State=Success')[0].health, "unknown");
  assert.throws(() => parseDahuaDisks('<html>login</html>'), /RESPONSE_INVALID/);
  assert.throws(() => parseHikvisionDisks('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><hddList/>'), /XML_INVALID/);
});

test("real read-only vendor HTTP/SMART fixture, denied/redirect handling and ONVIF capability report", async () => {
  const host = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal)!.address;
  let mode = "hikvision", writes = 0, requests = 0, port = 0;
  const soap = (action: string, content = "") => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><q:${action}Response xmlns:q="http://www.onvif.org/ver10/device/wsdl">${content}</q:${action}Response></s:Body></s:Envelope>`;
  const server = createServer(async (req, res) => {
    requests++;
    if (req.method !== "GET" && req.url?.startsWith("/ISAPI")) writes++;
    if (mode === "denied") { res.writeHead(403); res.end(); return; }
    if (mode === "redirect") { res.writeHead(302, { location: "http://127.0.0.1/forbidden" }); res.end(); return; }
    if (req.method === "POST") {
      const action = /action="[^\"]*\/([^\/\"]+)"/.exec(String(req.headers["content-type"]))?.[1] ?? "";
      for await (const _ of req) { /* Drain bounded fixture request. */ }
      if (action === "GetDeviceInformation") res.end(soap(action, '<Manufacturer>Hikvision</Manufacturer><Model>Fixture NVR</Model>'));
      else if (action === "GetServices") res.end(soap(action, `<Service><Namespace>http://www.onvif.org/ver10/recording/wsdl</Namespace><XAddr>http://${host}:${port}/recording</XAddr></Service>`));
      else if (action === "GetRecordingJobs") res.end(soap(action, '<JobItem><JobToken>job1</JobToken></JobItem>'));
      else if (action === "GetRecordingJobState") res.end(soap(action, '<State><State>Error</State></State>'));
      else res.end(soap(action));
      return;
    }
    if (req.url?.includes("SMARTTest/status")) res.end('<SmartTestStatus><temprature>58</temprature><selfEvaluaingStatus>error</selfEvaluaingStatus><allEvaluaingStatus>badsectors</allEvaluaingStatus></SmartTestStatus>');
    else if (req.url?.startsWith("/ISAPI")) res.end('<hddList><hdd><id>1</id><hddName>Fixture HDD</hddName><status>normal</status><capacity>2000000</capacity><freeSpace>500000</freeSpace></hdd></hddList>');
    else res.end('list[0].State=Success\nlist[0].Detail[0].TotalBytes=2000\nlist[0].Detail[0].UsedBytes=1000\nlist[0].Detail[0].IsError=false');
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve)); port = (server.address() as { port: number }).port;
  try {
    const disk = await probeNvrStorage(host, { storage: { adapter: "hikvision", port } }, "", port, false);
    assert.equal(disk.status, "measured"); assert.equal(disk.disks[0].smart, "failed"); assert.equal(disk.disks[0].temperatureC, 58); assert.equal(writes, 0);
    const report = await probeNvr({ host, onvifPort: port, onvifPath: "/onvif", onvifHttps: false, profilesJson: [{ sourceToken: "ch1" }, { sourceToken: "ch1" }] }, {});
    assert.equal(report.reachable, true); assert.equal(report.configuredChannels, 1); assert.equal(report.jobs[0].state, "Error"); assert.ok(report.warnings.includes("disk_error")); assert.ok(report.warnings.includes("recording_job_error")); assert.equal(report.coverage.cpu, "unsupported");
    const before = requests; assert.equal((await probeNvrStorage(host, {}, "Unknown brand", port, false)).status, "unsupported"); assert.equal(requests, before, 'no vendor guessing/probing unknown brands');
    mode = "denied"; assert.equal((await probeNvrStorage(host, { storage: { adapter: "dahua", port } }, "", port, false)).status, "denied");
    mode = "redirect"; assert.equal((await probeNvrStorage(host, { storage: { adapter: "dahua", port } }, "", port, false)).status, "unavailable");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
