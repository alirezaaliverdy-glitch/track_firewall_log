// Synthetic APIs only. Never executes devices or writes production/community data.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath:'/usr/bin/chromium-browser', headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
const base = process.env.QA_BASE_URL || 'http://host.docker.internal/firewall';
const page = await browser.newPage(); await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(() => { localStorage.setItem('firewall-log-analyzer.locale','fa'); localStorage.setItem('eosnet.appearance',sessionStorage.getItem('qa-theme') || 'light'); });
const errors=[], writes=[]; let role='admin', sequence=10, revision=10, captures=0, failUpload=true, downloads=0;
const now=new Date().toISOString(), self={id:'qa-user',displayName:'علی رضایی'}, other={id:'qa-peer',displayName:'سارا احمدی'};
const thread={id:'topic',kind:'discussion',title:'هماهنگی تیم شبکه',creatorId:self.id,creator:self,status:'open',priority:'normal',createdAt:now,updatedAt:now,messageCount:3};
const messages=[
  {id:'peer',sequence:1,changeSequence:1,authorId:other.id,author:other,body:'لطفاً اتصال دوربین ورودی را بررسی کنید؛ نتیجه را همین‌جا بنویسید.',createdAt:now,attachments:[]},
  {id:'own',sequence:2,changeSequence:2,authorId:self.id,author:self,body:'بررسی اولیه انجام شد؛ اتصال شبکه برقرار است.',createdAt:now,attachments:[]},
  {id:'file',sequence:3,changeSequence:3,authorId:other.id,author:other,body:'راهنمای بررسی',createdAt:now,attachments:[{id:'file-1',fileName:'راهنما.pdf',mimeType:'application/pdf',size:24000}]}
];
const tasks=[{id:'assigned',title:'بررسی کیفیت تصویر ورودی',description:'کیفیت تصویر را بررسی و نتیجه را ثبت کنید.',status:'in_progress',priority:'urgent',assigneeId:self.id,assignee:self,creatorId:other.id,creator:other,dueAt:'2026-10-17T20:29:59Z',version:1,updatedAt:now},
  {id:'done',title:'بررسی فضای ذخیره‌سازی',description:'فضای سرور بررسی شد.',status:'done',priority:'normal',assigneeId:other.id,assignee:other,creatorId:self.id,creator:self,dueAt:null,version:1,updatedAt:now}];
page.on('pageerror',e=>errors.push(e.message)); await page.setRequestInterception(true);
page.on('request',async request=>{
  const url=new URL(request.url()); if(!url.pathname.startsWith('/firewall-api/'))return void request.continue();
  const path=url.pathname.replace(/^\/firewall-api(?:\/api)?/,''), method=request.method();
  const respond=(value,status=200)=>request.respond({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/auth/session-status')return respond({authenticated:true,user:{...self,username:'qa',role,allowedSections:[]}});
  if(path==='/auth/csrf')return respond({csrfToken:'synthetic-csrf'});
  if(path==='/product-state/navigation')return respond({navigation:[]});
  if(!path.startsWith('/community/')){if(method!=='GET')writes.push(path);return respond({});}
  if(method!=='GET')assert.equal(request.headers()['x-csrf-token'],'synthetic-csrf');
  const multipart=request.headers()['content-type']?.startsWith('multipart/form-data');
  const body=!multipart&&request.postData()?JSON.parse(request.postData()):null;
  if(path==='/community/members')return respond({members:[self,other]});
  if(path==='/community/tasks'&&method==='GET')return respond({tasks:tasks.filter(task=>url.searchParams.get('mine')!=='true'||task.assigneeId===self.id),hasMore:false});
  if(path==='/community/tasks'&&method==='POST'){
    assert.ok(body.clientKey);const task={...body,id:'created-task',status:'todo',creatorId:self.id,creator:self,assignee:body.assigneeId===other.id?other:self,version:1,updatedAt:now};tasks.push(task);return respond({id:task.id},201);
  }
  if(path.startsWith('/community/tasks/')&&method==='PATCH'){
    const task=tasks.find(t=>t.id===path.split('/').at(-1));assert.equal(body.expectedVersion,task.version);
    if(role==='viewer'){assert.deepEqual(Object.keys(body).sort(),['expectedVersion','status']);}
    Object.assign(task,body,{version:task.version+1});return respond({task});
  }
  if(path==='/community/threads'&&method==='GET')return respond({threads:[thread],hasMore:false});
  if(path==='/community/threads/topic/read')return respond({ok:true});
  if(path.includes('/attachments/')){downloads++;return request.respond({status:200,contentType:'application/octet-stream',headers:{'Content-Disposition':'attachment; filename="fixture.txt"'},body:'synthetic download'});}
  if(path==='/community/threads/topic/messages/files'){
    assert.equal(multipart,true);if(failUpload){failUpload=false;return respond({error:'SYNTHETIC_UPLOAD_RETRY'},503);}
    const message={id:`m${++sequence}`,sequence,changeSequence:++revision,authorId:self.id,author:self,body:'پیوست آزمایشی',createdAt:now,attachments:[{id:'uploaded',fileName:'community-note.txt',mimeType:'text/plain',size:64}]};messages.push(message);return respond({message});
  }
  if(path==='/community/threads/topic/messages'&&method==='POST'){
    const parent=body.replyToId?messages.find(m=>m.id===body.replyToId):null;
    const message={id:`m${++sequence}`,sequence,changeSequence:++revision,authorId:self.id,author:self,body:body.body,replyToId:parent?.id,replyTo:parent?{id:parent.id,body:parent.body,author:parent.author}:null,createdAt:now,attachments:[]};messages.push(message);return respond({message});
  }
  if(path.startsWith('/community/threads/topic/messages/')&&['PATCH','DELETE'].includes(method)){
    const message=messages.find(m=>m.id===path.split('/').at(-1));assert.equal(body.expectedRevision,message.changeSequence);
    if(method==='PATCH'){message.body=body.body;message.editedAt=now;}else{message.body='';message.deletedAt=now;message.attachments=[];}
    message.changeSequence=++revision;return respond({message});
  }
  if(path==='/community/threads/topic'){
    return respond({thread,messages:messages.filter(m=>!url.searchParams.has('changeAfter')||m.changeSequence>Number(url.searchParams.get('changeAfter'))),changeCursor:revision,hasMore:false});
  }
  return respond({error:'fixture_not_found'},404);
});
const text=async()=>page.evaluate(()=>document.body.textContent);
async function clickText(selector,label){const el=await page.evaluateHandle((selector,label)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.includes(label)),selector,label);assert.ok(el.asElement(),`Missing ${label}`);await el.asElement().click();await el.dispose();}
async function menu(id,label){await page.click(`#message-${id} summary`);await clickText(`#message-${id} details button`,label);}
async function capture(name){await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: overflow`);
  if(await page.evaluate(()=>innerWidth<=740&&!!document.querySelector('.hub-composer-wrap'))){assert.equal(await page.evaluate(()=>{const c=document.querySelector('.hub-composer-wrap').getBoundingClientRect(),n=document.querySelector('.platform-bottom-nav')?.getBoundingClientRect();return c.top>=0&&(!n||c.bottom<=n.top+1);}),true,`${name}: composer visible`);}
  await page.screenshot({path:`/out/${name}.png`,fullPage:true});captures++;}
async function go(path='?tab=discussion&thread=topic'){await page.goto(`${base}/community${path}`,{waitUntil:'networkidle0'});}
try{
  await page.setViewport({width:1440,height:1000});await go();await page.waitForSelector('#message-own');await capture('collaboration-light-chat');
  await page.click('#message-own summary');await page.click('.hub-conversation__header h2');assert.equal(await page.$('#message-own details[open]'),null,'outside click closes tools');
  await page.type('#community-message','پیش‌نویس محفوظ');await menu('own','ویرایش');await page.focus('#community-message');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type('Edited synthetic message');await page.click('[aria-label="ذخیرهٔ پیام"]');
  await page.waitForFunction(()=>document.querySelector('#message-own p').textContent==='Edited synthetic message');assert.equal(await page.$eval('#community-message',e=>e.value),'پیش‌نویس محفوظ');await capture('collaboration-edited');
  await page.focus('#community-message');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');
  await menu('peer','پاسخ');await capture('collaboration-reply-composer');await page.type('#community-message','پاسخ آزمایشی');await page.click('[aria-label="ارسال پیام"]');await page.waitForSelector('.hub-quote');await capture('collaboration-quoted-reply');
  await page.click('[aria-label="پیوست فایل"]');const fileInput=await page.$('input[type=file]');await fileInput.uploadFile('/workspace/scripts/qa/fixtures/community-note.txt');await page.type('#community-message','پیوست آزمایشی');await page.click('[aria-label="ارسال پیام"]');await page.waitForSelector('.hub-error[role=alert]');assert.equal(await page.$$('.hub-pending-files>span').then(x=>x.length),1);await capture('collaboration-upload-retry');
  await page.click('[aria-label="ارسال پیام"]');await page.waitForFunction(()=>[...document.querySelectorAll('.hub-file')].some(el=>el.textContent.includes('community-note.txt')));await capture('collaboration-attachment');await clickText('.hub-file','community-note.txt');await page.waitForFunction(()=>!document.querySelector('.hub-pending-files'));assert.equal(downloads,1);
  const lastId=messages.at(-1).id;await page.click(`#message-${lastId} summary`);await page.waitForFunction(id=>document.querySelector(`#message-${id} details`).style.getPropertyValue('--hub-menu-height'),{},lastId);
  assert.equal(await page.$eval(`#message-${lastId} details>div`,el=>{const r=el.getBoundingClientRect(),p=el.closest('.hub-messages').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1;}),true,'message tools stay inside scroll viewport');await capture('collaboration-last-message-tools');await page.click('.hub-conversation__header h2');
  await menu('peer','تبدیل به کار');await page.waitForSelector('dialog[open]');await page.waitForFunction(()=>!document.querySelector('dialog select').disabled);await page.select('dialog select',other.id);await capture('collaboration-create-task');await page.click('dialog button[type=submit]');await page.waitForSelector('.hub-success');assert.equal(tasks.at(-1).sourceMessageId,'peer');assert.equal(tasks.at(-1).assigneeId,other.id);
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go();await page.waitForSelector('#message-own');await menu('own','حذف');await capture('collaboration-mobile-delete');await page.click('.hub-delete-confirm');await page.waitForSelector('#message-own.is-deleted');await capture('collaboration-mobile-chat');
  await go('?tab=task');await page.waitForSelector('.hub-task-card');await capture('collaboration-mobile-tasks');
  await page.setViewport({width:1440,height:1000});await go('?tab=task');await page.waitForSelector('.hub-task-card');await capture('collaboration-light-tasks');await page.evaluate(()=>sessionStorage.setItem('qa-theme','dark'));await go('?tab=task');await page.waitForSelector('.hub-task-card');await capture('collaboration-dark-tasks');
  role='viewer';await go('?tab=task');await clickText('.hub-task-card','بررسی کیفیت');await page.waitForSelector('dialog[open]');assert.equal(await page.$eval('dialog input',e=>e.disabled),true);await page.select('dialog select:not(:disabled)','done');await capture('collaboration-viewer-assigned-task');await page.click('dialog button[type=submit]');await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(tasks[0].status,'done');
  await page.setViewport({width:320,height:740,isMobile:true,hasTouch:true});await go();await page.waitForSelector('#message-peer');await capture('collaboration-small-chat');await go('?tab=task');await page.waitForSelector('.hub-task-card');await capture('collaboration-small-tasks');
  messages.push({id:'xss',sequence:++sequence,changeSequence:++revision,authorId:other.id,author:other,body:'<img src=x onerror="window.__communityXss=true">',createdAt:now,attachments:[]});
  await go();await page.waitForSelector('#message-xss');assert.equal(await page.$('#message-xss img'),null);assert.equal(await page.evaluate(()=>window.__communityXss),undefined);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.equal(await text().then(t=>t.includes('گفت‌وگو')),true);
  console.log(JSON.stringify({ok:true,captures,runtimeErrors:errors.length,externalWrites:writes.length,downloads,scope:'synthetic only'}));
}catch(error){await page.screenshot({path:'/out/collaboration-failure.png',fullPage:true});console.log(JSON.stringify({captures,runtimeErrors:errors,path:new URL(page.url()).pathname}));throw error;}finally{await browser.close();}
