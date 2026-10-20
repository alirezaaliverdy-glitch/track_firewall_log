// Intercepted synthetic APIs only. No actual login, device write or command execution.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const theme=process.env.QA_APPEARANCE??'dark',base='http://host.docker.internal/firewall',errors=[];
const now=new Date().toISOString(),device={id:'qa-device',name:'سرور دفتر مرکزی',vendor:'linux',host:'192.0.2.20'};
const finding={id:'qa-finding',deviceId:device.id,device,title:'Account: sensitive privileged command',summary:'A named account executed a privileged command that can change access, services, firewall rules, or system availability. Review the command and its authorization.',vendor:'linux',severity:'high',category:'account-privileged-activity',status:'active',count:1,confidence:.9,source:'seeded_detection_rule',firstSeen:now,lastSeen:now,actor:'operator1',rawRefsJson:['qa-event'],mitreTags:['T1548.003'],recommendedActions:[]};
let monitorUnavailable=false,coverageState='stale',writes=0,captures=0;
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage();
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
await page.setRequestInterception(true);page.on('request',r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const p=u.pathname.slice('/firewall-api'.length);
 const send=(value,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(value)});
 if(!['GET','HEAD'].includes(r.method())){writes++;return void send({error:'NO_MUTATION_IN_FIXTURE'},405);}
 if(p==='/auth/session-status')return void send({authenticated:true,user:{id:'qa-user',username:'qa',displayName:'مدیر آزمایش',role:'admin',allowedSections:['dashboard','assets','security','actions','monitoring']}});
 if(p==='/product-state/navigation')return void send({navigation:[]});if(p==='/auth/csrf')return void send({csrfToken:'synthetic'});
 if(p==='/assets')return void send({assets:[{id:'asset',name:device.name,healthState:'warning',availability:'online',managedState:'managed',managementIp:device.host,lastSeenAt:now,device:{...device,type:'linux_edge'},vendor:{name:'Linux'}}],summary:{}});
 if(p==='/security/findings')return void send({findings:[finding]});
 if(p==='/dashboard/device-health')return void send({devices:[],total:0,pageSize:10});if(p==='/dashboard/traffic')return void send({devices:[],generatedAt:now});
 if(p==='/dashboard/activity')return void send({generatedAt:now,summary:{activeDevices:1,recentExecutions:0,successfulActions:0,failedActions:0,pendingApprovals:1,recentDeviceRegistrations:0,latestConfigurationChanges:0},recentExecutions:[],successfulActions:[],failedActions:[],pendingApprovals:[],recentDeviceRegistrations:[],latestConfigurationChanges:[]});
 if(p==='/monitoring/linux/summary')return void send({total:0,healthy:0,warning:0,critical:0,offline:0,stale:0,unknown:0,devices:[]});
 if(p==='/security/monitoring/status')return void send(monitorUnavailable?{error:'UNAVAILABLE'}:{running:true,tickSeconds:5,lastCycleAt:now,collectors:{devices:[],configured:1,succeeded:999,failed:0},coverage:{assessedAt:now,scope:'configured-checks-only',dashboardRefreshSeconds:5,automaticRemediation:false,summary:{total:1,fresh:coverageState==='fresh'?1:0,gaps:coverageState==='fresh'?0:1},devices:[{deviceId:device.id,deviceName:device.name,vendor:'linux',state:coverageState,observedAt:coverageState==='fresh'?now:new Date(Date.now()-3600000).toISOString(),eventRuleCount:5,snapshotRuleCount:5,dailyCheck:'implemented',profileState:'implemented',officialGuide:null}]}},monitorUnavailable?503:200);
 if(p===`/security/findings/${finding.id}`)return void send(finding);
 if(p.endsWith('/decision'))return void send({mode:'investigate',evidenceScore:55,evidenceLabelFa:'شواهد محدود',deviceCount:1,referenceCount:1,resolvedReferenceCount:1,supportingReferenceCount:1,authSuccessCount:0,explanationFa:'اجرای دستور حساس ثبت شده است؛ ابتدا مجوز فعالیت را بررسی کنید.',nextStepFa:'نام حساب و فرمان را با اقدام تأییدشده مقایسه کنید.',signals:[],suggestedAction:{kind:'diagnostic',labelFa:'بررسی وضعیت فعلی تجهیز',labelEn:'Review device state'}});
 if(p.endsWith('/campaign'))return void send({sourceCount:0,observedEvents:1,start:now,end:now,sources:[],partial:false});
 return void send({});
});
async function capture(name,selector){await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');if(selector)await(await page.$(selector)).screenshot({path:`/out/${theme}-response-${name}.png`});else await page.screenshot({path:`/out/${theme}-response-${name}.png`,fullPage:true});captures++;}
try{
 for(const width of [1440,390,320]){
  await page.setViewport({width,height:1000});await page.goto(base+'/dashboard',{waitUntil:'networkidle0'});await page.waitForSelector('.operational-health');
  const text=await page.$eval('.dashboard-command-center',el=>el.textContent);assert.equal(text.includes(finding.title),false);assert.equal(text.includes('موتور تشخیص'),false);assert.ok(text.includes('اجرای دستور حساس با دسترسی مدیریتی'));
  assert.equal(await page.$eval('.operational-health',el=>el.textContent.includes('999')),false,'never compare cumulative runs with device inventory');
  await capture('dashboard-'+width,width===1440?'.command-overview-grid':undefined);
  await page.click('.operational-health a[href="#monitoring-coverage"]');assert.equal(await page.$eval('#monitoring-coverage',el=>el.open),true);assert.ok(await page.$eval('.operational-health',el=>el.textContent.includes('داده قدیمی')));await capture('coverage-'+width,'.operational-health');
  await page.goto(base+'/security/findings/'+finding.id,{waitUntil:'networkidle0'});await page.waitForSelector('.finding-next-step');assert.equal(await page.$eval('.finding-review h1',el=>el.textContent),'اجرای دستور حساس با دسترسی مدیریتی');assert.equal(await page.$$eval('.finding-resolution-steps>li',els=>els.length),4);assert.ok(await page.$eval('.finding-next-step',el=>el.textContent.includes('این مرحله چیزی را اجرا نمی‌کند')));await capture('workflow-'+width,'.finding-review');
 }
 coverageState='fresh';await page.goto(base+'/dashboard',{waitUntil:'networkidle0'});await page.waitForSelector('.operational-health');assert.ok(await page.$eval('.operational-health__rows',el=>el.textContent.includes('۱ / ۱')));
 monitorUnavailable=true;await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.operational-health__notice');assert.ok(await page.$eval('.operational-health',el=>el.textContent.includes('آخرین داده، وضعیت فعلی را تضمین نمی‌کند')));await capture('unavailable');
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,theme,captures,runtimeErrors:0,writes,scope:'synthetic APIs only'}));
}catch(error){console.log(JSON.stringify({ok:false,theme,errors,captures,body:await page.$eval('body',el=>el.textContent.slice(0,1000))}));await page.screenshot({path:`/out/${theme}-response-failure.png`,fullPage:true});throw error;}finally{await browser.close();}
