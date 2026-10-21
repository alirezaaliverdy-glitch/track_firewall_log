import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json'),puppeteer=require('puppeteer-core');
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage(),theme=process.env.QA_APPEARANCE||'dark',errors=[];let role='operator',writes=0,previewed=0,unsupported=false;
const camera={id:'fixture-recorder',kind:'nvr',companyId:'fixture-company',name:'ضبط‌کنندهٔ آزمایشی',host:'192.168.210.50',connectionMode:'appweb',status:'verified',profiles:[],onvifPort:80},channels=[{index:0,name:'ورودی ساختمان',address:'192.168.210.11',enabled:true},{index:1,name:'پارکینگ',address:'192.168.210.12',enabled:false}];let chosen;
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const p=u.pathname.slice('/firewall-api'.length),send=(body,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 if(p==='/auth/session-status')return void send({authenticated:true,user:{id:'fixture',username:'fixture',displayName:'اپراتور آزمایش',role,allowedSections:['page:assets.cameras']}});
 if(p==='/auth/csrf')return void send({csrfToken:'fixture'});
 if(p==='/product-state/navigation')return void send({navigation:[]});
 if(p===`/cameras/${camera.id}`)return void send({camera});
 if(p.endsWith('/monitor'))return void send({sensors:[],history:[],report:null,monitoringEnabled:false,intervalSeconds:300});
 if(p.endsWith('/nvr/channels'))return void send(unsupported?{error:{code:'NVR_CHANNEL_CONTROL_UNSUPPORTED'}}:{channels,revision:'fixture'},unsupported?422:200);
 if(p.endsWith('/actions/preview')){chosen=JSON.parse(r.postData());assert.equal(chosen.operation,'nvr_channel_enable');previewed++;return void send({id:'fixture-plan',preview:{titleFa:'قطع و وصل کانال تصویر NVR',effectFa:`کانال ${Number(chosen.channel)+1} تغییر می‌کند؛ برق و آرشیو حذف نمی‌شود.`,cameraName:camera.name,host:camera.host,connectorInvoked:false}});}
 if(p.endsWith('/execute')){const body=JSON.parse(r.postData());assert.equal(body.intent,'execute');assert.equal(body.confirmed,true);channels[Number(chosen.channel)].enabled=chosen.value==='true';writes++;return void send({status:'succeeded',connectorInvoked:true,verified:true});}
 if(r.method()!=='GET')errors.push('Unexpected fixture mutation');return void send({});
});
async function button(text){assert.ok(await page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);b?.click();return Boolean(b);},text));}
try{
 await page.setViewport({width:1440,height:1000});await page.goto('http://main-nginx/firewall/assets/cameras/recorders/'+camera.id,{waitUntil:'networkidle0'});await page.click('#nvr-tab-channels');await page.waitForSelector('.nvr-channel-control__grid article');assert.equal(writes,0);
 for(const width of [1440,390,320]){await page.setViewport({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`/out/${theme}-nvr-channels-${width}.png`,fullPage:true});}
 await button('پیش‌نمایش غیرفعال‌کردن');await page.waitForSelector('.nvr-confirm');assert.equal(writes,0);assert.equal(previewed,1);await button('تأیید و اعمال در NVR');await page.waitForSelector('.nvr-success');assert.equal(writes,1);assert.equal(channels[0].enabled,false);assert.equal((await page.$$('.nvr-channel-control__grid .is-disabled')).length,2);
 await button('پیش‌نمایش فعال‌کردن');await page.waitForSelector('.nvr-confirm');await button('تأیید و اعمال در NVR');await page.waitForSelector('.nvr-channel-control__grid .is-enabled');assert.equal(writes,2);
 role='viewer';await page.reload({waitUntil:'networkidle0'});await page.click('#nvr-tab-channels');await page.waitForSelector('.nvr-channel-control__grid article');assert.equal((await page.$$('.nvr-channel-control__grid button')).length,0);
 unsupported=true;await page.reload({waitUntil:'networkidle0'});await page.click('#nvr-tab-channels');await page.waitForSelector('.nvr-channel-control .camera-alert');assert.equal((await page.$$('.nvr-channel-control__grid article')).length,0);assert.deepEqual(errors,[]);
 console.log('Passed: actual-state channel UI, preview before fixture write, disable/re-enable, viewer read-only, unsupported state and 1440/390/320px without overflow.');
}finally{await browser.close();}
