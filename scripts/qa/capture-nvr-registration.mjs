import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json'),puppeteer=require('puppeteer-core');
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage(),theme=process.env.QA_APPEARANCE||'dark',errors=[];let submitted=0;
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const url=new URL(r.url());if(!url.pathname.startsWith('/firewall-api/'))return void r.continue();const p=url.pathname.slice('/firewall-api'.length);
 const send=(body,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 if(p==='/auth/session-status')return void send({authenticated:true,user:{id:'fixture',username:'fixture',displayName:'اپراتور آزمایش',role:'operator',allowedSections:['page:assets.cameras']}});
 if(p==='/auth/csrf')return void send({csrfToken:'fixture'});
 if(p==='/product-state/navigation')return void send({navigation:[]});
 if(p==='/cameras/companies')return void send({companies:[{id:'fixture-company',name:'شرکت آزمایشی',code:'QA',cameraCount:0,nvrCount:0}],unassigned:{cameraCount:0,nvrCount:0}});
 if(p==='/vpn')return void send({available:true,profiles:[]});
 if(p==='/cameras'&&r.method()==='POST'){const input=JSON.parse(r.postData());assert.equal(input.connectionMode,'auto');assert.equal(input.host,'192.168.210.50');assert.equal(input.companyId,'fixture-company');submitted++;return void send({error:{code:'CAMERA_ALREADY_REGISTERED'}},409);}
 if(r.method()!=='GET')errors.push('Unexpected fixture mutation');return void send({});
});
try{
 await page.setViewport({width:1440,height:1000});await page.goto('http://main-nginx/firewall/assets/devices/new?vendor=nvr',{waitUntil:'networkidle0'});
 await page.waitForSelector('dialog[open] select');await page.$eval('dialog[open] form',form=>form.requestSubmit());await page.waitForSelector('.nvr-registration-guide');
 assert.equal(await page.$('.camera-form select option[value=auto]'),null,'protocol is not a required choice');
 for(const width of [1440,390,320]){await page.setViewport({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.$eval('dialog[open]',el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`/out/${theme}-nvr-register-${width}.png`,fullPage:true});}
 await page.click('.nvr-registration-advanced input');await page.waitForSelector('select option[value=auto]');assert.equal(await page.$eval('select:has(option[value=auto])',el=>el.value),'auto');await page.click('.nvr-registration-advanced input');
 await page.type('input[placeholder="192.168.18.50"]','192.168.210.50');await page.$eval('dialog[open] form',form=>form.requestSubmit());await page.waitForSelector('.camera-alert');assert.equal(submitted,1);assert.deepEqual(errors,[]);
 console.log('Passed: camera-only operator NVR registration, automatic default, optional advanced settings, 1440/390/320px, duplicate feedback; fixture only.');
}finally{await browser.close();}
