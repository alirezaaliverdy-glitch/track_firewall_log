// Synthetic UI acceptance only; all application APIs are intercepted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const puppeteer=createRequire('/app/package.json')('puppeteer-core');
const theme=process.env.QA_APPEARANCE??'dark',now=new Date().toISOString(),errors=[];
const device={id:'qa-linux',name:'سرور آزمایشی دفتر',vendor:'linux',type:'linux_edge',host:'192.0.2.20'};
const query={source:'auto',scope:'nginx',text:'fixture'},parameters={logQuery:JSON.stringify(query),liveLogFingerprint:'SHA256:synthetic-preview-key',liveLogFirstTrust:true,metadata:{catalogCommandId:'linux.live-logs',planRevision:1,executionTemplateRef:'linux_live_log_query',connectorType:'linux-ssh',vendor:'linux'}};
const plan={id:'qa-live-plan',deviceId:device.id,device,actionType:'linux_read_auth_logs',riskLevel:'low',status:'dry_run_ready',source:'user',parametersJson:parameters,validationJson:{valid:true},dryRunJson:{plannedCommands:['read-only fixture'],requiresApproval:true},approvalJson:null,resultJson:null,createdAt:now,updatedAt:now};
let streams=0,execute=0,stops=0,emit=1,closed=false;
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage();
await page.setBypassServiceWorker(true);page.on('pageerror',e=>errors.push(e.message));await page.evaluateOnNewDocument(theme=>{localStorage.setItem('eosnet.appearance',theme);localStorage.setItem('firewall-log-analyzer.locale','fa');},theme);
page.on('console',async m=>{if(m.type()==='error')for(const arg of m.args()){const value=await arg.evaluate(v=>v instanceof Error?v.stack:String(v)).catch(()=>m.text());errors.push(value);}});
await page.setRequestInterception(true);page.on('request',async r=>{
 const u=new URL(r.url());if(!u.pathname.startsWith('/firewall-api/'))return void r.continue();const p=u.pathname.slice('/firewall-api'.length),send=(body,status=200)=>r.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 if(p==='/auth/session-status')return void send({authenticated:true,user:{id:'qa-user',username:'qa',displayName:'اپراتور آزمایشی',role:'operator',allowedSections:['page:dashboard.overview','page:actions.center']}});
 if(p==='/auth/csrf')return void send({csrfToken:'fixture'});if(p==='/product-state/navigation')return void send({navigation:[]});
 if(p==='/assets')return void send({assets:[{id:'qa-asset',name:device.name,managementIp:device.host,healthState:'healthy',availability:'online',managedState:'managed',device,vendor:{name:'Linux'}}],summary:{}});
 if(p==='/security/findings')return void send({findings:[]});if(p==='/dashboard/device-health')return void send({devices:[],total:0,pageSize:10});if(p==='/dashboard/traffic')return void send({devices:[],generatedAt:now});
 if(p==='/dashboard/activity')return void send({generatedAt:now,summary:{activeDevices:1,recentExecutions:0,successfulActions:0,failedActions:0,pendingApprovals:0,recentDeviceRegistrations:0,latestConfigurationChanges:0},recentExecutions:[],successfulActions:[],failedActions:[],pendingApprovals:[],recentDeviceRegistrations:[],latestConfigurationChanges:[]});
 if(p==='/monitoring/linux/summary')return void send({total:0,healthy:0,warning:0,critical:0,offline:0,stale:0,unknown:0,devices:[]});if(p==='/security/monitoring/status')return void send({running:true,lastCycleAt:now,tickSeconds:5,collectors:{devices:[],configured:0,succeeded:0,failed:0},coverage:{assessedAt:now,summary:{total:0,fresh:0,gaps:0},devices:[]}});
 if(p==='/commands/ai-propose'){assert.equal(JSON.parse(r.postData()).deviceId,device.id);return void send({mode:'executable_action_plan',actionPlanId:plan.id,actionPlan:plan,liveLogQuery:query,resolution:{catalogItem:{titleFa:'پایش زندهٔ لاگ'}}});}
 if(p===`/actions/${plan.id}/dry-run`)return void send(plan);
 if(p===`/actions/${plan.id}/quick-execute`){assert.equal(JSON.parse(r.postData()).intent,'execute');execute++;closed=false;return void send({...plan,status:'succeeded',resultJson:{executed:true,connectorInvoked:true,parsedResult:{sessionId:'qa-stream'}}});}
 if(p===`/actions/${plan.id}`)return void send(plan);
 if(p==='/commands/live-logs/qa-stream/stop'){closed=true;stops++;return void send({status:'closed'});}
 if(p==='/commands/live-logs/qa-stream'){
  streams++;await new Promise(resolve=>setTimeout(resolve,300));const cursor=Number(u.searchParams.get('cursor')??0),events=cursor<emit?Array.from({length:emit-cursor},(_,i)=>({sequence:cursor+i+1,receivedAt:now,deviceTime:i%2?null:now,source:'fixture-api.service',priority:i%2?3:6,message:i%2?'fixture: connection refused password=[REDACTED]':'fixture GET /health 200 · نمونهٔ آزمایشی <script>alert(1)</script>'})):[];
  return void send({status:closed?'closed':'live',reason:closed?'پایش به درخواست شما متوقف شد.':'',deviceName:device.name,deviceHost:device.host,query,sources:[{id:'0',label:'/var/log/nginx/access.log',kind:'file',status:'live',observed:0,matched:0,lastReceivedAt:null},{id:'1',label:'/var/log/nginx/virtual-host-with-long-name.access.log',kind:'file',status:'live',observed:emit+20,matched:emit,lastReceivedAt:now},{id:'2',label:'docker:abcdef123456:edge-proxy',kind:'docker',status:'failed',observed:0,matched:0,lastReceivedAt:null}],inventoryComplete:true,events,cursor:events.at(-1)?.sequence??cursor,observed:emit+20,matched:emit,dropped:0,gap:false,warnings:['یک منبع قابل خواندن نیست؛ پوشش کامل نیست.'],serverTime:now,expiresAt:new Date(Date.now()+1800000).toISOString()});
 }
 return void send({});
});
try{
 for(const width of [1440,390,320]){
  emit=2;closed=false;await page.setViewport({width,height:1000});await page.goto('http://main-nginx/firewall/dashboard',{waitUntil:'networkidle0'});await page.waitForSelector('#dashboard-action-device');await page.select('#dashboard-action-device',device.id);await page.type('#dashboard-action-request','لاگ nginx شامل «fixture»');await page.click('.dashboard-action-composer button[type="submit"]');await page.waitForSelector('.linux-live-preview');
  assert.equal(execute,width===1440?0:width===390?1:2,'preview never executes');await page.$eval('.linux-live-preview',el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:`/out/${theme}-live-log-preview-${width}.png`,fullPage:false});
  await page.click('.linux-live-preview button');await page.waitForSelector('.linux-live-logs__console article');await page.waitForFunction(()=>document.querySelectorAll('.linux-live-logs__console article').length===2);
  assert.equal(await page.$eval('.linux-live-logs__console',el=>el.querySelectorAll('script').length),0,'log text is never HTML');await page.$eval('.linux-live-logs',el=>el.scrollIntoView({block:'center'}));
  await page.$$eval('.linux-live-logs__sources',els=>els.forEach(el=>el.open=true));assert.equal(await page.$$eval('.linux-live-logs__sources>div',els=>els.length),3);assert.ok(await page.$$eval('.linux-live-logs__sources',els=>els.some(el=>el.textContent.includes('متوقف / خطا'))));
  await page.screenshot({path:`/out/${theme}-live-log-coverage-${width}.png`,fullPage:false});await page.$$eval('.linux-live-logs__sources',els=>els.forEach(el=>el.open=false));await page.$eval('.linux-live-logs',el=>el.scrollIntoView({block:'center'}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');await page.screenshot({path:`/out/${theme}-live-log-window-${width}.png`,fullPage:false});
  await page.click('.linux-live-logs__toolbar button:not(.linux-live-logs__stop)');emit=3;await new Promise(resolve=>setTimeout(resolve,900));assert.equal(await page.$$eval('.linux-live-logs__console article',els=>els.length),2,'pause only freezes view');await page.click('.linux-live-logs__toolbar button:not(.linux-live-logs__stop)');await page.waitForFunction(()=>document.querySelectorAll('.linux-live-logs__console article').length===3);
  await page.type('.linux-live-logs__toolbar input','connection refused');assert.equal(await page.$$eval('.linux-live-logs__console article',els=>els.length),1);await page.click('.linux-live-logs__stop');await page.waitForFunction(()=>document.querySelector('.linux-live-logs__status').textContent.includes('متوقف'));
 }
 assert.equal(execute,3);assert.equal(stops,3);assert.ok(streams>3);assert.deepEqual(errors,[]);console.log('Passed: one confirmed log start, query/device preview, literal safe rendering, live data, pause/resume/search/stop, desktop/mobile both-theme fixture.');
}catch(e){console.error(JSON.stringify({errors,url:page.url(),text:await page.evaluate(()=>document.body.innerText.slice(0,900))}));await page.screenshot({path:`/out/${theme}-live-log-failure.png`});throw e;}finally{await browser.close();}
