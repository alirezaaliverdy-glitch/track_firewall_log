import { DeviceProtocol, type Device } from "@prisma/client";
import type { Client } from "ssh2";
import type { DeviceConnectionTestResult, DeviceConnector } from "./types.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import { SharedSshConnectionError, withSharedSsh } from "../services/shared-ssh-session.service.js";
import { EsxiSoapError } from "./esxi-soap.transport.js";
import { esxiExec, esxiSshConfig, esxiSshSessionId } from "./esxi-ssh.transport.js";
import { ESXI_SSH_READ_COMMANDS, esxiNicStatsCommand, parseEsxiNicStats, parseEsxiSshInventory, type EsxiSshOutputs } from "./esxi-ssh.inventory.js";

export async function collectEsxiSshHost(client:Client,device:Pick<Device,"id"|"host">) {
  const outputs:EsxiSshOutputs={};
  const deadline=Date.now()+30_000;
  for(const [key,command] of Object.entries(ESXI_SSH_READ_COMMANDS)) {
    const name=key as keyof EsxiSshOutputs;
    if(Date.now()>=deadline) break;
    try {
      outputs[name]=await esxiExec(client,command,Math.min(5_000,deadline-Date.now()));
      if(name==="identity") parseEsxiSshInventory(outputs,device);
    } catch(error) { if(name==="identity") throw error; }
  }
  const esxi=parseEsxiSshInventory(outputs,device);
  const nics=esxi.physicalNics.filter(item=>/^vmnic\d{1,4}$/.test(item.name)).slice(0,16);
  for(const nic of nics) {
    if(Date.now()>=deadline) break;
    try { esxi.interfaceCounters!.push(parseEsxiNicStats(nic.name,await esxiExec(client,esxiNicStatsCommand(nic.name),Math.min(3_000,deadline-Date.now())))); }
    catch { /* Missing traffic remains unknown, never zero. */ }
  }
  const trafficComplete=esxi.physicalNics.length>0 && esxi.interfaceCounters!.length===esxi.physicalNics.length && esxi.interfaceCounters!.every(item=>item.rxBytes!==null && item.txBytes!==null);
  esxi.coverage!.push({key:"traffic",status:trafficComplete?"available":"unavailable"});
  const warnings=[{code:"ESXI_SSH_READONLY",message:"SSH provides read-only host monitoring. Reviewed host changes and complete hardware health require the API connection."},
    ...esxi.coverage!.filter(item=>item.status==="unavailable").map(item=>({code:"ESXI_SSH_PARTIAL_INVENTORY",message:`Host field ${item.key} is unavailable; check ESXi version and account permissions.`}))];
  return {esxi,warnings};
}

export async function testEsxiSsh(device: Device): Promise<DeviceConnectionTestResult> {
  try {
    const credential = device.credentialId ? await resolveCredentialById(device.credentialId)
      : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
    if (!credential) throw new EsxiSoapError("ESXI_SSH_CREDENTIAL_REQUIRED", "Select a stored SSH credential.");
    const config = esxiSshConfig(device, device.host, device.managementPort, credential);
    return await withSharedSsh(esxiSshSessionId(device), config, async client => {
      const {esxi,warnings}=await collectEsxiSshHost(client,device);
      return {
        connected: true, deviceId: device.id, vendor: "esxi", host: device.host, port: device.managementPort,
        credentialResolved: true, hostname: esxi.hostname, os: `ESXi ${esxi.version}`, esxi, diagnostic: {transport: "ssh"},
        stages: [{name: "resolve_credential", status: "ok"}, {name: "ssh_auth", status: "ok"},
          {name: "platform_detection", status: "ok"}, {name: "readonly_discovery", status: warnings.length > 1 ? "warning" : "ok"}],
        warnings, capabilities: {canConnect: true, canRunBasicReadOnly: true, canReadSystem: true, canExecuteWriteActions: false},
        message: "Verified ESXi SSH identity and read-only host inventory collected."
      };
    });
  } catch (error) {
    const code = error instanceof EsxiSoapError || error instanceof SharedSshConnectionError ? error.code : "ESXI_SSH_DISCOVERY_FAILED";
    const message = error instanceof EsxiSoapError || error instanceof SharedSshConnectionError ? error.message : "ESXi SSH inventory could not be collected.";
    return {connected: false, deviceId: device.id, vendor: "esxi", host: device.host, port: device.managementPort,
      stages: [{name: "readonly_discovery", status: "failed", code, message}], warnings: [],
      capabilities: {canConnect: false, canExecuteWriteActions: false}, errorCode: code, message};
  }
}
export const esxiSshConnector: DeviceConnector = {
  name: "esxi", supportedActions: [],
  supports: device => Boolean(device?.vendor.toLowerCase() === "esxi" && device.protocol === DeviceProtocol.ssh),
  testConnection: testEsxiSsh, collectStatus: testEsxiSsh,
  async getCapabilities() {
    return {canTestConnection: true, canCollectStatus: true, canReadSystem: true,
      canExecuteWriteActions: false, canExecuteChangeSshPort: false, supportedActions: []};
  },
  async dryRun() { throw new EsxiSoapError("ESXI_SSH_READONLY", "Host changes are not registered for SSH; use the ESXi API connection."); },
  async execute() { throw new EsxiSoapError("ESXI_SSH_READONLY", "Host changes are not registered for SSH; use the ESXi API connection."); },
  async rollback() { throw new EsxiSoapError("ESXI_SSH_READONLY", "No SSH host changes or rollback are available."); }
};
