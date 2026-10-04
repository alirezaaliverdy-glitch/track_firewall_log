import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import ssh2, { type Client, type ClientChannel } from "ssh2";
import type { Device } from "@prisma/client";
import { esxiSshConfig, esxiSshSessionId, esxiExec } from "../src/connectors/esxi-ssh.transport.js";
import { ESXI_SSH_READ_COMMANDS, esxiCsv, parseEsxiSshInventory } from "../src/connectors/esxi-ssh.inventory.js";
import { esxiSshConnector, collectEsxiSshHost } from "../src/connectors/esxi-ssh.connector.js";
import { vendorMeasurements } from "../src/services/vendor-metric-samples.service.js";
import { selectDeviceConnector } from "../src/connectors/connector-registry.service.js";
import { isLinuxSshCapable } from "../src/connectors/linux-ssh.connector.js";
import { linuxSshLogCollector } from "../src/collectors/linux-ssh-log.collector.js";
import { isCurrentCollectorState, selectCollector } from "../src/collectors/collector-registry.service.js";
import { matchesDeviceMetricSource } from "../src/services/device-metric-source.js";
import { mergeReactivatedCapabilities } from "../src/services/device-onboarding.service.js";
import { getConnectionProfile } from "../src/vendors/connection-method.registry.js";
import { liveVendorProjection } from "../src/services/device-workspace.service.js";
import { withSharedSsh, closeSharedSshSessions } from "../src/services/shared-ssh-session.service.js";

const fingerprint = "SHA256:" + Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "");
const {Server, utils} = ssh2;
const device = {id: "esxi-test", host: "esxi.example.test", managementPort: 22, vendor: "esxi", protocol: "ssh",
  capabilities: {esxiSshFingerprint: fingerprint}} as unknown as Device;
test("re-registered ESXi ignores inherited Linux capabilities, collector state and sensor history", () => {
  const reactivated = {...device, type: "esxi", capabilities: {
    esxiSshFingerprint: fingerprint, linuxStatus: {connected: true}, onboarding: {previousVendor: "linux"}
  }} as unknown as Device;
  assert.equal(isLinuxSshCapable(reactivated), false);
  assert.equal(selectDeviceConnector(reactivated), esxiSshConnector);
  assert.equal(linuxSshLogCollector.supports(reactivated), false);
  assert.equal(selectCollector(reactivated), null);
  assert.equal(isCurrentCollectorState(reactivated, "linux_ssh"), false);
  assert.equal(matchesDeviceMetricSource("esxi", "linux-ssh"), false);
  assert.equal(matchesDeviceMetricSource("esxi", "esxi"), true);
  assert.equal(matchesDeviceMetricSource("linux", "linux-ssh"), true);
  const merged = mergeReactivatedCapabilities({linuxStatus: {connected:true}, inventoryStatus:"archived"},
    {esxiSshFingerprint:fingerprint}, "linux", "esxi");
  assert.equal("linuxStatus" in merged, false);
  assert.equal(merged.esxiSshFingerprint, fingerprint);
  assert.equal(mergeReactivatedCapabilities({esxiStatus:{connected:true}}, {}, "esxi", "esxi").esxiStatus !== undefined, true);
});
test("SSH registration selects an independent read-only connector and profile", async () => {
  assert.equal(esxiSshConnector.supports(device), true);
  assert.equal(esxiSshConnector.supports({...device, protocol: "api"}), false);
  assert.equal(selectDeviceConnector(device), esxiSshConnector);
  assert.equal(getConnectionProfile("esxi")?.methods.find(v => v.key === "ssh")?.selectable, true);
  assert.equal((await esxiSshConnector.getCapabilities(device)).canExecuteWriteActions, false);
  await assert.rejects(() => esxiSshConnector.execute({} as never, device), /not registered for SSH/);
  assert.ok(Object.values(ESXI_SSH_READ_COMMANDS).every(v => !/[;&|\n]/.test(v) && !/\b(set|remove|reboot|shutdown)\b/.test(v)));
});
test("SSH requires a canonical pinned RSA fingerprint, with no weak key algorithm fallback", () => {
  const config = esxiSshConfig(device, device.host, 22022, {username: "monitor", password: "dummy", sudo: false});
  assert.equal(config.port, 22022);
  assert.equal(config.hostHash, "sha256");
  assert.equal(config.tryKeyboard, true);
  assert.equal(esxiSshConfig(device, device.host, 22, {username:"monitor",privateKey:"test-placeholder",sudo:false}).tryKeyboard, false);
  const verify = config.hostVerifier as (hash: string) => boolean;
  assert.equal(verify(Buffer.alloc(32, 1).toString("hex")), true);
  assert.equal(verify(Buffer.alloc(32, 2).toString("hex")), false);
  assert.equal(verify("invalid"), false);
  assert.deepEqual(config.algorithms?.serverHostKey, ["rsa-sha2-512", "rsa-sha2-256"]);
  assert.throws(() => esxiSshConfig({...device, capabilities: {}}, device.host, 22, {username:"monitor",password:"dummy",sudo:false}), /fingerprint/);
  assert.notEqual(esxiSshSessionId(device), esxiSshSessionId({...device, capabilities:{esxiSshFingerprint:"SHA256:"+Buffer.alloc(32,2).toString("base64").replace(/=+$/,"")}}));
});
test("ESXi CSV handles quotes and the collector never invents missing usage/health", () => {
  assert.equal(esxiCsv('Name,Description,\r\nvmnic0,"adapter, \""\"" special",\r\n')[0]?.name, "vmnic0");
  assert.throws(() => esxiCsv('Name\n"broken'), /incomplete CSV/);
  const esxi = parseEsxiSshInventory({
    identity: "VMware ESXi 8.0.3 build-12345678",
    hostname: "   Fully Qualified Domain Name: esxi.example.test\n   Host Name: esxi",
    hardware: "   Vendor Name: Dell Inc.\n   Product Name: PowerEdge\n   Serial Number: TEST",
    memory: "   Physical Memory: 8589934592 Bytes",
    cpu: "   CPU Cores: 8", maintenance: "Disabled",
    datastores: 'Mount Point,Volume Name,UUID,Mounted,Type,Size,Free,\n/vmfs/volumes/1,"Main, storage",1,true,VMFS-6,1000,400,\n/bootbank,boot,2,true,vfat,100,50,',
    nics: "Name,Link Status,Speed,\nvmnic0,Up,1000,\nvmnic1,Down,0,",
    vmkernel: "Name,IPv4 Address,\nvmk0,192.0.2.1,",
    portgroups: "Name,Virtual Switch,VLAN ID,\nManagement Network,vSwitch0,10,"
  }, device);
  assert.equal(esxi.hostname, "esxi.example.test");
  assert.equal(esxi.memoryBytes, 8589934592);
  assert.equal(esxi.cpuCores, 8);
  assert.equal(esxi.maintenanceMode, false);
  assert.equal(esxi.datastores.length, 1); // Bootbank/vfat is not a datastore.
  assert.equal(esxi.datastores[0]?.freeBytes, 400);
  assert.equal(esxi.datastores[0]?.name, "Main, storage");
  assert.equal(esxi.physicalNics[0]?.linkUp, true);
  assert.equal(esxi.vmkernelNics[0]?.ip, "192.0.2.1");
  assert.equal(esxi.portGroups[0]?.vlanId, 10);
  assert.equal(esxi.cpuPercent, null);
  assert.equal(esxi.memoryPercent, null);
  assert.equal(esxi.vmCount, null);
  assert.equal(esxi.overallStatus, "unknown");
  assert.equal(vendorMeasurements({connected:true,esxi} as never).some(v => ["cpu.usage_percent","memory.usage_percent","vm.count"].includes(v.metricKey)), false);
  assert.equal(liveVendorProjection("esxi", {esxiStatus:{connected:true,esxi,diagnostic:{transport:"ssh"}}}, null)?.connectorType, "esxi-ssh");
  assert.throws(() => parseEsxiSshInventory({identity:"Linux test"},device), /did not identify/);
});
function fakeExec() {
  const channel = new EventEmitter() as EventEmitter & {stderr: EventEmitter; close(): void};
  channel.stderr = new EventEmitter(); channel.close = () => undefined;
  const client = {exec: (_command: string, callback: (error: null, channel: ClientChannel) => void) => callback(null, channel as unknown as ClientChannel)} as unknown as Client;
  return {client, channel};
}
test("SSH command reader limits output, requires exit success and enforces a deadline", async () => {
  let fake = fakeExec();
  let promise = esxiExec(fake.client, "vmware -v", 100);
  fake.channel.emit("data", Buffer.from("VMware ESXi"));
  fake.channel.emit("close", 0);
  assert.equal(await promise, "VMware ESXi");
  fake = fakeExec(); promise = esxiExec(fake.client, "vmware -v", 100);
  fake.channel.emit("data", Buffer.alloc(512*1024+1));
  await assert.rejects(promise, /safe limit/);
  fake = fakeExec(); promise = esxiExec(fake.client, "vmware -v", 100);
  fake.channel.emit("close", undefined);
  await assert.rejects(promise, /failed/);
  fake = fakeExec();
  await assert.rejects(esxiExec(fake.client, "vmware -v", 5), /timed out/);
});

for (const method of ["password", "keyboard-interactive"] as const) {
test(`Real loopback SSH ${method} verifies the pinned host and reuses one authenticated session`, async () => {
  const keys = generateKeyPairSync("rsa", {modulusLength: 2048});
  const privateKey = keys.privateKey.export({type:"pkcs1",format:"pem"}).toString();
  const parsed = utils.parseKey(privateKey);
  if (parsed instanceof Error || Array.isArray(parsed)) throw new Error("Test host key parsing failed.");
  const actualFingerprint = "SHA256:" + createHash("sha256").update(parsed.getPublicSSH()).digest("base64").replace(/=+$/, "");
  let connections = 0;
  const server = new Server({hostKeys:[privateKey]}, client => {
    connections++;
    client.on("error", () => undefined);
    client.on("authentication", ctx => {
      if (ctx.username !== "monitor") return ctx.reject([method]);
      if (method === "keyboard-interactive" && ctx.method === "keyboard-interactive") {
        return ctx.prompt([{prompt:"Password: ",echo:false}], answers => answers[0] === "test-only" ? ctx.accept() : ctx.reject([method]));
      }
      if (method === "password" && ctx.method === "password" && ctx.password === "test-only") return ctx.accept();
      ctx.reject([method]);
    });
    client.on("ready", () => client.on("session", accept => {
      const session = accept();
      session.on("exec", (acceptExec, _reject, info) => {
        const stream = acceptExec();
        const responses:Record<string,string>={
          "vmware -v":"VMware ESXi 8.0.3 build-12345678\n",
          "vim-cmd hostsvc/hostsummary":"hardware = (vim.host.Summary.HardwareSummary) {\n cpuMhz = 2000,\n numCpuCores = 4,\n memorySize = 8589934592,\n}\nquickStats = (vim.host.Summary.QuickStats) {\n overallCpuUsage = 2000,\n overallMemoryUsage = 4096,\n}",
          "esxcli --formatter=csv network nic list":"Name,Link Status,Speed,\nvmnic0,Up,1000,",
          "esxcli network nic stats get -n vmnic0":"Bytes received: 1000000\nBytes sent: 2000000"
        };
        stream.write(responses[info.command] ?? "Disabled\n");
        stream.exit(0); stream.end();
      });
    }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as {port:number}).port;
  const target = {...device, capabilities:{esxiSshFingerprint:actualFingerprint}};
  const cred = {username:"monitor",password:"test-only",sudo:false};
  try {
    const config = esxiSshConfig(target,"127.0.0.1",port,cred);
    const first = await withSharedSsh(esxiSshSessionId(target),config,client => esxiExec(client,"vmware -v",1000));
    assert.match(first,/VMware ESXi/);
    assert.equal(await withSharedSsh(esxiSshSessionId(target),config,client => esxiExec(client,"esxcli system maintenanceMode get",1000)), "Disabled\n");
    assert.equal(connections,1);
    const collection=await withSharedSsh(esxiSshSessionId(target),config,client=>collectEsxiSshHost(client,target));
    assert.equal(collection.esxi.version,"8.0.3");
    assert.equal(collection.esxi.cpuPercent,25);
    assert.equal(collection.esxi.memoryPercent,50);
    assert.equal(collection.esxi.interfaceCounters?.[0]?.rxBytes,1000000);
    assert.equal(connections,1); // Entire inventory collection uses the existing authenticated session.
    const wrong = {...device,id:"esxi-wrong-fingerprint"};
    await assert.rejects(withSharedSsh(esxiSshSessionId(wrong),esxiSshConfig(wrong,"127.0.0.1",port,cred),async()=>undefined), /host key does not match/i);
  } finally {
    closeSharedSshSessions();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
}
