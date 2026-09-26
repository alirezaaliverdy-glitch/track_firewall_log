// Deletes only its own synthetic fixtures; never deletes existing user backup/history.
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../dist/db/prisma.js";
import { env } from "../dist/config/env.js";
import { encryptSecret } from "../dist/services/credential-crypto.service.js";
import { BACKUP_SNAPSHOT_TYPE } from "../dist/backups/device-backup.service.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
import { csrfTokenForSession } from "../dist/security/csrf.js";
if(process.env.BACKUP_DELETE_SMOKE !== "true") throw new Error("Explicit BACKUP_DELETE_SMOKE=true required");
const user=await prisma.appUser.findFirst({where:{role:"admin",isActive:true},select:{id:true,username:true}});
if(!user)throw new Error("Admin required");
const device=await prisma.device.findFirst({where:{deletedAt:null,company:{ownerId:user.id,deletedAt:null}},select:{id:true,vendor:true}});
if(!device)throw new Error("Owned device required");
const token=randomBytes(32).toString("base64url");
const session=await prisma.authSession.create({data:{userId:user.id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+300000),userAgent:"backup-deletion-fixture-test"}});
const headers={cookie:"firewall_session="+token,origin:env.corsOrigins[0],"x-csrf-token":csrfTokenForSession(token),"content-type":"application/json"};
const files=[],events=[];
const content=Buffer.from("version 15.2\nhostname isolated-fixture\nend\n");
const metadata={filename:"isolated-fixture.cfg",bytes:content.length,sha256:createHash("sha256").update(content).digest("hex"),actor:user.username,actorName:"Test fixture",contentType:"text/plain"};
async function fixture(){
  const file=await prisma.deviceSnapshot.create({data:{deviceId:device.id,vendor:device.vendor,snapshotType:BACKUP_SNAPSHOT_TYPE,dataJson:{...metadata,encrypted:encryptSecret(content.toString("base64"))}}});
  files.push(file.id);
  const event=await prisma.auditLog.create({data:{deviceId:device.id,actor:user.username,action:"device.backup.create",targetType:"device_backup",targetId:file.id,metadata}});
  events.push(event.id);return{file,event};
}
async function request(path,method,body,expected=200){
  const response=await fetch("http://127.0.0.1:4000/api/backups"+path,{method,headers,body:body?JSON.stringify(body):undefined});
  if(response.status!==expected)throw new Error("Unexpected status "+response.status+" for "+method);
  return response;
}
try{
  const first=await fixture();
  const removed=await(await request("/activity","DELETE",{confirmation:"DELETE BACKUP HISTORY",before:new Date().toISOString(),ids:[first.event.id]})).json();
  if(removed.deletedCount!==1||removed.filesDeleted!==false)throw new Error("History scope failed");
  const downloaded=Buffer.from(await(await request("/"+first.file.id+"/download","GET")).arrayBuffer());
  if(!content.equals(downloaded))throw new Error("History deletion removed or corrupted file");
  const second=await fixture();
  await request("/"+second.file.id,"DELETE",{confirmation:"DELETE BACKUP FILE"});
  await request("/"+second.file.id+"/download","GET",undefined,404);
  if(!await prisma.auditLog.findUnique({where:{id:second.event.id}}))throw new Error("File deletion removed history");
  console.log(JSON.stringify({historyDeletion:true,filePreserved:true,fileDeletion:true,historyPreserved:true,userDataDeleted:false}));
}finally{
  // Exact IDs generated above are the only cleanup targets.
  if(files.length)await prisma.auditLog.deleteMany({where:{OR:[{targetId:{in:files}},{id:{in:events}}]}});
  if(files.length)await prisma.deviceSnapshot.deleteMany({where:{id:{in:files}}});
  await prisma.authSession.deleteMany({where:{id:session.id}});
  await prisma.$disconnect();
}
