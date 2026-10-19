import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const theme=process.env.QA_APPEARANCE??'dark';
const contract=await readFile('/workspace/src/lib/pageAccess.ts','utf8');
const pages=[...contract.matchAll(/^  \["([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)"\]/gm)].map(([,key,group,route,titleFa,titleEn])=>({key,group,route,titleFa,titleEn,state:'implemented'}));
assert.equal(pages.length,23);
const grants=pages.map(p=>'page:'+p.key),selected=['page:assets.cameras','page:tools.vpn'];
let role='admin',allowed=grants,fallback=false,writes=0,captures=0;
const now=new Date().toISOString(),users=[],errors=[];
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setBypassServiceWorker(true);
page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();
 const path=u.pathname.slice('/firewall-api'.length),send=(body,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/auth/session-status')return void send({user:{id:'qa',username:'qa',displayName:'کاربر آزمایش',role,allowedSections:allowed}});
 if(path==='/auth/csrf')return void send({csrfToken:'fixture'});
 if(path==='/auth/sessions')return void send({sessions:[]});
 if(path==='/admin/users'&&r.method()==='GET')return void send({users,catalog:{sections:grants,roles:[]}});
 if(path.startsWith('/admin/users')&&['POST','PATCH'].includes(r.method())){const input=JSON.parse(r.postData());assert.deepEqual([...input.allowedSections].sort(),[...selected].sort());writes++;const user={...input,id:'created',isActive:true,effectivePermissions:[],activeSessionCount:0,lastSeenAt:null,createdAt:now,updatedAt:now};users.splice(0,users.length,user);return void send({user});}
 if(path==='/product-state/navigation')return void send({navigation:fallback?[]:[...new Set(pages.map(p=>p.group))].map(group=>({key:group,titleFa:group,titleEn:group,iconKey:group,route:pages.find(p=>p.group===group).route,items:pages.filter(p=>p.group===group)}))});
 if(path==='/cameras/companies')return void send({companies:[],unassigned:{cameraCount:0,nvrCount:0}});
 if(path==='/cameras')return void send({cameras:[]});
 if(path==='/vpn')return void send({available:true,splitOnly:true,profiles:[]});
 return void send({});
});
const button=async(selector,label)=>{for(const h of await page.$$(selector))if((await h.evaluate(e=>e.textContent)).includes(label)){await h.click();return;}assert.fail('Missing button '+label);};
const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`/out/${theme}-${name}.png`,fullPage:true});captures++;};
const assertMenu=async()=>{
 const paths=await page.$$eval('.platform-sidebar__nav a',elements=>elements.map(e=>new URL(e.href).pathname.replace('/firewall','')));
 assert.deepEqual(paths.sort(),['/assets/cameras','/tools/vpn']);
 assert.equal(await page.$('.topbar-create'),null);
 assert.equal(await page.$('.topbar-account__menu a[href$="/settings"]'),null);
};
try{
 await page.setViewport({width:1440,height:1000});await page.goto('http://host.docker.internal/firewall/settings',{waitUntil:'networkidle0'});
 await page.click('.users-toolbar__actions .primary-button');await page.waitForSelector('.user-editor');
 await page.type('.user-editor input[placeholder="sara.ops"]','camera.operator');await page.type('.editor-fields label:nth-child(2) input','اپراتور دوربین');await page.type('.user-editor input[autocomplete="new-password"]','Synthetic-only-2026');
 await button('.access-presets button','فقط دوربین و VPN');assert.equal(await page.$$eval('.section-selector input:checked',e=>e.length),2);if(theme==='light')assert.equal(await page.$eval('.user-editor > header',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');await capture('viewer-page-selection-desktop');
 await page.setViewport({width:390,height:844});await capture('page-selection-mobile');await page.setViewport({width:320,height:740});await capture('page-selection-320');
 await page.click('.user-editor button[type=submit]');await page.waitForFunction(()=>!document.querySelector('.user-editor'));assert.equal(writes,1);
 await page.waitForSelector('.users-list .user-edit');await page.$eval('.users-list .user-edit',e=>e.scrollIntoView({block:'center'}));await page.click('.users-list .user-edit');await page.waitForSelector('.user-editor');assert.equal(await page.$$eval('.section-selector input:checked',e=>e.length),2);await capture('saved-selection-mobile');await page.keyboard.press('Escape');
 for(const nextRole of ['viewer','operator']){role=nextRole;allowed=selected;
  for(const width of [1440,390]){await page.setViewport({width,height:900});await page.goto('http://host.docker.internal/firewall/tools/vpn',{waitUntil:'networkidle0'});await assertMenu();assert.equal(await page.$('.vpn-help a[href$="/assets/devices/new"]'),null);await capture(nextRole+'-vpn-'+width);
   if(width===390)assert.deepEqual((await page.$$eval('.platform-bottom-nav a',els=>els.map(e=>new URL(e.href).pathname.replace('/firewall','')))).sort(),['/assets/cameras','/tools/vpn']);
  }
  await page.goto('http://host.docker.internal/firewall/settings',{waitUntil:'networkidle0'});assert.match(page.url(),/assets\/cameras/);await assertMenu();assert.equal(await page.$('.settings-hub'),null);
  await page.goto('http://host.docker.internal/firewall/assets/devices/new',{waitUntil:'networkidle0'});assert.match(page.url(),/assets\/cameras/);
 }
 fallback=true;await page.goto('http://host.docker.internal/firewall/tools/vpn',{waitUntil:'networkidle0'});await assertMenu();await capture('filtered-fallback-navigation');
 allowed=['page:tools.vpn'];await page.goto('http://host.docker.internal/firewall/assets/cameras',{waitUntil:'networkidle0'});assert.match(page.url(),/tools\/vpn/);assert.deepEqual(await page.$$eval('.platform-sidebar__nav a',els=>els.map(e=>new URL(e.href).pathname.replace('/firewall',''))),['/tools/vpn']);await capture('vpn-only');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,theme,captures,writes,runtimeErrors:errors.length,scope:'synthetic intercepted APIs only'}));
}catch(error){await page.screenshot({path:`/out/${theme}-failure.png`,fullPage:true});throw error;}finally{await browser.close();}
