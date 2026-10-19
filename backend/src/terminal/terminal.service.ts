import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Client, type ConnectConfig } from "ssh2";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getDeviceById } from "../services/device.service.js";
import { resolveCredentialById } from "../services/credential.service.js";
import { getSessionUser, hashSessionToken, type PublicUser } from "../services/auth.service.js";
import { interactiveTerminalPolicy } from "../services/policy-guard.service.js";
import { sshHostKeySha256Fingerprint } from "../security/ssh-host-key-trust.js";
import { assertVpnTarget } from "../vpn/vpn.service.js";
import { TerminalError, TerminalRuntime, terminalSize, terminalSshError, type TerminalOwner } from "./terminal-runtime.js";

export type TerminalActor = { user: PublicUser; token: string };
const previews = new Map<string,{owner:TerminalOwner;deviceId:string;revision:string;fingerprint:string;address:string;expires:number}>();
const preparing = new Set<string>();
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
function actor(value:TerminalActor):TerminalOwner {
  if(value.user.role!=="admin" || !value.token)throw new TerminalError("TERMINAL_ADMIN_REQUIRED",403);
  return {userId:value.user.id,ownerId:value.user.scopeOwnerId??value.user.id,sessionHash:hashSessionToken(value.token)};
}
async function audit(owner:TerminalOwner,deviceId:string,id:string,action:string,metadata:Record<string,string|number|boolean>){
  await prisma.auditLog.create({data:{actor:owner.userId,deviceId,action,targetType:"terminal_session",targetId:id,dryRun:false,approvalStatus:"approved",metadata:{...metadata,ownerId:owner.ownerId,source:"human_interactive"}}});
}
const runtime = new TerminalRuntime(async s=>{
  // No command text, terminal output, account secrets or session token in audit.
  for(let attempt=0;attempt<3;attempt++){
    try{await audit(s,s.deviceId,s.id,"terminal.session_closed",{reason:s.reason,inputBytes:s.inputBytes,outputBytes:s.outputBytes,durationMs:s.durationMs});return;}
    catch{if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}
  }
});
export const INTERACTIVE_SSH_TEMPLATE = { id:"interactive_ssh_session",status:"implemented",source:"human_interactive",planner:target,connector:runtime.open.bind(runtime) } as const;

async function target(deviceId:string,who:TerminalActor){
  const owner=actor(who), device=await getDeviceById(deviceId,owner.ownerId);
  if(!device)throw new TerminalError("TERMINAL_DEVICE_NOT_FOUND",404);
  const caps=object(device.capabilities), inventory=object(caps.inventory);
  if(caps.inventoryStatus==="archived"||inventory.status==="archived"||inventory.removedAt)throw new TerminalError("TERMINAL_DEVICE_NOT_FOUND",404);
  // Use the configured SSH channel, never reinterpret an API or ONVIF port.
  const secondary=device.protocol==="ssh"?null:await prisma.deviceConnectionChannel.findFirst({where:{deviceId:device.id,method:"ssh",enabled:true},orderBy:{priority:"asc"}});
  const supported=device.protocol==="ssh"||!!secondary;
  const credentialId=secondary?.credentialId??device.credentialId;
  const credential=credentialId?await prisma.deviceCredential.findUnique({where:{id:credentialId},select:{id:true,username:true,updatedAt:true}}):device.credentialRef?await prisma.deviceCredential.findUnique({where:{name:device.credentialRef},select:{id:true,username:true,updatedAt:true}}):null;
  const host=secondary?.host??device.host,port=secondary?.port??device.managementPort;
  const fingerprint=String(caps.esxiSshFingerprint??caps.terminalSshFingerprint??"").trim();
  const revision=createHash("sha256").update(JSON.stringify({id:device.id,company:device.companyId,host,port,protocol:device.protocol,channel:secondary?{id:secondary.id,enabled:secondary.enabled,credentialId:secondary.credentialId}:null,credential:credential?{id:credential.id,updatedAt:credential.updatedAt}:null,vpn:device.vpnConnectionId,fingerprint})).digest("hex");
  return {device,owner,caps,supported,credential,host,port,fingerprint,revision};
}
export async function terminalMetadata(deviceId:string,who:TerminalActor){
  const t=await target(deviceId,who);
  return {device:{id:t.device.id,name:t.device.name,vendor:t.device.vendor,host:t.host,port:t.port,company:t.device.company?.name??null,environment:t.device.environment,vpnConnectionId:t.device.vpnConnectionId},supported:t.supported,credentialsConfigured:!!t.credential,username:t.credential?.username??null,trustedFingerprint:t.fingerprint||null,templateId:INTERACTIVE_SSH_TEMPLATE.id};
}
function requireReady(t:Awaited<ReturnType<typeof target>>){if(!t.supported)throw new TerminalError("TERMINAL_SSH_NOT_CONFIGURED",400);if(!t.credential)throw new TerminalError("SSH_CREDENTIAL_MISSING",400);}
async function addressFor(host:string){try{return isIP(host)?host:(await lookup(host)).address;}catch{throw new TerminalError("SSH_DNS_FAILED",502);}}
async function fingerprintFor(config:ConnectConfig){
  return new Promise<string>((resolve,reject)=>{
    const client=new Client();let fingerprint="",done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);client.destroy();fingerprint?resolve(fingerprint):reject(new TerminalError("SSH_CONNECTION_FAILED",502));};
    const timer=setTimeout(()=>{if(done)return;done=true;client.destroy();reject(new TerminalError("SSH_HANDSHAKE_TIMEOUT",504));},12_000);timer.unref();
    client.on("error",error=>{if(done)return;if(fingerprint)return finish();done=true;clearTimeout(timer);client.destroy();reject(new TerminalError(terminalSshError(error),502));});client.on("close",finish);
    // Stop before authentication; no password is supplied to the key probe.
    try{client.connect({...config,readyTimeout:10_000,hostVerifier:(key:Buffer)=>{fingerprint=sshHostKeySha256Fingerprint(key);queueMicrotask(finish);return false;}});}catch{finish();}
  });
}
export async function prepareTerminal(deviceId:string,who:TerminalActor){
  const t=await target(deviceId,who);requireReady(t);
  for(const[id,p]of previews)if(p.expires<Date.now())previews.delete(id);
  if(previews.size>=64)throw new TerminalError("TERMINAL_SESSION_LIMIT",429);
  const lock=t.owner.sessionHash;
  if(preparing.size>=8||preparing.has(lock))throw new TerminalError("TERMINAL_SESSION_LIMIT",429);
  preparing.add(lock);
  try{
  await assertVpnTarget(t.device.vpnConnectionId,t.host,t.owner.ownerId,!!t.device.vpnConnectionId);
  const address=await addressFor(t.host);
  const fingerprint=await fingerprintFor({host:address,port:t.port,username:t.credential!.username,...(t.caps.esxiSshFingerprint?{algorithms:{serverHostKey:["rsa-sha2-512","rsa-sha2-256"]}}:{})});
  if(t.fingerprint && t.fingerprint!==fingerprint)throw new TerminalError("SSH_HOST_KEY_MISMATCH",409);
  const previewId=randomUUID(),expires=Date.now()+120_000;
  if(previews.size>=64)throw new TerminalError("TERMINAL_SESSION_LIMIT",429);
  previews.set(previewId,{owner:t.owner,deviceId,revision:t.revision,fingerprint,address,expires});
  return {previewId,fingerprint,firstTrust:!t.fingerprint,expiresAt:new Date(expires).toISOString(),...(await terminalMetadata(deviceId,who))};
  }finally{preparing.delete(lock);}
}
export async function openTerminal(deviceId:string,who:TerminalActor,input:Record<string,unknown>){
  const t=await target(deviceId,who);requireReady(t);
  const reason=interactiveTerminalPolicy({role:who.user.role,deviceId,source:INTERACTIVE_SSH_TEMPLATE.source,template:INTERACTIVE_SSH_TEMPLATE.id,implemented:INTERACTIVE_SSH_TEMPLATE.status==="implemented",intent:input.intent,confirmed:input.confirmed});
  if(reason)throw new TerminalError(reason,400);
  const size=terminalSize(input.cols,input.rows),p=previews.get(String(input.previewId));
  if(!p||p.expires<Date.now()||p.deviceId!==deviceId||p.owner.userId!==t.owner.userId||p.owner.sessionHash!==t.owner.sessionHash||p.owner.ownerId!==t.owner.ownerId||p.revision!==t.revision)throw new TerminalError("TERMINAL_PREVIEW_EXPIRED",409);
  previews.delete(String(input.previewId));
  await assertVpnTarget(t.device.vpnConnectionId,t.host,t.owner.ownerId,!!t.device.vpnConnectionId);
  const credential=await resolveCredentialById(t.credential!.id);
  if(!credential || (!credential.password&&!credential.privateKey))throw new TerminalError("SSH_CREDENTIAL_MISSING",400);
  const config:ConnectConfig={host:p.address,port:t.port,username:credential.username,password:credential.password,privateKey:credential.privateKey,passphrase:credential.passphrase,tryKeyboard:!!credential.password,readyTimeout:15_000,hostVerifier:(key:Buffer)=>sshHostKeySha256Fingerprint(key)===p.fingerprint,...(t.caps.esxiSshFingerprint?{algorithms:{serverHostKey:["rsa-sha2-512","rsa-sha2-256"]}}:{})};
  const session=await INTERACTIVE_SSH_TEMPLATE.connector({...t.owner,deviceId,revision:t.revision,fingerprint:p.fingerprint},config,size,id=>audit(t.owner,deviceId,id,"terminal.session_requested",{connectorInvoked:false,templateId:INTERACTIVE_SSH_TEMPLATE.id}));
  try{
    // Recheck configuration/ownership after the handshake before releasing a live shell.
    const user=await getSessionUser(who.token);
    if(!user||user.id!==who.user.id||user.role!=="admin"||(user.scopeOwnerId??user.id)!==t.owner.ownerId)throw new TerminalError("TERMINAL_ADMIN_REQUIRED",403);
    const current=await target(deviceId,who);if(current.revision!==t.revision)throw new TerminalError("TERMINAL_CONFIGURATION_CHANGED");
    if(!t.fingerprint){
      const changed=await prisma.device.updateMany({where:{id:deviceId,capabilities:{equals:t.device.capabilities??Prisma.DbNull}},data:{capabilities:{...t.caps,terminalSshFingerprint:p.fingerprint}}});
      if(changed.count!==1)throw new TerminalError("TERMINAL_CONFIGURATION_CHANGED");
    }
    const fresh=await target(deviceId,who);runtime.owned(session.id,t.owner).revision=fresh.revision;
    await audit(t.owner,deviceId,session.id,"terminal.session_connected",{connectorInvoked:true,templateId:INTERACTIVE_SSH_TEMPLATE.id});
    return session;
  }catch{runtime.close(session.id,t.owner,"authorization_changed");throw new TerminalError("TERMINAL_CONFIGURATION_CHANGED");}
}
async function checked(id:string,who:TerminalActor){
  const owner=actor(who),s=runtime.owned(id,owner);
  if(s.state==="closed")return owner;
  try{const t=await target(s.deviceId,who);if(t.revision!==s.revision)throw new TerminalError("TERMINAL_CONFIGURATION_CHANGED");await assertVpnTarget(t.device.vpnConnectionId,t.host,owner.ownerId,!!t.device.vpnConnectionId);}
  catch{runtime.close(id,owner,"authorization_changed");throw new TerminalError("TERMINAL_CONFIGURATION_CHANGED");}
  return owner;
}
export async function readTerminal(id:string,who:TerminalActor,cursor:number){return runtime.read(id,await checked(id,who),cursor);}
export async function inputTerminal(id:string,who:TerminalActor,sequence:number,data:string){return runtime.input(id,await checked(id,who),sequence,data);}
export async function resizeTerminal(id:string,who:TerminalActor,cols:number,rows:number){return runtime.resize(id,await checked(id,who),cols,rows);}
export function closeTerminal(id:string,who:TerminalActor){return runtime.close(id,actor(who));}
export function stopTerminals(){previews.clear();return runtime.shutdown();}
