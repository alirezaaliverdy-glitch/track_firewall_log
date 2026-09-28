import assert from "node:assert/strict";
import test from "node:test";
import {parseEsxiSshInventory,parseEsxiNicStats,esxiNicStatsCommand,vimBlocks} from "../src/connectors/esxi-ssh.inventory.js";
import {vendorMeasurements} from "../src/services/vendor-metric-samples.service.js";
import {liveVendorProjection} from "../src/services/device-workspace.service.js";

const device={id:"host-test",host:"esxi.example.test"};
const summary=`(vim.host.Summary) {
  hardware = (vim.host.Summary.HardwareSummary) {
    memorySize = 8589934592,
    numCpuCores = 8,
    cpuMhz = 2000,
  },
  quickStats = (vim.host.Summary.QuickStats) {
    overallCpuUsage = 4000,
    overallMemoryUsage = 2048,
  },
}`;
const outputs={identity:"VMware ESXi 7.0.3 build-18644231",summary,
  services:`(vim.host.ServiceInfo) {
    service = (vim.host.Service) [
      (vim.host.Service) {
        key = "ntpd",
        label = "NTP Daemon {time}",
        running = true,
        required = false,
        policy = "on",
      }
    ]
  }`,
  switches:"Name,Num Ports,\nvSwitch0,128,",
  adapters:"HBA Name,Driver,Link State,Description,\nvmhba0,ahci,link-up,Adapter,",
  firewall:"Name,Enabled,\nsshServer,true,\nntpClient,false,",
  dns:"   DNSServers: 192.0.2.53, 192.0.2.54",ntp:"   NTP Servers: ntp.example.test, 192.0.2.123"};

test("SSH host quickstats use MHz and MB capacities, never arbitrary numbers or VM usage",()=>{
  const host=parseEsxiSshInventory(outputs,device);
  assert.equal(host.cpuPercent,25);assert.equal(host.memoryPercent,25);
  assert.equal(host.cpuCores,8);assert.equal(host.memoryBytes,8589934592);
  assert.equal(host.vmCount,null);assert.equal(host.overallStatus,"unknown");
  assert.equal(parseEsxiSshInventory({...outputs,summary:summary.replace("4000","-1")},device).cpuPercent,null);
  assert.equal(parseEsxiSshInventory({...outputs,summary:summary.replace("4000","18000")},device).cpuPercent,null);
  assert.equal(parseEsxiSshInventory({...outputs,summary:summary.replace("cpuMhz = 2000","cpuMhz = 0")},device).cpuPercent,null);
  assert.equal(parseEsxiSshInventory({...outputs,summary:summary.replace("4000","0")},device).cpuPercent,0);
  assert.equal(parseEsxiSshInventory({...outputs,summary:summary.slice(0,-10)},device).cpuPercent,null);
});
test("Host services, DNS/NTP, virtual switches, adapters and firewall preserve real values",()=>{
  const host=parseEsxiSshInventory(outputs,device);
  assert.deepEqual(host.services[0],{key:"ntpd",label:"NTP Daemon {time}",running:true,required:false,policy:"on"});
  assert.equal(host.virtualSwitches[0]?.ports,128);assert.equal(host.storageAdapters[0]?.name,"vmhba0");
  assert.equal(host.firewallRulesets[0]?.enabled,true);assert.equal(host.firewallRulesets[1]?.enabled,false);
  assert.deepEqual(host.dns.servers,["192.0.2.53","192.0.2.54"]);
  assert.deepEqual(host.time.ntpServers,["ntp.example.test","192.0.2.123"]);
  assert.equal(vimBlocks('(vim.host.Service) { label = "escaped \\\" }"\n}',"vim.host.Service").length,1);
  assert.equal(host.coverage?.find(v=>v.key==="maintenance")?.status,"unavailable");
});
test("Optional malformed inventory stays unknown without marking an authenticated host offline",()=>{
  const host=parseEsxiSshInventory({...outputs,datastores:'Type,Size\n"broken'},device);
  assert.equal(host.connectionState,"connected");assert.equal(host.datastoreCount,null);
  assert.equal(host.coverage?.find(v=>v.key==="datastores")?.status,"unavailable");
  assert.equal(parseEsxiSshInventory({...outputs,datastores:"Permission denied"},device).datastoreCount,null);
  const facts=liveVendorProjection("esxi",{esxiStatus:{connected:true,esxi:host,diagnostic:{transport:"ssh"}}},null)?.facts;
  assert.deepEqual(facts?.coverage,host.coverage);
  const network=liveVendorProjection("esxi",{esxiStatus:{connected:true,esxi:{...host,physicalNics:[{name:"vmnic0",linkUp:true,speedMb:1000},{name:"vmnic1",linkUp:null,speedMb:null}]},diagnostic:{transport:"ssh"}}},null)?.facts;
  assert.deepEqual(network?.interfaces,[{name:"vmnic0",operationalStatus:"up",administrativeStatus:"unknown",speed:1000},{name:"vmnic1",operationalStatus:"unknown",administrativeStatus:"unknown",speed:null}]);
});
test("Physical NIC counters are labelled for existing delta-based traffic charts, never fabricated",()=>{
  const host=parseEsxiSshInventory(outputs,device);
  const counter=parseEsxiNicStats("vmnic0","Bytes received: 1000000\nBytes sent: 2000000");
  assert.deepEqual(counter,{name:"vmnic0",rxBytes:1000000,txBytes:2000000});
  assert.equal(parseEsxiNicStats("vmnic0","Bytes received: -1\nBytes sent: 9007199254740993").rxBytes,null);
  assert.equal(parseEsxiNicStats("vmnic0","Bytes sent: 9007199254740993").txBytes,null);
  assert.throws(()=>esxiNicStatsCommand("vmnic0;reboot"),/physical NIC/);
  host.interfaceCounters=[counter,parseEsxiNicStats("vmnic1","")];
  const readings=vendorMeasurements({connected:true,esxi:host} as never);
  assert.equal(readings.find(v=>v.metricKey==="cpu.usage_percent")?.value,25);
  assert.deepEqual(readings.filter(v=>v.metricKey.startsWith("network.")),[
    {metricKey:"network.rx_bytes",value:1000000,unit:"bytes",labels:{interface:"vmnic0"}},
    {metricKey:"network.tx_bytes",value:2000000,unit:"bytes",labels:{interface:"vmnic0"}}
  ]);
  assert.deepEqual(vendorMeasurements({connected:false,esxi:host} as never),[]);
});
