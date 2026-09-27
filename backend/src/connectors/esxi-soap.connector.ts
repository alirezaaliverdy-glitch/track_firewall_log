import { ActionType, DeviceProtocol, type ActionPlan, type Device } from "@prisma/client";
import type { ConnectorDryRun, ConnectorExecutionResult, DeviceCapabilities, DeviceConnectionTestResult, DeviceConnector } from "./types.js";
import { collectEsxiInventory, readEsxiInventory, type EsxiDiscovery } from "./esxi-inventory.js";
import { EsxiSoapClient, EsxiSoapError, field, xmlEscape } from "./esxi-soap.transport.js";

type Operation = "inventory"|"enter-maintenance"|"exit-maintenance"|"start-service"|"stop-service"|"set-ntp";
const ACTION=ActionType.generic_security_action;
const operations:Record<string,Operation>={
  "esxi.inventory":"inventory","esxi.enter-maintenance":"enter-maintenance","esxi.exit-maintenance":"exit-maintenance",
  "esxi.start-service":"start-service","esxi.stop-service":"stop-service","esxi.set-ntp":"set-ntp",
  esxi_inventory:"inventory",esxi_enter_maintenance:"enter-maintenance",esxi_exit_maintenance:"exit-maintenance",
  esxi_start_service:"start-service",esxi_stop_service:"stop-service",esxi_set_ntp:"set-ntp"
};
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function intent(plan:ActionPlan) {
  const parameters=record(plan.parametersJson),metadata=record(parameters.metadata);
  const operation=operations[String(metadata.catalogCommandId??metadata.executionTemplateRef??"")];
  if(!operation) throw new EsxiSoapError("ESXI_OPERATION_NOT_REGISTERED","Only registered host operations can execute.");
  const params={...record(parameters.params),...record(parameters.parameters),...record(metadata.normalizedParams)};
  const serviceKey=String(params.serviceKey??"").trim();
  if(["start-service","stop-service"].includes(operation)&&!/^[A-Za-z0-9_.-]{1,80}$/.test(serviceKey))
    throw new EsxiSoapError("ESXI_SERVICE_KEY_INVALID","Choose a discovered ESXi service.");
  const ntpServers=String(params.ntpServers??"").split(",").map(v=>v.trim()).filter(Boolean);
  if(operation==="set-ntp"&&(ntpServers.length<1||ntpServers.length>4||ntpServers.some(v=>v.length>253||!/^[A-Za-z0-9.:_-]+$/.test(v))))
    throw new EsxiSoapError("ESXI_NTP_INVALID","Provide one to four valid NTP addresses.");
  return {operation,serviceKey,ntpServers};
}
export function validateEsxiHostChange(snapshot:EsxiDiscovery,operation:Operation,serviceKey:string) {
  if(operation==="enter-maintenance") {
    if(snapshot.maintenanceMode) throw new EsxiSoapError("ESXI_ALREADY_IN_MAINTENANCE","Host is already in maintenance mode.");
    if(snapshot.vmsTruncated||snapshot.vms.some(vm=>vm.powerState!=="poweredOff"&&vm.powerState!=="suspended"))
      throw new EsxiSoapError("ESXI_VM_RUNNING","Power off or migrate all VMs outside this application before entering maintenance mode.");
  }
  if(operation==="exit-maintenance"&&!snapshot.maintenanceMode)
    throw new EsxiSoapError("ESXI_NOT_IN_MAINTENANCE","Host is not in maintenance mode.");
  if(operation==="start-service"||operation==="stop-service") {
    const service=snapshot.services.find(item=>item.key===serviceKey);
    if(!service) throw new EsxiSoapError("ESXI_SERVICE_NOT_FOUND","Service is not in fresh host inventory.");
    if(operation==="stop-service"&&(service.required!==false||["hostd","vpxa","rhttpproxy","dcui","TSM","TSM-SSH"].includes(serviceKey)))
      throw new EsxiSoapError("ESXI_SERVICE_PROTECTED","Stopping a required or management service is blocked.");
    if(service.running===(operation==="start-service")) throw new EsxiSoapError("ESXI_SERVICE_STATE_CHANGED","Service already has the requested state.");
  }
  if(["start-service","stop-service"].includes(operation)&&!snapshot.serviceSystemId)
    throw new EsxiSoapError("ESXI_SERVICE_SYSTEM_MISSING","Host service manager is unavailable.");
  if(operation==="set-ntp"&&!snapshot.dateTimeSystemId)
    throw new EsxiSoapError("ESXI_TIME_SYSTEM_MISSING","Host time manager is unavailable.");
}
async function test(device:Device):Promise<DeviceConnectionTestResult> {
  try {
    const esxi=await collectEsxiInventory(device);
    return {connected:true,deviceId:device.id,vendor:"esxi",host:device.host,port:device.managementPort,
      hostname:esxi.hostname,os:`ESXi ${esxi.version}`,esxi,
      stages:[{name:"resolve_device",status:"ok"},{name:"resolve_credential",status:"ok"},{name:"tcp_connect",status:"ok"},{name:"platform_detection",status:"ok"},{name:"readonly_discovery",status:"ok"}],
      warnings:esxi.vmsTruncated?[{code:"ESXI_VM_LIST_TRUNCATED",message:"Only the first 100 VMs are listed; host maintenance is blocked until the full VM state is known."}]:[],
      capabilities:{canConnect:true,canRunBasicReadOnly:true,canReadSystem:true,canExecuteWriteActions:true},
      message:"Authenticated host inventory collected."};
  } catch(error) {
    const failure=error instanceof EsxiSoapError?error:new EsxiSoapError("ESXI_DISCOVERY_FAILED","ESXi inventory could not be collected.");
    return {connected:false,deviceId:device.id,vendor:"esxi",host:device.host,port:device.managementPort,
      stages:[{name:"resolve_device",status:"ok"},{name:"readonly_discovery",status:"failed",code:failure.code,message:failure.message}],
      warnings:[],capabilities:{canConnect:false,canRunBasicReadOnly:false,canExecuteWriteActions:false},
      errorCode:failure.code,message:failure.message};
  }
}
async function waitTask(client:EsxiSoapClient,id:string) {
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new EsxiSoapError("ESXI_TASK_INVALID","Invalid task reference.");
  for(let attempt=0;attempt<60;attempt++) {
    const task=(await client.properties("Task",[id],["info"])).get(id)?.get("info");
    const state=field(task,"state");
    if(state==="success") return;
    if(state==="error") throw new EsxiSoapError("ESXI_TASK_FAILED","ESXi reported host task failure.");
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new EsxiSoapError("ESXI_TASK_PENDING","Task still pending; inspect host state before retry.");
}

export const esxiSoapConnector:DeviceConnector={
  name:"esxi",supportedActions:[ACTION],
  supports(device) {return Boolean(device&&device.vendor.toLowerCase()==="esxi"&&device.protocol===DeviceProtocol.api);},
  testConnection:test,collectStatus:test,
  async getCapabilities():Promise<DeviceCapabilities> {return {canTestConnection:true,canCollectStatus:true,canReadSystem:true,canExecuteWriteActions:true,canExecuteChangeSshPort:false,supportedActions:[ACTION]};},
  async dryRun(plan,device):Promise<ConnectorDryRun> {
    const {operation,serviceKey,ntpServers}=intent(plan);
    const snapshot=await collectEsxiInventory(device);
    validateEsxiHostChange(snapshot,operation,serviceKey);
    const label=operation.replace(/-/g," ");
    return {plannedCommands:[`ESXi host ${label}${serviceKey?" "+serviceKey:""}${ntpServers.length?" "+ntpServers.join(", "):""}`],
      validationWarnings:operation==="enter-maintenance"?["Standalone ESXi does not automatically migrate or shut down VMs. Management connectivity may be interrupted."]:[],
      affectedPorts:[],affectedServices:serviceKey?[serviceKey]:[],rollbackSteps:operation==="inventory"?[]:["No automatic rollback; verify host state and create a separate reviewed operation."],
      riskLevel:plan.riskLevel,requiresApproval:true,
      commandSpecs:[{template:`esxi_${operation.replace(/-/g,"_")}`,command:`SOAP ${label}`,write:operation!=="inventory",target:{hostId:snapshot.hostId,serviceKey,ntpServers,maintenanceMode:snapshot.maintenanceMode}}],
      exactTarget:{deviceId:device.id,hostId:snapshot.hostId,serviceKey,ntpServers,maintenanceMode:snapshot.maintenanceMode}};
  },
  async execute(plan,device,audit):Promise<ConnectorExecutionResult> {
    const {operation,serviceKey,ntpServers}=intent(plan);
    const {client,content}=await EsxiSoapClient.connect(device);
    try {
      const before=await readEsxiInventory(client,content,device);
      validateEsxiHostChange(before,operation,serviceKey);
      if(operation==="inventory") return {executed:true,actionType:ACTION,deviceId:device.id,
        commands:[{template:"esxi_inventory",stdout:JSON.stringify(before),stderr:"",exitCode:0}],warnings:[],
        rollbackJson:{available:false,verification:{ok:true,summary:"Fresh host inventory collected",evidenceCount:1}}};
      await audit?.("esxi.host.operation.started","ESXi host operation started.",{deviceId:device.id,hostId:before.hostId,operation,serviceKey});
      let response;
      if(operation==="enter-maintenance") {
        response=await client.call("EnterMaintenanceMode_Task",`<_this type="HostSystem">${xmlEscape(before.hostId)}</_this><timeout>60</timeout>`);
        await waitTask(client,field(response,"returnval"));
      } else if(operation==="exit-maintenance") {
        response=await client.call("ExitMaintenanceMode_Task",`<_this type="HostSystem">${xmlEscape(before.hostId)}</_this><timeout>60</timeout>`);
        await waitTask(client,field(response,"returnval"));
      } else if(operation==="start-service"||operation==="stop-service") {
        response=await client.call(operation==="start-service"?"StartService":"StopService",
          `<_this type="HostServiceSystem">${xmlEscape(before.serviceSystemId!)}</_this><id>${xmlEscape(serviceKey)}</id>`);
      } else {
        response=await client.call("UpdateDateTimeConfig",
          `<_this type="HostDateTimeSystem">${xmlEscape(before.dateTimeSystemId!)}</_this><config><ntpConfig>${ntpServers.map(v=>`<server>${xmlEscape(v)}</server>`).join("")}</ntpConfig></config>`);
      }
      const after=await readEsxiInventory(client,content,device);
      const ok=operation==="enter-maintenance"?after.maintenanceMode===true:
        operation==="exit-maintenance"?after.maintenanceMode===false:
        operation==="start-service"?after.services.find(v=>v.key===serviceKey)?.running===true:
        operation==="stop-service"?after.services.find(v=>v.key===serviceKey)?.running===false:
        ntpServers.join(",")===after.time.ntpServers.join(",");
      if(!ok) throw new EsxiSoapError("ESXI_VERIFY_FAILED","Host did not report the expected state after the operation.");
      await audit?.("esxi.host.operation.completed","ESXi host operation verified.",{deviceId:device.id,hostId:before.hostId,operation,serviceKey});
      return {executed:true,actionType:ACTION,deviceId:device.id,
        commands:[{template:`esxi_${operation.replace(/-/g,"_")}`,stdout:JSON.stringify({hostId:before.hostId,operation,serviceKey,verified:true}),stderr:"",exitCode:0}],
        warnings:[],rollbackJson:{available:false,reason:"Host changes require a separately approved reverse action.",verification:{ok:true,summary:`Host ${operation} verified`,evidenceCount:2}}};
    } finally {client.close();}
  },
  async rollback(_plan,device):Promise<ConnectorExecutionResult> {
    return {executed:false,actionType:ACTION,deviceId:device.id,commands:[],warnings:["No automatic rollback for ESXi host changes."],rollbackJson:{available:false}};
  }
};
