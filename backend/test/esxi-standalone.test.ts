import assert from "node:assert/strict";
import test from "node:test";
import { parseSoap, EsxiSoapError, esxiCertificate } from "../src/connectors/esxi-soap.transport.js";
import { readEsxiInventory } from "../src/connectors/esxi-inventory.js";
import { esxiSoapConnector, validateEsxiHostChange } from "../src/connectors/esxi-soap.connector.js";
import { vendorMeasurements } from "../src/services/vendor-metric-samples.service.js";
import { COMMAND_CATALOG } from "../src/commands/catalog/index.js";
import type { Device } from "@prisma/client";

const envelope=(content:string)=>`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${content}</soap:Body></soap:Envelope>`;
test("ESXi SOAP parser handles namespaces and rejects DTD, faults and oversized XML",()=>{
  const body=parseSoap(envelope('<RetrieveServiceContentResponse xmlns="urn:vim25"><returnval><about><apiType>HostAgent</apiType></about></returnval></RetrieveServiceContentResponse>'));
  assert.equal(body.children[0]?.name,"RetrieveServiceContentResponse");
  assert.throws(()=>parseSoap('<!DOCTYPE foo>'+envelope("<x/>")),(e:unknown)=>e instanceof EsxiSoapError);
  assert.throws(()=>parseSoap(envelope("<soap:Fault><faultstring>bad</faultstring></soap:Fault>")),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_SOAP_FAULT");
  assert.throws(()=>parseSoap(envelope("x".repeat(4*1024*1024))),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_RESPONSE_TOO_LARGE");
});

test("ESXi certificate input never accepts a private key or invalid PEM",()=>{
  const device={capabilities:{esxiCaCertificate:"-----BEGIN PRIVATE KEY-----\naGVsbG8=\n-----END PRIVATE KEY-----"}} as unknown as Device;
  assert.throws(()=>esxiCertificate(device),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_CA_INVALID");
});

test("ESXi actions are explicit catalog entries and not raw command execution",()=>{
  for(const id of ["esxi.inventory","esxi.enter-maintenance","esxi.exit-maintenance","esxi.start-service","esxi.stop-service","esxi.set-ntp"]){
    const entry=COMMAND_CATALOG.find(item=>item.id===id);
    assert.equal(entry?.supportState,"verified",id);
    assert.equal(entry?.connectorType,"esxi-soap");
  }
  assert.equal(COMMAND_CATALOG.find(item=>item.id==="esxi.stop-service")?.riskLevel,"critical");
  assert.equal(COMMAND_CATALOG.some(item=>item.id.startsWith("esxi.")&&item.id.includes("vm")),false);
  const device={vendor:"esxi",protocol:"api"} as Device;
  assert.equal(esxiSoapConnector.supports(device),true);
  assert.equal(esxiSoapConnector.supports({...device,protocol:"ssh"}),false);
});

test("ESXi inventory extracts host, VM and datastore metrics from typed API properties",async()=>{
  const val=(text="",children:unknown[]=[])=>( {name:"val",text,attributes:{},children} );
  const node=(name:string,text="",attrs:Record<string,string>={},children:unknown[]=[])=>( {name,text,attributes:attrs,children} );
  const property=(name:string,data:ReturnType<typeof val>)=>new Map([[name,data]]);
  const props=new Map<string,Map<string,ReturnType<typeof val>>>();
  props.set("group-d1",property("childEntity",val("",[node("ManagedObjectReference","datacenter-1",{type:"Datacenter"})])));
  props.set("datacenter-1",property("hostFolder",val("group-h1",[],)));
  props.get("datacenter-1")!.set("hostFolder",node("val","group-h1",{type:"Folder"}));
  props.set("group-h1",property("childEntity",val("",[node("ManagedObjectReference","domain-c1",{type:"ComputeResource"})])));
  props.set("domain-c1",property("host",val("",[node("ManagedObjectReference","host-1",{type:"HostSystem"})])));
  props.set("host-1",new Map([
    ["summary",val("",[
      node("hardware","",{},[node("vendor","VMware"),node("model","Test Host"),node("cpuMhz","2000"),node("numCpuCores","4"),node("memorySize","8589934592")]),
      node("quickStats","",{},[node("overallCpuUsage","2000"),node("overallMemoryUsage","4096")]),
      node("config","",{},[node("name","esxi-test")]),node("overallStatus","green")
    ])],
    ["runtime",val("",[node("connectionState","connected"),node("inMaintenanceMode","false")])],
    ["vm",val("",[node("ManagedObjectReference","vm-1",{type:"VirtualMachine"})])],
    ["datastore",val("",[node("ManagedObjectReference","datastore-1",{type:"Datastore"})])],
    ["network",val()]
  ]));
  props.set("vm-1",property("summary",val("",[node("config","",{},[node("name","web-01"),node("numCpu","2"),node("memorySizeMB","2048")]),node("runtime","",{},[node("powerState","poweredOn")])])));
  props.set("datastore-1",property("summary",val("",[node("name","datastore1"),node("capacity","1000"),node("freeSpace","400"),node("accessible","true")])));
  const client={properties:async (_type:string,ids:string[])=>new Map(ids.map(id=>[id,props.get(id)??new Map()]))};
  const content=node("returnval","",{},[node("rootFolder","group-d1"),node("about","",{},[node("version","8.0"),node("build","1234")])]);
  const inventory=await readEsxiInventory(client as never,content as never,{name:"fallback"} as Device);
  assert.equal(inventory.hostId,"host-1");
  assert.equal(inventory.hostname,"esxi-test");
  assert.equal(inventory.version,"8.0");
  assert.equal(inventory.cpuPercent,25);
  assert.equal(inventory.memoryPercent,50);
  assert.equal(inventory.vms[0]?.name,"web-01");
  assert.equal(inventory.vms[0]?.powerState,"poweredOn");
  assert.equal(inventory.datastores[0]?.freeBytes,400);
  assert.throws(()=>validateEsxiHostChange(inventory,"enter-maintenance",""),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_VM_RUNNING");
  const idle={...inventory,vms:[{...inventory.vms[0]!,powerState:"poweredOff"}],services:[{key:"hostd",label:"Host daemon",running:true,policy:"on",required:true}],serviceSystemId:"serviceSystem"};
  assert.doesNotThrow(()=>validateEsxiHostChange(idle,"enter-maintenance",""));
  assert.throws(()=>validateEsxiHostChange(idle,"stop-service","hostd"),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_SERVICE_PROTECTED");
  assert.throws(()=>validateEsxiHostChange({...idle,vmsTruncated:true},"enter-maintenance",""),(e:unknown)=>e instanceof EsxiSoapError&&e.code==="ESXI_VM_RUNNING");
  const metrics=vendorMeasurements({connected:true,esxi:inventory} as never);
  assert.equal(metrics.find(item=>item.metricKey==="datastore.usage_percent")?.value,60);
});
