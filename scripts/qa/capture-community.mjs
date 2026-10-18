import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath:'/usr/bin/chromium-browser', headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
const base = process.env.QA_BASE_URL || 'http://host.docker.internal/firewall';
const errors = []; let role = 'admin', failSend = false, sequence = 10, captures = 0; const writes = [], keys = [];
const now = new Date().toISOString(), author = { id:'other', displayName:'سارا احمدی' }, self = { id:'qa-user', displayName:'علی رضایی' };
const threads = [
  { id:'topic', kind:'discussion', title:'تجربه شما از پایش شبکه چیست؟', creatorId:author.id, creator:author, status:'open', priority:'normal', createdAt:now, updatedAt:now, preview:'برای شروع پایش تجهیزات چه سنسورهایی را انتخاب می‌کنید؟', unread:true, messageCount:3 },
  { id:'topic-two', kind:'discussion', title:'ایده‌هایی برای داشبورد', creatorId:self.id, creator:self, status:'open', priority:'normal', createdAt:now, updatedAt:now, preview:'یک نمای ساده برای اطلاعات مهم', unread:false, messageCount:1 },
  { id:'ticket', kind:'ticket', title:'بررسی اتصال دوربین ورودی', creatorId:self.id, creator:self, status:'in_progress', priority:'urgent', createdAt:now, updatedAt:now, preview:'اطلاعات اتصال بررسی می‌شود.', unread:true, messageCount:2 }
];
const messages = {
  topic:[{id:'m1',sequence:1,authorId:author.id,author,body:'سلام! برای شروع پایش تجهیزات چه سنسورهایی را انتخاب می‌کنید؟',createdAt:now},{id:'m2',sequence:2,authorId:self.id,author:self,body:'سلام سارا، من از وضعیت اتصال و مصرف منابع شروع می‌کنم. شما چطور؟',createdAt:now},{id:'m3',sequence:3,authorId:author.id,author,body:'ممنون! نمایش وضعیت همه دستگاه‌ها کنار هم خیلی کمک می‌کند.',createdAt:now}],
  'topic-two':[{id:'m4',sequence:4,authorId:self.id,author:self,body:'یک نمای ساده برای اطلاعات مهم',createdAt:now}],
  ticket:[{id:'m5',sequence:5,authorId:self.id,author:self,body:'تصویر دوربین در موبایل باز نمی‌شود. لطفاً بررسی کنید.',createdAt:now},{id:'m6',sequence:6,authorId:author.id,author,body:'درخواست شما ثبت شد؛ مسیر اتصال را بررسی می‌کنیم.',createdAt:now}]
};
const page = await browser.newPage();
await page.setBypassServiceWorker(true); page.on('pageerror', e => errors.push(e.message));
await page.evaluateOnNewDocument(() => { localStorage.setItem('eosnet.appearance',sessionStorage.getItem('qa-theme') || 'light'); });
await page.setRequestInterception(true);
page.on('request', async request => {
  const url = new URL(request.url()); if (!url.pathname.startsWith('/firewall-api/')) return void request.continue();
  const path = url.pathname.replace(/^\/firewall-api(?:\/api)?/, ''), method = request.method();
  const respond = (value,status=200) => request.respond({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/auth/session-status')return respond({authenticated:true,user:{...self,username:'qa',role,allowedSections:[]}});
  if(path==='/auth/csrf')return respond({csrfToken:'synthetic-csrf'});
  if(path==='/product-state/navigation')return respond({navigation:[]});
  if(path==='/community/retention')return respond({policy:{enabled:true,discussionDays:30,closedTicketDays:90,maxMessages:5000},usedBytes:104857600,workspaceFileLimit:536870912,fileLimit:52428800});
  if(!path.startsWith('/community/threads')) { if(method!=='GET') writes.push(path); return respond({}); }
  if(method!=='GET')assert.equal(request.headers()['x-csrf-token'],'synthetic-csrf');
  const parts=path.split('/'),id=parts[3],action=parts[4],body=request.postData()?JSON.parse(request.postData()):null;
  if(!id&&method==='GET')return respond({threads:threads.filter(t=>t.kind===url.searchParams.get('kind')&&(!url.searchParams.get('search')||t.title.includes(url.searchParams.get('search')))&&(!url.searchParams.get('status')||t.status===url.searchParams.get('status'))),hasMore:false});
  if(!id&&method==='POST'){const id='created';threads.push({...threads[0],...body,id,creatorId:self.id,creator:self,preview:body.body});messages[id]=[{id:'created-m',sequence:++sequence,authorId:self.id,author:self,body:body.body,createdAt:now}];return respond({id},201);}
  const thread=threads.find(t=>t.id===id);if(!thread)return respond({error:'not_found'},404);
  if(action==='read'){thread.unread=false;return respond({ok:true});}
  if(action==='messages'){
    keys.push(body.clientKey);
    if(failSend){failSend=false;return respond({error:'synthetic_failure'},503);}
    const message={id:`m${++sequence}`,sequence,authorId:self.id,author:self,body:body.body,createdAt:now};messages[id].push(message);thread.preview=body.body;return respond({message});
  }
  if(method==='PATCH'){thread.status=body.status;return respond({ok:true});}
  return respond({thread,messages:messages[id].filter(m=>!url.searchParams.has('after')||m.sequence>Number(url.searchParams.get('after'))),hasMore:false});
});
async function capture(name){await page.waitForSelector('.hub-workspace');await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name} overflow`);
  if(await page.evaluate(()=>innerWidth<=740 && !!document.querySelector('.hub-conversation'))){
    assert.ok(await page.evaluate(()=>{const compose=document.querySelector('.hub-composer-wrap').getBoundingClientRect();const nav=document.querySelector('.platform-bottom-nav').getBoundingClientRect();return compose.bottom<=nav.top+1&&compose.top>=0;}),`${name}: composer remains above bottom navigation`);
  }
  await page.screenshot({path:`/out/${name}.png`,fullPage:true});captures++;}
async function go(query=''){await page.goto(`${base}/community${query}`,{waitUntil:'networkidle0'});await page.waitForSelector('.hub-thread');}
try{
  await page.setViewport({width:1440,height:1050});await go();await capture('community-light-welcome');
  await page.click('.hub-storage-access');await page.waitForSelector('dialog[open]');await capture('community-retention-admin');assert.equal(await page.$$eval('dialog input[type=number]',inputs=>inputs.length),3);await page.keyboard.press('Escape');
  await page.click('.hub-thread');await page.waitForSelector('.hub-bubble');await capture('community-light-chat');
  failSend=true;await page.type('#community-message','پیام آزمایشی قابل تکرار');await page.click('.hub-send');await page.waitForSelector('.hub-composer-wrap [role=alert]');
  assert.equal(await page.$eval('#community-message',e=>e.value),'پیام آزمایشی قابل تکرار');await capture('community-retry-draft');
  await page.click('.hub-send');await page.waitForFunction(()=>document.querySelector('#community-message')?.value==='');assert.equal(keys[0],keys[1],'retry retains idempotency key');
  await page.type('#community-message','پیش‌نویس من');await page.click('.hub-thread:nth-of-type(2)');await page.waitForFunction(()=>document.querySelector('.hub-conversation h2')?.textContent==='ایده‌هایی برای داشبورد');await page.click('.hub-thread:first-of-type');await page.waitForFunction(()=>document.querySelector('#community-message')?.value==='پیش‌نویس من');
  await go('?tab=ticket&thread=ticket');await capture('community-ticket');await page.select('.hub-conversation__header select','resolved');await page.waitForSelector('.hub-closed');assert.equal(await page.$('#community-message'),null);await capture('community-ticket-closed');
  await page.select('.hub-conversation__header select','open');await page.waitForSelector('#community-message');
  await page.click('.hub-inbox__actions .hub-primary');await page.waitForSelector('dialog[open]');await capture('community-ticket-create');assert.equal(await page.$eval('dialog input',el=>el===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.$('dialog'),null);
  await page.evaluate(()=>sessionStorage.setItem('qa-theme','dark'));await go('?tab=discussion&thread=topic');await capture('community-dark-chat');
  role='viewer';await page.evaluate(()=>sessionStorage.setItem('qa-theme','light'));await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go('?tab=ticket&thread=ticket');assert.equal(await page.$('.hub-conversation__header select'),null);await capture('community-mobile-ticket');
  await page.click('.hub-back');await page.waitForFunction(()=>!new URL(location.href).searchParams.has('thread'));await capture('community-mobile-inbox');
  await page.click('.hub-storage-access');await page.waitForSelector('dialog[open]');await capture('community-retention-viewer');assert.equal(await page.$eval('dialog input[type=number]',input=>input.disabled),true);await page.keyboard.press('Escape');
  await page.click('.hub-inbox__actions .hub-primary');await page.waitForSelector('dialog[open]');await capture('community-mobile-create');await page.type('dialog input','تیکت آزمایشی');await page.type('dialog textarea','لطفاً این درخواست را بررسی کنید.');await page.click('dialog button[type=submit]');await page.waitForFunction(()=>document.querySelector('.hub-conversation h2')?.textContent==='تیکت آزمایشی');await capture('community-mobile-created');
  await page.setViewport({width:320,height:740,isMobile:true,hasTouch:true});await capture('community-small');
  await page.evaluate(()=>localStorage.setItem('firewall-log-analyzer.locale','en'));await page.setViewport({width:1440,height:1000});await go('?tab=discussion&thread=topic');await capture('community-english');
  assert.ok(await page.$('#message-m1'));threads[0].prunedThroughSequence=2;messages.topic=messages.topic.filter(message=>message.sequence>2);
  await page.waitForFunction(()=>!document.querySelector('#message-m1')&&!document.querySelector('#message-m2'));await capture('community-retention-pruned');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({ok:true,captures,runtimeErrors:errors.length,externalWrites:writes.length,scope:'synthetic APIs only'}));
} finally {await browser.close();}
