import assert from "node:assert/strict";
import {createServer} from "node:http";
import {networkInterfaces} from "node:os";
import {randomBytes,randomUUID} from "node:crypto";
import test from "node:test";

const content="zPBX+mZObfuhVe4vhQ8KrpI9TWS3G0YmttzPES6uA9VJEhcbMRrgSEfBvPSPsTuQ8ohkQh8/VJ3E7Z+g8gfyNHtH9Qs10/lVtZPjZI+kWAZVw2/GdABapvGDDl/Xsb6lC+jvyEYGIO/+wjPbXtFsYiFC+7IgJnr2d9h4DM4hSrcZDiRkCAWcd923gpcrh8tmk4pvs8RN6D1OMI5jPqqVrHccK6ZopLYQCt13PLPejRfBJd3rMknSGIehRTD7mncytDXXOpFH2ay/hkok9/0zyqVeZJtfQQox0WV71IqvmHm9uiqKRkf8ndxOkCvgqyaPlhd7ViSN/cSoisE7Z+p23g==";
test("native replay resolves real channel in same workspace/company, rechecks tokens and denies viewer export",async()=>{
  process.env.CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString("hex");
  const {prisma,shutdownDatabase}=await import("../src/db/prisma.js"),{encryptSecret}=await import("../src/services/credential-crypto.service.js");
  const {listCameraRecordings,cameraPlaybackClip}=await import("../src/cameras/camera-playback.service.js");
  const host=Object.values(networkInterfaces()).flat().find(v=>v?.family==="IPv4"&&!v.internal)!.address;
  const calls: string[]=[];
  const server=createServer(async(req,res)=>{
    const path=req.url!.split("?")[0];calls.push(`${req.method} ${path}`);
    const data=path==="/CGI/Security/sessionLogin"?{statusValue:200,salt:"fixture",sessionID:"fixture"}
      :path==="/CGI/Security/SelfExt/userCheck"?{statusValue:200,sessionID:"fixture"}
      :path==="/CGI/Custom/version"?{VideoInChannel:0,DigChannel:2}
      :path==="/CGI/NetService/decorder/channels/-1"?{Content:content}
      :path==="/CGI/Network/netcommon"?{TCPPort:34567}
      :path==="/CGI/General/time"?{SystemTime:"2026-10-19 10:00:00"}
      :path==="/CGI/Record/filelist"?[]:path==="/CGI/Security/Lougout"?{statusValue:200}:null;
    if(data===null){res.statusCode=404;res.end();return;}
    for await(const _ of req){/* discard synthetic request body */}
    res.setHeader("content-type","application/json");res.end(JSON.stringify(data));
  });
  await new Promise<void>(resolve=>server.listen(0,"0.0.0.0",resolve));
  const port=(server.address()as{port:number}).port,tag=`taoshi-${randomUUID()}`;
  const owner=await prisma.appUser.create({data:{username:tag,displayName:"Fixture",passwordHash:"no-login",role:"admin"}});
  try{
    const company=await prisma.company.create({data:{ownerId:owner.id,name:tag,code:tag}}),other=await prisma.company.create({data:{ownerId:owner.id,name:tag+"-other",code:tag+"-other"}});
    const connectionEncrypted=encryptSecret(JSON.stringify({username:"fixture",password:"fixture-password"}));
    const recorder=await prisma.cameraDevice.create({data:{ownerId:owner.id,companyId:company.id,host,name:"Synthetic recorder",kind:"nvr",connectionMode:"appweb",onvifPort:port,connectionEncrypted}});
    const camera=await prisma.cameraDevice.create({data:{ownerId:owner.id,companyId:company.id,host:"192.168.1.2",name:"Synthetic camera",connectionMode:"rtsp"}});
    const actor={id:owner.id,username:tag,role:"admin"};
    const inventory=await listCameraRecordings(camera.id,actor);
    assert.equal(inventory.protocol,"taoshi-direct");assert.equal(inventory.recordings.length,1);assert.equal(inventory.recordings[0].token,`taoshi:${recorder.id}:0`);
    assert.equal(inventory.maxClipSeconds,15);
    assert.equal(inventory.verifiedSelectionToken,inventory.recordings[0].token,"verified standalone camera does not depend on live source-token format");
    assert.equal(JSON.stringify(inventory).includes("fixture-password"),false);
    const input={recordingToken:`taoshi:${recorder.id}:1`,start:"2026-10-19T09:00:00.000Z",duration:10};
    await assert.rejects(cameraPlaybackClip(camera.id,input,actor,new AbortController().signal),/CAMERA_RECORDING_NOT_FOUND/);
    await assert.rejects(cameraPlaybackClip(camera.id,input,{...actor,role:"viewer"},new AbortController().signal,true),/CAMERA_CONTROL_FORBIDDEN/);
    await assert.rejects(cameraPlaybackClip(camera.id,{...input,recordingToken:inventory.recordings[0].token,duration:60},actor,new AbortController().signal),/CAMERA_REPLAY_WINDOW_INVALID/);
    await assert.rejects(cameraPlaybackClip(camera.id,{...input,recordingToken:inventory.recordings[0].token},actor,new AbortController().signal),/CAMERA_RECORDING_OUTSIDE_RANGE/);
    await prisma.cameraDevice.update({where:{id:camera.id},data:{companyId:other.id}});
    await assert.rejects(listCameraRecordings(camera.id,actor),/CAMERA_RECORDING_MAPPING_REQUIRED/);
    await assert.rejects(listCameraRecordings(camera.id,{...actor,id:"not-owner"}),/CAMERA_NOT_FOUND/);
    assert.ok(calls.includes("PUT /CGI/Record/filelist"));
    assert.ok(calls.filter(c=>c.startsWith("PUT ")).every(c=>c==="PUT /CGI/Record/filelist"));
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.appUser.delete({where:{id:owner.id}});await shutdownDatabase();}
});
