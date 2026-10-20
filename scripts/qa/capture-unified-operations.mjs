// Synthetic, intercepted APIs only. Never submits configuration or uploads footage.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const theme=process.env.QA_APPEARANCE??'dark',base='http://host.docker.internal/firewall',errors=[];
let role='operator',allowed=['page:monitoring.overview','page:security.findings','page:assets.cameras'],writes=0,captures=0,unavailable=false;
const now=new Date().toISOString(),company={id:'qa-company',name:'شرکت مبنا',code:'QA',cameraCount:1,nvrCount:1};
const camera={id:'qa-nvr',name:'ضبط‌کنندهٔ مرکزی',kind:'nvr',host:'192.168.18.50',companyId:company.id,company,profiles:[],status:'verified',connectionMode:'onvif',onvifPort:80,monitoringEnabled:false,credentialsConfigured:true};
const rows=Array.from({length:4},(_,i)=>({id:'qa-'+i,name:['سرور اصلی','روتر شعبه','سوییچ طبقهٔ دوم','تجهیز بدون جمع‌آور'][i],host:'192.0.2.'+(i+1),vendor:['linux','mikrotik','cisco','generic'][i],status:'online',coverage:{state:['fresh','stale','failed','unsupported'][i],observedAt:i===0?now:null},resources:{rows:['cpu.usage_percent','memory.usage_percent','disk.usage_percent','datastore.usage_percent'].map((metricKey,n)=>({metricKey,value:i===0?92-n*10:null,fresh:i===0}))},issues:i===0?[{id:'qa-issue',title:'مصرف بالای پردازنده',category:'resource_health',severity:'high',lastSeen:now}]:[],issuesMayBeTruncated:false}));
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage();
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(value=>{localStorage.setItem('eosnet.appearance',value);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const p=u.pathname.slice('/firewall-api'.length),send=(value,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(value)});
 if(!['GET','HEAD'].includes(r.method())){writes++;return void send({error:'SYNTHETIC_WRITE_FORBIDDEN'},405);}
 if(p==='/auth/session-status')return void send({user:{id:'qa',username:'qa',displayName:'اپراتور آزمایش',role,allowedSections:allowed}});
 if(p==='/product-state/navigation')return void send({navigation:[]});if(p==='/auth/csrf')return void send({csrfToken:'synthetic'});
 if(p==='/monitoring/operations')return void send(unavailable?{error:'unavailable'}:{total:4,page:0,pageSize:12,generatedAt:now,devices:rows},unavailable?503:200);
 if(p==='/cameras/companies')return void send({companies:[company],unassigned:{cameraCount:0,nvrCount:0}});
 if(p==='/cameras')return void send({cameras:[camera]});if(p==='/vpn')return void send({available:true,splitOnly:true,profiles:[]});
 if(p==='/cameras/qa-nvr')return void send({camera});if(p.endsWith('/monitor'))return void send({monitoringEnabled:false,intervalSeconds:300,history:[],sensors:[],report:null});
 return void send({});
});
async function capture(name){await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');await page.screenshot({path:`/out/${theme}-unified-${name}.png`,fullPage:true});captures++;}
try{
 for(const width of [1440,390,320]){await page.setViewport({width,height:1000});await page.goto(base+'/monitoring',{waitUntil:'networkidle0'});await page.waitForSelector('.operations-device');assert.equal(await page.$$('.operations-device').then(items=>items.length),4);assert.equal(await page.$$('.operations-monitoring__flow li').then(items=>items.length),3);assert.ok(await page.$('a[href$="/security/findings/qa-issue"]'));await capture('monitor-'+width);}
 unavailable=true;await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.operations-monitoring [role=alert]');await capture('unavailable');unavailable=false;
 allowed=['page:assets.cameras'];
 for(const width of [1440,390,320]){await page.setViewport({width,height:900});await page.goto(base+'/assets/cameras',{waitUntil:'networkidle0'});await page.waitForSelector('.camera-recorder-entry a');assert.equal(await page.$('.topbar-create'),null);await capture('camera-only-'+width);}
 await page.click('.camera-recorder-entry a');await page.waitForSelector('dialog .camera-form select');assert.ok(page.url().includes('/assets/cameras/register/nvr'));await capture('company-selection');await page.click('dialog .camera-form button[type=submit],dialog .camera-form .camera-button--primary');await page.waitForSelector('dialog .camera-tabs');await capture('nvr-registration');await page.keyboard.press('Escape');
 await page.goto(base+'/assets/cameras/recorders/qa-nvr',{waitUntil:'networkidle0'});await page.waitForSelector('.nvr-device-hero');assert.ok(await page.$('.nvr-device-actions button'));await capture('camera-only-nvr');
 role='viewer';await page.goto(base+'/assets/cameras',{waitUntil:'networkidle0'});await page.waitForSelector('.camera-company-card');assert.equal(await page.$('.camera-recorder-entry'),null);await capture('viewer-no-add');
 await page.goto(base+'/assets/cameras/recorders/qa-nvr',{waitUntil:'networkidle0'});await page.waitForSelector('.nvr-device-hero');assert.equal(await page.$('.nvr-device-actions button'),null);await capture('viewer-nvr');
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,theme,captures,runtimeErrors:0,writes,scope:'synthetic intercepted APIs only'}));
}catch(error){await page.screenshot({path:`/out/${theme}-unified-failure.png`,fullPage:true});throw error;}finally{await browser.close();}
