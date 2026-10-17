import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const base=process.env.QA_BASE_URL||'http://host.docker.internal/firewall';
const errors=[];let writes=0, role='admin', captures=0;
const now=new Date().toISOString();
const health=['Linux-01','Router-01','Linux-02'].map((name,i)=>({id:`d${i}`,name,vendor:i===1?'mikrotik':'linux',host:`192.0.2.${10+i}`,connection:'online',checkedAt:now,collecting:false,score:90-i*8,rows:['cpu.usage_percent','memory.usage_percent',...(i===1?[]:['disk.usage_percent'])].map((metricKey,j)=>({metricKey,value:[24,61,92][j]-i*6,unit:'percent',measuredAt:now,fresh:true}))}));
health[2].connection='offline';
const camera={id:'c1',name:'دوربین ورودی',host:'192.0.2.40',kind:'camera',location:'ورودی ساختمان',profiles:[{token:'main',sourceToken:'source',name:'Main',width:1280,height:720,encoding:'H264',streamAvailable:true}],status:'verified',lastSeenAt:now,credentialsConfigured:true,connectionMode:'onvif',infoJson:{Manufacturer:'Synthetic',Model:'Fixture'}};
async function setup(page){
  await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',request=>{
    const path=new URL(request.url()).pathname;
    if(!path.startsWith('/firewall-api/'))return void request.continue();
    if(!['GET','HEAD'].includes(request.method()))writes++;
    const api=path.replace(/^\/firewall-api(?:\/api)?/,'');
    const respond=value=>request.respond({status:200,contentType:'application/json',body:JSON.stringify(value)});
    if(api==='/auth/session-status')return void respond({authenticated:true,user:{id:'theme-fixture',username:'qa',displayName:'مدیر آزمایش',role,allowedSections:['dashboard','assets','security','actions','settings']}});
    if(api==='/auth/csrf')return void respond({csrfToken:'synthetic-only'});
    if(api==='/admin/users')return void respond({users:[],catalog:{roles:[],sections:[]}});
    if(api==='/auth/sessions')return void respond({sessions:[]});
    if(api==='/product-state/navigation')return void respond({navigation:[]});
    if(api==='/dashboard/device-health')return void respond({devices:health,total:3,pageSize:10});
    if(api==='/dashboard/traffic')return void respond({generatedAt:now,devices:[]});
    if(api==='/dashboard/activity')return void respond({generatedAt:now,summary:{activeDevices:3,recentExecutions:0,successfulActions:0,failedActions:0,pendingApprovals:0,recentDeviceRegistrations:0,latestConfigurationChanges:0},recentExecutions:[],successfulActions:[],failedActions:[],pendingApprovals:[],recentDeviceRegistrations:[],latestConfigurationChanges:[]});
    if(api==='/monitoring/linux/summary')return void respond({devices:[],warning:0,critical:0,offline:0,stale:0,unknown:0});
    if(api==='/security/monitoring/status')return void respond({running:true,lastCycleAt:now,collectors:{configured:0,succeeded:0,failed:0,devices:[]}});
    if(api==='/assets')return void respond({assets:[],summary:{}});
    if(api==='/security/findings')return void respond({findings:[]});
    if(api==='/cameras')return void respond({cameras:[camera,{...camera,id:'nvr',name:'ضبط‌کننده اصلی',kind:'nvr',host:'192.0.2.41'},{...camera,id:'error',name:'پارکینگ',status:'error',lastSeenAt:null,lastErrorCode:'CAMERA_TIMEOUT'}]});
    if(api.endsWith('/actions'))return void respond({actions:[]});
    if(api.endsWith('/presets'))return void respond({presets:[]});
    if(api==='/vpn')return void respond({profiles:[],helper:{available:false,protocols:[]}});
    void respond({});
  });
}
async function capture(page,name){
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: overflow`);
  await page.screenshot({path:`/out/${name}.png`,fullPage:true});captures++;
}
async function checkTextContrast(page,selector){
  const ratios=await page.$$eval(selector,nodes=>nodes.map(node=>{
    const rgb=getComputedStyle(node).color.match(/[\d.]+/g).slice(0,3).map(Number);
    const linear=rgb.map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    return 1.05/(linear[0]*.2126+linear[1]*.7152+linear[2]*.0722+.05);
  }));
  assert.ok(ratios.length>0);assert.ok(ratios.every(ratio=>ratio>=4.5),`${selector}: text contrast on white`);
}
const page=await browser.newPage();await setup(page);
try{
  await page.setViewport({width:1440,height:1000});
  await page.goto(`${base}/settings?tab=appearance`,{waitUntil:'networkidle0'});
  await page.waitForSelector('.appearance-settings');
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'dark');
  await capture(page,'appearance-dark-settings');
  await page.click('.appearance-option--light');
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'light');
  assert.equal(await page.evaluate(()=>localStorage.getItem('eosnet.appearance')),'light');
  assert.equal(await page.$eval('body',el=>getComputedStyle(el).backgroundColor),'rgb(244, 246, 251)');
  await capture(page,'appearance-light-settings');
  await checkTextContrast(page,'.appearance-settings h2,.appearance-settings p');
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'light','reload persists');
  const peer=await browser.newPage();await setup(peer);await peer.goto(`${base}/settings?tab=appearance`,{waitUntil:'networkidle0'});
  await peer.click('.appearance-option--dark');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await peer.click('.appearance-option--light');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await peer.close();
  await page.goto(`${base}/dashboard`,{waitUntil:'networkidle0'});await page.waitForSelector('.fleet-device');
  await capture(page,'appearance-light-dashboard');
  assert.ok(await page.$eval('.fleet-device',el=>getComputedStyle(el).backgroundImage.includes('gradient')));
  assert.ok(await page.$eval('.fleet-summary-dial',el=>getComputedStyle(el).backgroundImage.includes('conic-gradient')),'light health gauge is visible');
  assert.notEqual(await page.$eval('.fleet-summary-dial',el=>getComputedStyle(el,'::before').display),'none','gauge center is rendered');
  assert.equal(await page.$eval('.fleet-device:last-child .fleet-summary-dial',el=>el.style.getPropertyValue('--fleet-health-angle')),'0deg','offline score is not fabricated');
  await page.goto(`${base}/assets/cameras`,{waitUntil:'networkidle0'});await page.waitForSelector('.camera-device-card');
  await capture(page,'appearance-light-cameras');
  await checkTextContrast(page,'.camera-device-card__kind,.camera-status,.camera-device-card__ip');
  await page.click('.camera-device-card .camera-icon-button');await page.waitForSelector('dialog[open]');await capture(page,'appearance-light-camera-dialog');await page.keyboard.press('Escape');
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await capture(page,'appearance-light-mobile-cameras');
  await page.goto(`${base}/settings?tab=appearance`,{waitUntil:'networkidle0'});await capture(page,'appearance-light-mobile-settings');
  await page.setViewport({width:320,height:740,isMobile:true,hasTouch:true});await capture(page,'appearance-light-small-settings');
  await page.focus('input[value="light"]');await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'dark','native radio keyboard selection');
  await page.goto(`${base}/assets/cameras`,{waitUntil:'networkidle0'});await capture(page,'appearance-dark-mobile-cameras');
  role='viewer';await page.goto(`${base}/settings?tab=appearance`,{waitUntil:'networkidle0'});await page.waitForSelector('.appearance-settings');await page.click('.appearance-option--light');
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'light','viewer can choose theme');
  await capture(page,'appearance-viewer-settings');
  await page.evaluate(()=>localStorage.setItem('firewall-log-analyzer.locale','en'));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.appearance-settings');
  assert.equal(await page.$eval('#appearance-title',el=>el.textContent),'Appearance');
  await page.setViewport({width:1440,height:1000});await page.waitForSelector('.appearance-option--dark');await capture(page,'appearance-english-settings');
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage denied','SecurityError');};});
  await page.click('.appearance-option--dark');
  assert.equal(await page.$eval('html',el=>el.dataset.theme),'dark');
  assert.match(await page.$eval('.appearance-saved',el=>el.textContent),/does not allow saving/);
  assert.equal(writes,0,'theme selection must not mutate server data');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,captures,runtimeErrors:errors.length,writes,checks:['default dark','light palette/text contrast','reload','cross-tab','keyboard','viewer','desktop/mobile/320px','dialog','English','blocked storage'],data:'synthetic only'}));
}finally{await browser.close();}
