// Explicit local acceptance using saved device configuration and real HTTP/UI.
// No screenshots, video files, credentials, response bodies or customer identifiers
// are emitted. The short-lived QA session is removed without pruning user sessions.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
for(const item of readFileSync('/proc/1/environ','utf8').split('\0')){
  const i=item.indexOf('=');
  if(['DATABASE_URL','CREDENTIAL_ENCRYPTION_KEY','AUTH_SESSION_SECRET'].includes(item.slice(0,i)))process.env[item.slice(0,i)]=item.slice(i+1);
}
process.env.LOG_LEVEL='silent';
const {prisma,shutdownDatabase}=await import('file:///app/dist/db/prisma.js');
let sessionId,browser,stage='saved-device';
const statuses=[],pageErrors=[];
try{
  const cameras=await prisma.cameraDevice.findMany({where:{kind:'camera',host:process.argv[2]}});
  assert.equal(cameras.length,1,'UNIQUE_SAVED_CAMERA_REQUIRED');
  const camera=cameras[0],owner=await prisma.appUser.findUnique({where:{id:camera.ownerId}});
  assert.ok(owner?.isActive);
  const {hashSessionToken}=await import('file:///app/dist/services/auth.service.js');
  const token=randomBytes(32).toString('base64url');
  const session=await prisma.authSession.create({data:{userId:owner.id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+5*60000),userAgent:'EOSNET playback acceptance'}});
  sessionId=session.id;
  const puppeteer=createRequire('/app/package.json')('puppeteer-core');
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  await page.setViewport({width:Number(process.argv[3]??1440),height:1000});
  await page.setCookie({name:'firewall_session',value:token,url:'http://host.docker.internal',path:'/',httpOnly:true,sameSite:'Lax'});
  page.on('pageerror',()=>pageErrors.push('PAGE_ERROR'));
  page.on('response',response=>{if(/\/cameras\/[^/]+\/playback\?/.test(response.url()))statuses.push(response.status());});
  await page.setRequestInterception(true);
  page.on('request',request=>{
    // A playback view must not perform device configuration, export or commands.
    if(!['GET','HEAD','OPTIONS'].includes(request.method()))void request.abort();
    else void request.continue();
  });
  const profiles=Array.isArray(camera.profilesJson)?camera.profilesJson:[];
  const query=new URLSearchParams({company:camera.companyId??'unassigned',view:'playback',device:camera.id,source:profiles[0]?.sourceToken??'manual'});
  stage='ui-inventory';
  await page.goto('http://host.docker.internal/firewall/assets/cameras?'+query,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.camera-replay__form',{timeout:60000});
  assert.equal(await page.$('.camera-replay .camera-alert'),null,'VERIFIED_CHANNEL_MUST_NOT_WARN');
  const start=await page.$('.camera-replay__actions button');
  assert.ok(start);assert.equal(await start.evaluate(el=>el.disabled),false,'ARCHIVE_AUTO_SELECTED');
  stage='ui-playback';await start.click();
  await page.waitForFunction(()=>document.querySelector('.camera-replay video')?.readyState>=2,{timeout:120000});
  const video=await page.$eval('.camera-replay video',el=>{el.pause();return {duration:el.duration,width:el.videoWidth,height:el.videoHeight};});
  assert.ok(video.width>0&&video.duration>=14&&video.duration<=15.2);
  stage='ui-seek';
  await page.$eval('.camera-replay video',el=>{el.currentTime=2;});
  await page.waitForFunction(()=>{const v=document.querySelector('.camera-replay video');return v&&!v.seeking&&v.currentTime>=2&&v.readyState>=2;},{timeout:30000});
  stage='ui-next-segment';
  const previous=await page.$eval('.camera-replay video',el=>{el.muted=true;el.currentTime=el.duration-.15;void el.play();return el.src;});
  await page.waitForFunction(source=>{const v=document.querySelector('.camera-replay video');return v&&v.src!==source&&v.readyState>=2;},{timeout:120000},previous);
  const next=await page.$eval('.camera-replay video',el=>{el.pause();return {duration:el.duration,width:el.videoWidth};});
  assert.ok(next.width>0&&next.duration>=14&&next.duration<=15.2);
  assert.equal(await page.$('.camera-replay [role="alert"]'),null);
  assert.ok(statuses.includes(200));assert.equal(pageErrors.length,0);
  console.log(JSON.stringify({ok:true,actualUI:true,autoSelectedVerifiedArchive:true,playbackHTTP:200,browserDuration:video.duration,nextSegmentDuration:next.duration,width:video.width,height:video.height,seekOK:true,nextSegmentOK:true,pageErrors:pageErrors.length,viewport:Number(process.argv[3]??1440),footageRetained:false}));
}catch(error){console.log(JSON.stringify({ok:false,stage,code:error instanceof assert.AssertionError?'UI_ACCEPTANCE_ASSERTION_FAILED':'UI_ACCEPTANCE_FAILED',playbackStatuses:statuses,pageErrors:pageErrors.length}));process.exitCode=1;}
finally{if(browser)await browser.close();if(sessionId)await prisma.authSession.deleteMany({where:{id:sessionId}});await shutdownDatabase();}
