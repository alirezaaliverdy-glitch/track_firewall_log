// Explicit local read-only probe. Only aggregate frame metadata is emitted; no footage or credentials.
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
for(const entry of readFileSync('/proc/1/environ','utf8').split('\0')){const i=entry.indexOf('=');if(['DATABASE_URL','CREDENTIAL_ENCRYPTION_KEY'].includes(entry.slice(0,i)))process.env[entry.slice(0,i)]=entry.slice(i+1);}
process.env.LOG_LEVEL='silent';
const {prisma,shutdownDatabase}=await import('file:///app/dist/db/prisma.js');
const {cameraConnection}=await import('file:///app/dist/cameras/camera.service.js');
const {listCameraRecordings}=await import('file:///app/dist/cameras/camera-playback.service.js');
const {taoshiInventory,taoshiWallTime,taoshiFrameParser,taoshiCodec}=await import('file:///app/dist/cameras/nvr-taoshi.js');
let child;
try{
 const camera=await prisma.cameraDevice.findFirst({where:{kind:'camera',host:process.argv[2]}});assert.ok(camera);
 const actor=await prisma.appUser.findUnique({where:{id:camera.ownerId}});assert.ok(actor);
 const inventory=await listCameraRecordings(camera.id,actor);assert.equal(inventory.recordings.length,1);
 const [,recorderId,channel]=inventory.recordings[0].token.split(':');
 const recorder=await prisma.cameraDevice.findFirst({where:{id:recorderId,ownerId:camera.ownerId,companyId:camera.companyId,kind:'nvr'}});assert.ok(recorder);
 const connection=cameraConnection(recorder),native=await taoshiInventory(recorder,connection),end=Date.parse(native.clock.replace(' ','T')+'Z')-600000+15000,start=end-23000;
 const rates={},keyRates={},perSecond={};const payloads=[];let frames=0,codec=null,parseError=null,firstStamp,lastStamp;
 child=spawn('/usr/local/bin/taoshi-replay',[],{shell:false,env:{PATH:'/usr/bin:/bin',TZ:'UTC'},stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});
 const timer=setTimeout(()=>child.kill('SIGKILL'),85000);
 const parse=taoshiFrameParser((data,rate,stamp,key)=>{frames++;rates[rate]=(rates[rate]??0)+1;if(key){keyRates[rate]=(keyRates[rate]??0)+1;if(!codec)codec=taoshiCodec(data);}const second=Math.floor((stamp-start)/1000);perSecond[second]=(perSecond[second]??0)+1;if(stamp>=end)child.kill('SIGTERM');else if(codec){payloads.push(data);firstStamp??=stamp;lastStamp=stamp;}});
 child.stdout.on('data',chunk=>{try{parse(chunk);}catch(error){parseError=error.code??'PARSE_FAILED';child.kill('SIGKILL');}});
 child.stdin.end([recorder.host,native.port,connection.username,connection.password,'replay',channel,taoshiWallTime(new Date(start).toISOString()),taoshiWallTime(new Date(end+2000).toISOString()),''].join('\n'));
 await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);
 let decodedFrames=0,decodeWarnings=0;
 if(codec&&payloads.length){const probe=spawn('ffprobe',['-v','error','-f',codec,'-framerate',Object.keys(keyRates)[0],'-count_frames','-show_entries','stream=nb_read_frames','-of','json','pipe:0'],{stdio:['pipe','pipe','pipe']});let output='';probe.stdout.on('data',b=>output+=b);probe.stderr.on('data',b=>decodeWarnings+=b.toString().split('\n').filter(Boolean).length);probe.stdin.on('error',()=>{});probe.stdin.end(Buffer.concat(payloads));await new Promise(resolve=>probe.once('close',resolve));decodedFrames=Number(JSON.parse(output).streams?.[0]?.nb_read_frames??0);}
 const timing=[];
 for(const option of ['-framerate','-r']){const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-f',codec,option,Object.keys(keyRates)[0],'-i','pipe:0','-ss',String(Math.max(0,(start+8000-firstStamp)/1000)),'-t','15','-vf','fps=12,scale=160:-2','-progress','pipe:1','-f','null','-'],{stdio:['pipe','pipe','ignore']});let progress='';ff.stdout.on('data',b=>progress+=b);ff.stdin.on('error',()=>{});ff.stdin.end(Buffer.concat(payloads));await new Promise(resolve=>ff.once('close',resolve));timing.push({option,outputFrames:Number([...progress.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]??0)});}
 console.log(JSON.stringify({frames,rates,keyRates,perSecond,codec,parseError,firstOffsetSeconds:(firstStamp-start)/1000,lastOffsetSeconds:(lastStamp-start)/1000,payloadFrames:payloads.length,decodedFrames,decodeWarnings,timing}));
}catch(error){console.log(JSON.stringify({ok:false,code:error.code??'PROBE_FAILED'}));process.exitCode=1;}finally{child?.kill('SIGKILL');await shutdownDatabase();}
