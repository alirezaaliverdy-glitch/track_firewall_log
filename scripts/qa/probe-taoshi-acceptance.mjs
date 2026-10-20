// Explicit opt-in actual recorder acceptance, inside the local API container.
// Customer video exists only in memory; output contains technical metadata only.
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
for(const item of readFileSync('/proc/1/environ','utf8').split('\0')){const i=item.indexOf('=');if(['DATABASE_URL','CREDENTIAL_ENCRYPTION_KEY'].includes(item.slice(0,i)))process.env[item.slice(0,i)]=item.slice(i+1);}
process.env.LOG_LEVEL='silent';
const {prisma,shutdownDatabase}=await import('file:///app/dist/db/prisma.js');
let stage='inventory';
try {
 const camera=await prisma.cameraDevice.findFirst({where:{kind:'camera',host:process.argv[2]}});
 assert.ok(camera,'SAVED_CAMERA_REQUIRED');
 const owner=await prisma.appUser.findUnique({where:{id:camera.ownerId}});assert.ok(owner);
 const actor={id:owner.id,username:owner.username,role:owner.role};
 const {listCameraRecordings,cameraPlaybackClip}=await import('file:///app/dist/cameras/camera-playback.service.js');
 const inventory=await listCameraRecordings(camera.id,actor);assert.equal(inventory.protocol,'taoshi-direct');assert.equal(inventory.recordings.length,1);
 const start=new Date(Date.parse(inventory.deviceLocalTime.replace(' ','T')+'Z')-600000).toISOString();
 const duration=Number(process.argv[3]??6);assert.ok(Number.isInteger(duration)&&duration>=5&&duration<=60);
 stage='native-clip';const clip=await cameraPlaybackClip(camera.id,{recordingToken:inventory.recordings[0].token,start,duration},actor,new AbortController().signal);
 stage='decode';
 const ffprobe=spawn('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames:format=duration','-of','json','-i','pipe:0'],{stdio:['pipe','pipe','ignore']});
 let out='';ffprobe.stdin.on('error',()=>{});ffprobe.stdin.end(clip);ffprobe.stdout.on('data',b=>out+=b);
 await new Promise((resolve,reject)=>{ffprobe.once('error',reject);ffprobe.once('close',code=>code===0?resolve():reject(Error('DECODE_FAILED')));});
 const metadata=JSON.parse(out),stream=metadata.streams.find(s=>s.codec_name==='h264');assert.ok(stream);const decodedDuration=Number(stream.nb_read_frames)/12;console.log(JSON.stringify({stage:'decoded-metadata',requestedSeconds:duration,decodedFrames:Number(stream.nb_read_frames),mp4Bytes:clip.length}));
 // Native archive headers identify wall time only to the second. Do not pad or
 // label a partial final second as exact/frame-accurate footage.
 assert.ok(decodedDuration>=duration-1&&decodedDuration<=duration+.1,'actual segment within the device clock resolution, without padded frames');
 stage='browser';const puppeteer=createRequire('/app/package.json')('puppeteer-core');
 const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let browserDuration;
 try{const page=await browser.newPage();await page.setContent('<video muted playsinline></video>');
   await page.$eval('video',(video,source)=>{video.src=source;},'data:video/mp4;base64,'+clip.toString('base64'));
   await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1,{timeout:30000});
   browserDuration=await page.$eval('video',video=>video.duration);assert.ok(Math.abs(browserDuration-decodedDuration)<=.25);assert.ok(Math.abs(browserDuration-duration)<=1.05);
   await page.$eval('video',video=>{video.currentTime=video.duration/2;});await page.waitForFunction(()=>!document.querySelector('video').seeking&&document.querySelector('video').currentTime>1,{timeout:30000});
 }finally{await browser.close();}
 console.log(JSON.stringify({ok:true,readOnly:true,protocol:inventory.protocol,uniqueChannelMatch:true,timeBasis:inventory.timeBasis,mp4Bytes:clip.length,decodedFrames:Number(stream.nb_read_frames),browserDuration,seekOK:true,width:stream.width,height:stream.height}));
}catch(e){console.log(JSON.stringify({ok:false,stage,code:e.code??(e instanceof assert.AssertionError?'ACCEPTANCE_ASSERTION_FAILED':'ACCEPTANCE_FAILED'),site:String(e.stack??'').split('\n').slice(1,3).map(line=>line.trim())}));process.exitCode=1;}
finally{await shutdownDatabase();}
