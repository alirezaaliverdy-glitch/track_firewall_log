import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {writeFile,rm} from 'node:fs/promises';
const theme=process.env.QA_APPEARANCE??'dark',errors=[],browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage();let captures=0,imports=0,saves=0,connects=0,role='admin';const profiles=[];
const sample='client\ndev tun\nproto tcp-client\nremote vpn.example.test 443\nauth-user-pass\n<ca>\n-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n</ca>\n';
await writeFile('/tmp/eosnet-openvpn-qa.ovpn',sample);await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const path=u.pathname.slice('/firewall-api'.length),send=(v,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(v)});
 if(path==='/auth/session-status')return void send({authenticated:true,user:{id:'qa',username:'qa',displayName:'مدیر آزمایش',role,allowedSections:['assets']}});
 if(path==='/auth/csrf')return void send({csrfToken:'fixture'});
 if(path==='/product-state/navigation')return void send({navigation:[]});
 if(path==='/companies')return void send({companies:[{id:'qa-company',name:'شرکت آزمایش',code:'QA',deletedAt:null,_count:{devices:0,assets:0}}]});
 if(path==='/cameras/companies')return void send({companies:[{id:'qa-company',name:'شرکت آزمایش',code:'QA',description:null,cameraCount:0,nvrCount:0}],unassigned:{cameraCount:0,nvrCount:0}});
 if(path==='/cameras')return void send({cameras:[]});
 if(path==='/devices')return void send({devices:[]});
 if(path==='/credentials')return void send({credentials:[]});
 if(path==='/vendors/connection-methods')return void send({profiles:[]});
 if(path.startsWith('/device-onboarding/sessions'))return void send({id:'qa-onboarding',status:'draft',draft:{companyId:'qa-company',vendor:'linux',platform:'linux',connectionMethod:'ssh',name:'',host:'',managementPort:22,credentialId:'',enableCredentialId:'',site:'',location:'',environment:'lab',vpnConnectionId:''},test:null,detection:null,discovery:null,preview:null,result:null});
 if(path==='/vpn'&&r.method()==='GET')return void send({available:true,openvpnReady:true,l2tpReady:true,splitOnly:true,profiles});
 if(path==='/vpn/import/openvpn'){imports++;const data=JSON.parse(r.postData());assert.equal(data.openvpnProfile,sample);return void send({endpoint:'vpn.example.test',endpointPort:443,transport:'tcp4-client',authUserPass:true});}
 if(path==='/vpn'&&r.method()==='POST'){saves++;const data=JSON.parse(r.postData());assert.equal(data.openvpnProfile,sample);assert.deepEqual(data.routes,['192.168.18.0/24']);assert.equal(data.password,'synthetic-only');profiles.push({id:'fixture',revision:'r1',name:data.name,protocol:'openvpn',endpoint:'vpn.example.test',endpointPort:443,routesJson:data.routes,runtime:{state:'disconnected'}});return void send({id:'fixture'},201);}
 if(path==='/vpn/fixture/connect'){const data=JSON.parse(r.postData());assert.equal(data.intent,'execute');assert.equal(data.confirmed,true);connects++;profiles[0].runtime.state='connected';profiles[0].desiredConnected=true;return void send({state:'connected'});}
 return void send({});
});
const button=async(selector,text)=>{for(const h of await page.$$(selector))if((await h.evaluate(e=>e.textContent)).includes(text)){await h.click();return;}assert.fail('Missing button '+text);};
const capture=async name=>{await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('dialog[open]')].some(d=>d.scrollWidth>d.clientWidth+1)),false);await page.screenshot({path:`/out/${theme}-${name}.png`,fullPage:true});captures++;};
try{
 await page.setViewport({width:1440,height:1000});await page.goto('http://host.docker.internal/firewall/tools/vpn',{waitUntil:'networkidle0'});await button('.vpn-heading button','افزودن اتصال');await page.waitForSelector('.vpn-form');await capture('protocol-chooser');
 await button('.vpn-protocols button','OpenVPN');await capture('openvpn-empty-desktop');assert.equal(connects,0);
 const file=await page.$('.vpn-import input');await file.uploadFile('/tmp/eosnet-openvpn-qa.ovpn');await page.waitForFunction(()=>document.querySelector('input[readonly]')?.value==='vpn.example.test');await capture('imported-desktop');
 assert.equal(imports,1);assert.equal(connects,0);await page.type('.vpn-form input[required][maxlength]','شبکهٔ شعبه');const fields=await page.$$('.vpn-form-grid input');
 await fields[2].type('fixture-user');await fields[3].type('synthetic-only');
 await page.setViewport({width:390,height:844});await capture('imported-mobile');await page.setViewport({width:320,height:740});await capture('imported-320');
 await page.click('.vpn-form button[type=submit]');await page.waitForSelector('.vpn-card');assert.equal(saves,1);assert.equal(connects,0);await capture('saved-card-320');
 await page.click('.vpn-card .camera-button--primary');await page.waitForSelector('.vpn-confirm');await capture('confirm-mobile');assert.equal(connects,0);await page.click('.vpn-confirm .camera-button--primary');await page.waitForFunction(()=>document.querySelector('.vpn-card')?.textContent.includes('اتصال دائم'));assert.equal(connects,1);await capture('connected-mobile');
 await page.setViewport({width:1440,height:1000});await capture('connected-desktop');
 await page.setViewport({width:390,height:844});await page.goto('http://host.docker.internal/firewall/assets/cameras?company=qa-company',{waitUntil:'networkidle0'});await page.waitForSelector('.camera-heading-actions .camera-button--primary');await page.click('.camera-heading-actions .camera-button--primary');await page.waitForSelector('.vpn-access-field select');await page.select('.vpn-access-field select','fixture');assert.ok(await page.$eval('.vpn-access-field option:checked',e=>e.textContent.includes('OpenVPN')));await capture('camera-openvpn-access');
 await page.goto('http://host.docker.internal/firewall/assets/devices/new',{waitUntil:'networkidle0'});await page.waitForSelector('.vpn-access-field select');await page.select('.vpn-access-field select','fixture');assert.ok(await page.$eval('.vpn-access-field option:checked',e=>e.textContent.includes('OpenVPN')));await capture('device-openvpn-access');
 role='viewer';await page.goto('http://host.docker.internal/firewall/tools/vpn',{waitUntil:'networkidle0'});assert.equal(await page.$('.vpn-heading .camera-button--primary'),null);await capture('viewer');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,theme,captures,imports,saves,connects,runtimeErrors:errors.length,scope:'synthetic intercepted APIs only; no customer tunnel'}));
}finally{await browser.close();await rm('/tmp/eosnet-openvpn-qa.ovpn',{force:true});}
