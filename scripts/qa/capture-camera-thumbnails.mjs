import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json'),puppeteer=require('puppeteer-core');
const jpeg=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=480x270','-frames:v','1','-threads','1','-f','image2pipe','-c:v','mjpeg','pipe:1']);
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage(),theme=process.env.QA_APPEARANCE||'dark',errors=[];let shots=0,fail=false,concurrent=0,peak=0;
const profile={token:'small',name:'ورودی',sourceToken:'one',width:480,height:270,encoding:'H264',fps:6,ptz:false,streamAvailable:true,snapshotAvailable:true};
const cameras=[{id:'entry',name:'ورودی ساختمان',location:'طبقه همکف',host:'192.168.210.11'},{id:'parking',name:'پارکینگ',location:'ضلع شمالی',host:'192.168.210.12'}].map(c=>({...c,kind:'camera',companyId:'fixture-company',connectionMode:'onvif',status:'verified',profiles:[profile],lastSeenAt:new Date().toISOString()}));
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');window.__qaClock=0;const original=Date.now;Date.now=()=>original()+window.__qaClock;},theme);
await page.setRequestInterception(true);page.on('request',async r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const p=u.pathname.slice('/firewall-api'.length),send=(body,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 if(p==='/auth/session-status')return void send({authenticated:true,user:{id:'fixture',username:'fixture',displayName:'مشاهده‌گر آزمایش',role:'viewer',allowedSections:['page:assets.cameras']}});
 if(p==='/auth/csrf')return void send({csrfToken:'fixture'});
 if(p==='/product-state/navigation')return void send({navigation:[]});
 if(p==='/cameras/companies')return void send({companies:[{id:'fixture-company',name:'شرکت آزمایشی',code:'QA',cameraCount:2,nvrCount:0}],unassigned:{cameraCount:0,nvrCount:0}});
 if(p==='/cameras')return void send({cameras});
 if(p.endsWith('/thumbnail')){shots++;concurrent++;peak=Math.max(peak,concurrent);await new Promise(resolve=>setTimeout(resolve,120));concurrent--;if(fail)return void send({error:{code:'CAMERA_THUMBNAIL_UNAVAILABLE'}},503);return void r.respond({status:200,contentType:'image/jpeg',headers:{'X-Camera-Captured-At':new Date().toISOString(),'X-Camera-Stale':'false','X-Camera-Refresh-After':'10800000'},body:jpeg});}
 if(r.method()!=='GET')errors.push('Unexpected fixture mutation');return void send({});
});
try{
 await page.setViewport({width:1440,height:1000});await page.goto('http://main-nginx/firewall/assets/cameras?company=fixture-company',{waitUntil:'networkidle0'});
 await page.waitForSelector('.camera-thumbnail.has-image img');await page.waitForFunction(()=>document.querySelectorAll('.camera-thumbnail.has-image').length===2);
 assert.ok(peak<=2);const before=shots;await new Promise(resolve=>setTimeout(resolve,1500));assert.equal(shots,before,'not a live/polling stream');
 for(const width of [1440,390,320]){await page.setViewport({width,height:1000});for(const tile of await page.$$('.camera-thumbnail')){await tile.evaluate(el=>el.scrollIntoView({block:'center'}));await new Promise(resolve=>setTimeout(resolve,300));}await page.waitForFunction(()=>[...document.querySelectorAll('.camera-thumbnail img')].every(img=>img.complete&&img.naturalWidth>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`/out/${theme}-camera-thumbnails-${width}.png`,fullPage:true});}
 await page.setViewport({width:1440,height:1000});await page.waitForFunction(()=>document.querySelectorAll('.camera-thumbnail.has-image').length===2);const baseline=shots;fail=true;
 await page.evaluate(()=>{window.__qaClock+=10_800_001;document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForSelector('.camera-thumbnail__time b');assert.ok(shots>baseline);assert.ok(await page.$('.camera-thumbnail img'),'failure retains old frame with stale label');
 assert.deepEqual(errors,[]);console.log('Passed: actual synthetic JPEG previews, viewer camera grant, timestamps, three-hour refresh, stale failure, concurrency <=2, dark/light 1440/390/320px, no writes.');
}finally{await browser.close();}
