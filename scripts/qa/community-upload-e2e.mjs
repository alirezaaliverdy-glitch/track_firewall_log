// Real UI -> cookie/CSRF -> FormData -> API -> isolated PostgreSQL -> private download.
// Requires a disposable migrated TEST_DATABASE_URL. No production sessions, uploads or users.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import http from 'node:http';
const require=createRequire('/app/package.json'),puppeteer=require('puppeteer-core');
if(process.env.NODE_ENV!=='test')throw new Error('Browser upload QA requires NODE_ENV=test and a disposable TEST_DATABASE_URL');
const {assertSafeTestDatabaseEnvironment}=await import('/app/dist/testing/test-database-safety.js');assertSafeTestDatabaseEnvironment();
process.env.AUTH_SESSION_SECRET=randomBytes(32).toString('hex');process.env.LOG_LEVEL='silent';
const {prisma,shutdownDatabase}=await import('/app/dist/db/prisma.js'),{buildApp}=await import('/app/dist/app.js'),{createSession}=await import('/app/dist/services/auth.service.js');
const app=await buildApp(),users=[],tag='upload-browser-'+randomUUID(),errors=[];let browser,proxy,loseAcknowledgement=false,lostStatus=503;
try{
 const api=new URL(await app.listen({host:'127.0.0.1',port:0}));
 proxy=http.createServer((req,res)=>{
  const isApi=req.url.startsWith('/firewall-api/'),headers={...req.headers};delete headers.origin;
  const loseThisResponse=loseAcknowledgement&&req.method==='POST'&&req.url.endsWith('/messages/files');if(loseThisResponse)loseAcknowledgement=false;
  const responseStatus=lostStatus;
  const upstream=http.request({hostname:isApi?'127.0.0.1':'host.docker.internal',port:isApi?api.port:80,path:isApi?req.url.replace('/firewall-api/','/api/'):req.url,method:req.method,headers},out=>{if(loseThisResponse){out.resume();res.writeHead(responseStatus,{'Content-Type':'application/json','X-Request-Id':'fixture-upload-reference'});res.end(JSON.stringify({error:'COMMUNITY_STORAGE_UNAVAILABLE',requestId:'fixture-upload-reference'}));return;}res.writeHead(out.statusCode,out.headers);out.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+proxy.address().port;
 browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  const user=await prisma.appUser.create({data:{username:tag+'-'+users.length,displayName:'کاربر تست پیوست',passwordHash:'not-a-login',role:'admin',allowedSections:['page:community']}});users.push(user.id);
  const thread=await prisma.communityThread.create({data:{workspaceId:user.id,creatorId:user.id,clientKey:randomUUID(),kind:'discussion',title:'آزمایش واقعی ارسال عکس',messages:{create:{authorId:user.id,clientKey:randomUUID(),body:'این گفتگو فقط دادهٔ مصنوعی تست است.'}}}});
  const {token}=await createSession(user.id,{}),page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setBypassServiceWorker(true);
  await page.setViewport({width,height:1000,isMobile:width<700,hasTouch:width<700});await page.setCookie({name:'firewall_session',value:token,url:base});
  await page.evaluateOnNewDocument(theme=>{localStorage.setItem('firewall-log-analyzer.locale','fa');localStorage.setItem('eosnet.appearance',theme);},theme);
  await page.goto(base+'/firewall/community?tab=discussion&thread='+thread.id,{waitUntil:'networkidle0'});await page.waitForSelector('#community-message');
  const names=['IMG_5015.jpeg','archive.zip','phone.heic','report.docx','video.mp4','untrusted.html'],name=names[users.length-1],prefix=name.endsWith('jpeg')?[255,216,255]:[0,255,80];
  assert.equal(await page.$eval('input[type=file]',input=>input.hasAttribute('accept')),false);
  await page.evaluate(({name,prefix})=>{const bytes=new Uint8Array(6*1024*1024).fill(65);bytes.set(prefix);const transfer=new DataTransfer();transfer.items.add(new File([bytes],name,{type:'text/html'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{name,prefix});
  await page.waitForSelector('.hub-pending-files');
  if(theme==='light'&&width===1440){loseAcknowledgement=true;await page.click('[aria-label="ارسال پیام"]');await page.waitForSelector('.hub-error[role=alert]');assert.ok(await page.$eval('.hub-error',el=>el.textContent.includes('ذخیره')&&el.textContent.includes('fixture-upload-reference')));assert.ok(await page.$('.hub-pending-files'));await page.screenshot({path:'/out/chat-upload-retry-reference.png',fullPage:true});}
  const autoRetry=theme==='dark'&&width===1440;if(autoRetry){loseAcknowledgement=true;lostStatus=502;}
  const completed=page.waitForResponse(r=>r.url().endsWith('/messages/files')&&r.request().method()==='POST'&&(!autoRetry||r.status()===200));await page.click('[aria-label="ارسال پیام"]');
  const response=await completed,payload=await response.json();assert.equal(response.status(),200,JSON.stringify({status:response.status(),code:payload.error}));const message=payload.message,file=message.attachments[0];assert.equal(message.body,'');assert.equal(file.size,6*1024*1024);assert.equal(file.fileName,name);if(!name.endsWith('jpeg'))assert.equal(file.mimeType,'application/octet-stream');
  await page.waitForFunction(id=>!!document.getElementById('message-'+id),{},message.id);assert.equal(await page.$('.hub-pending-files'),null);assert.equal(await page.$eval('#community-message',e=>e.value),'');
  assert.equal(await prisma.communityAttachment.count({where:{workspaceId:user.id}}),1,'lost acknowledgement retry stores exactly one file');assert.equal(await prisma.auditLog.count({where:{actor:user.id,action:'community.files_uploaded'}}),1);
  let downloads=0;page.on('request',request=>{if(request.url().includes('/attachments/'))downloads++;});
  await page.click('.hub-file');await page.waitForSelector('dialog[open] #download-file-title');assert.ok(await page.$eval('dialog[open]',el=>el.textContent.includes('اسکن آنتی‌ویروس نشده')));assert.equal(downloads,0,'no attachment fetched before confirmation');
  if(width===390)await page.screenshot({path:`/out/${theme}-download-warning-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(downloads,0,'cancel does not fetch file');
  await page.click('.hub-file');await page.waitForSelector('dialog[open] #download-file-title');
  const fetched=page.waitForResponse(r=>r.url().includes('/attachments/'));await page.click('dialog[open] .hub-primary');const download=await fetched;assert.equal(download.status(),200);assert.equal(download.headers()['content-type'],'application/octet-stream');assert.equal(download.headers()['x-content-type-options'],'nosniff');assert.match(download.headers()['content-disposition'],/^attachment;/);await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  const checksum=await page.evaluate(async({threadId,fileId})=>{const r=await fetch('/firewall-api/community/threads/'+threadId+'/attachments/'+fileId,{credentials:'include'});if(!r.ok)throw new Error('download '+r.status);const b=new Uint8Array(await r.arrayBuffer());return {bytes:b.length,start:Array.from(b.slice(0,3)),allBytesIntact:b.slice(3).every(v=>v===65)};},{threadId:thread.id,fileId:file.id});assert.equal(checksum.bytes,6*1024*1024);assert.deepEqual(checksum.start,prefix);assert.equal(checksum.allBytesIntact,true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`/out/${theme}-chat-upload-${width}.png`,fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS real UI JPEG/ZIP/HEIC/DOCX/MP4/HTML 6 MiB file-only, private exact download, warning/cancel/confirm, cookie/CSRF, retry; dark/light 1440/390/320.');
}finally{
 await browser?.close();if(proxy)await new Promise(resolve=>proxy.close(resolve));await app.close();await prisma.auditLog.deleteMany({where:{actor:{in:users}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();
}
