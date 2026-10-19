import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const base=process.env.QA_BASE_URL??'http://host.docker.internal/firewall',theme=process.env.QA_APPEARANCE??'dark',errors=[];
let role='admin',mode='normal',opened=0,closed=0,inputs=[],resizes=0,captures=0,output=0;
const page=await browser.newPage();await page.setBypassServiceWorker(true);page.on('pageerror',error=>errors.push(error.message));
page.setDefaultNavigationTimeout(60000);await page.setViewport({width:1440,height:1000,isMobile:false,hasTouch:true});
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
const info={device:{id:'qa-device',name:'روتر مرکزی شعبه',host:'192.0.2.50',port:22,vendor:'mikrotik',company:'شرکت مبنا',environment:'production',vpnConnectionId:null},supported:true,credentialsConfigured:true,username:'operator',trustedFingerprint:null,templateId:'interactive_ssh_session'};
await page.setRequestInterception(true);page.on('request',request=>{
  const url=new URL(request.url());if(!url.pathname.startsWith('/firewall-api/'))return void request.continue();
  const path=url.pathname.replace(/^\/firewall-api(?:\/api)?/,''),respond=(data,status=200)=>request.respond({status,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/auth/session-status')return void respond({authenticated:true,user:{id:'qa',username:'qa',displayName:'مدیر آزمایش',role,allowedSections:['assets']}});
  if(path==='/auth/csrf')return void respond({csrfToken:'fixture'});
  if(path==='/product-state/navigation')return void respond({navigation:[]});
  if(path==='/devices/qa-device/terminal')return void respond({...info,supported:mode!=='unsupported'});
  if(path==='/devices/qa-device/terminal/preview')return void respond(mode==='mismatch'?{code:'SSH_HOST_KEY_MISMATCH'}:{...info,previewId:'preview-fixture',fingerprint:'SHA256:synthetic-display-only-fingerprint',firstTrust:true,expiresAt:new Date(Date.now()+120000).toISOString()},mode==='mismatch'?409:200);
  if(path==='/devices/qa-device/terminal/sessions'){
    const input=JSON.parse(request.postData());assert.equal(input.intent,'execute');assert.equal(input.confirmed,true);opened++;output=0;
    return void respond({id:'session',state:'connected'},201);
  }
  if(path==='/terminal-sessions/session/input'){inputs.push(JSON.parse(request.postData()));return void respond({accepted:true});}
  if(path==='/terminal-sessions/session/resize'){resizes++;return void respond({resized:true});}
  if(path==='/terminal-sessions/session/close'){closed++;return void respond({closed:true});}
  if(path==='/terminal-sessions/session')return void respond({id:'session',state:'connected',reason:null,hasMore:false,truncated:false,cursor:++output,data:output===1?Buffer.from('\x1b[36mEOSNET SSH fixture\x1b[0m\r\n[operator@branch-router] > ').toString('base64'):'',openedAt:new Date().toISOString()});
  void respond({});
});
async function capture(name){await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: overflow`);await page.screenshot({path:`/out/${theme}-${name}.png`,fullPage:true});captures++;}
async function textButton(selector,text){const handles=await page.$$(selector);for(const h of handles)if((await h.evaluate(e=>e.textContent)).includes(text)){await h.click();return;}assert.fail(`Missing ${text}`);}
async function go(){await page.goto(`${base}/assets/devices/qa-device/terminal`,{waitUntil:'networkidle0'});await page.waitForSelector('.terminal-page');}
try{
  await go();await page.waitForSelector('.terminal-welcome code');await capture('terminal-ready');assert.equal(opened,0,'viewing a terminal must not create an SSH shell');
  await textButton('.terminal-welcome button','بررسی و اتصال');await page.waitForSelector('dialog[open]');await capture('terminal-confirm');assert.equal(opened,0,'preview is not a connection');
  await textButton('dialog[open] button','تأیید و اتصال');await page.waitForSelector('.terminal-state.is-connected');await page.waitForFunction(()=>document.querySelector('.xterm-screen')?.textContent.includes('branch-router'));await capture('terminal-connected');
  // The disposable Chromium image needs a monospace font (e.g. ttf-dejavu).
  // Without one its generic fallback is proportional and xterm pads each cell.
  const monospace=await page.$eval('.xterm-rows span',el=>{const s=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');c.font=`${s.fontSize} ${s.fontFamily}`;return Math.abs(c.measureText('W').width-c.measureText('i').width)<.1;});
  assert.equal(monospace,true,'browser fixture must have a real monospace font');
  await page.click('.terminal-dock-keyboard');await page.focus('.xterm-helper-textarea');await page.keyboard.type('system resource print');await page.keyboard.press('Enter');await textButton('.terminal-keyboard button','Ctrl+C');
  await new Promise(r=>setTimeout(r,600));assert.ok(inputs.some(i=>i.data.includes('system')));assert.ok(inputs.map(i=>i.data).join('').includes('\u0003'));assert.deepEqual(inputs.map(i=>i.sequence),inputs.map((_,i)=>i+1));
  await page.setViewport({width:390,height:844,isMobile:false,hasTouch:true});await capture('terminal-mobile-connected');
  if(theme==='light')assert.equal(await page.$eval('.terminal-console',el=>getComputedStyle(el).backgroundColor),'rgb(213, 224, 226)','reference terminal paper');
  await page.setViewport({width:320,height:740,isMobile:false,hasTouch:true});await capture('terminal-small-connected');
  await textButton('.terminal-console__footer button','قطع اتصال');await page.waitForSelector('.terminal-state.is-closed');assert.equal(closed,1);await capture('terminal-disconnected');
  assert.equal(await page.$('.terminal-welcome'),null,'closed terminal keeps output visible');
  await page.setViewport({width:390,height:844,isMobile:false,hasTouch:true});await textButton('.terminal-console__footer button','اتصال دوباره');await page.waitForSelector('dialog[open]');await capture('terminal-mobile-confirm');await page.keyboard.press('Escape');
  mode='mismatch';await textButton('.terminal-console__footer button','اتصال دوباره');await page.waitForSelector('[role=alert]');await capture('terminal-host-mismatch');assert.equal(opened,1);
  mode='unsupported';await go();await page.waitForSelector('.terminal-notice');assert.equal(await page.$eval('.terminal-welcome button',el=>el.disabled),true);await capture('terminal-unsupported');
  role='viewer';await go();assert.equal(await page.$('.terminal-console'),null);await capture('terminal-viewer');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,theme,captures,runtimeErrors:errors.length,opens:opened,closes:closed,inputBatches:inputs.length,resizes,scope:'intercepted synthetic APIs only; no device commands'}));
}finally{await browser.close();}
