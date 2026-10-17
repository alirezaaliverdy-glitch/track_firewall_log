// Synthetic transport only: no device/provider call or production write.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const base=process.env.QA_BASE_URL||'http://host.docker.internal/firewall';
const page=await browser.newPage(); await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(()=>{try{localStorage.setItem('firewall-log-analyzer.locale','fa');}catch{}});
const errors=[], confirmations=[]; let fail=true, captures=0, quick=false;
page.on('pageerror',error=>errors.push(error.message));
const now=new Date().toISOString();
const device={id:'response-fixture-device',name:'سرور آزمایشی',vendor:'linux',host:'192.0.2.114',type:'linux_edge',protocol:'ssh',credentialConfigured:true};
const plan={id:'response-fixture-plan',source:'detection',deviceId:device.id,device,actionType:'linux_block_ip',status:'dry_run_ready',lifecycleState:'ready_for_confirmation',riskLevel:'high',createdAt:now,updatedAt:now,
  parametersJson:{ipAddress:'203.0.113.8',durationMinutes:60,metadata:{catalogTitleFa:'محدودسازی مبدأ',planRevision:1}},validationJson:{valid:true},
  support:{state:'verified',execution:'connector',executable:true},controls:{canReview:true,canConfirm:true,canExecute:false,canEditParameters:false,canPreview:false},
  commandPreview:{plannedCommands:['fixture: deny source 203.0.113.8 for 60 minutes']},evidence:{connectorInvoked:false},approvalRequirements:{typedApprove:true,breakGlass:false,reason:false},resultJson:null};
await page.setRequestInterception(true);
page.on('request',request=>{
  const url=new URL(request.url());if(!url.pathname.startsWith('/firewall-api/'))return void request.continue();
  const path=url.pathname.replace(/^\/firewall-api(?:\/api)?/,''), respond=(value,status=200)=>request.respond({status,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/auth/session-status')return respond({authenticated:true,user:{id:'response-user',username:'fixture-admin',displayName:'مدیر آزمایشی',role:'admin',allowedSections:['actions']}});
  if(path==='/auth/csrf')return respond({csrfToken:'fixture-csrf'});
  if(path==='/product-state/navigation')return respond({navigation:[]});
  if(path===`/action-center/${plan.id}`)return respond({...plan,connectorResult:plan.resultJson});
  if(path===`/actions/${plan.id}`)return respond(plan);
  if(path===`/actions/${plan.id}/quick-execute`){const input=JSON.parse(request.postData());assert.equal(input.intent,'execute');assert.equal(request.headers()['x-csrf-token'],'fixture-csrf');confirmations.push(input);
    if(!quick)assert.equal(input.approvalConfirmation,'APPROVE');else{assert.equal(input.approvalConfirmation,undefined);assert.equal(input.breakGlass,undefined);}
    if(fail){fail=false;return respond({error:'SYNTHETIC_EXECUTION_REJECTED',detail:'ارتباط آزمایشی برقرار نشد؛ دوباره تلاش کن.'},409);}
    plan.status='succeeded';plan.lifecycleState='succeeded';plan.evidence.connectorInvoked=true;plan.parametersJson.metadata.connectorInvoked=true;
    plan.resultJson={executed:true,connectorInvoked:true,durationMs:25,commands:[{template:'fixture registered block',stdout:'fixture proof',stderr:'',exitCode:0}]};return respond(plan);
  }
  if(path==='/action-center')return respond({items:[plan],total:1,offset:0,limit:25,summary:{ready_for_confirmation:1}});
  if(path==='/devices')return respond({devices:[device]});
  if(path==='/credentials')return respond({credentials:[]});
  if(path==='/auth/sessions')return respond({sessions:[]});
  if(path.includes('commands'))return respond({items:[]});
  return respond({});
});
async function capture(name){await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name} overflow`);await page.screenshot({path:`/out/${name}.png`,fullPage:!await page.$('.execution-review__confirm')});captures++;}
async function review(){
  await page.waitForSelector('.operator-handoff .operator-execute');
  await page.$eval('.operator-handoff .operator-execute',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await page.locator('.operator-handoff .operator-execute').click();
  await page.waitForSelector('.execution-review__confirm');
}
async function confirm(){
  assert.equal(await page.$eval('.execution-review__confirm',el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!hit && el.contains(hit);
  }),true,'confirmation must be above the mobile navigation');
  if(page.viewport().hasTouch)await page.tap('.execution-review__confirm');
  else await page.locator('.execution-review__confirm').click();
}
try{
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(`${base}/actions/${plan.id}/result`,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.textContent.includes('اقدام هنوز اجرا نشده است'));await capture('response-mobile-preview-not-execution');
  await page.goto(`${base}/actions/${plan.id}`,{waitUntil:'networkidle0'});await review();
  assert.equal(await page.$eval('.execution-review__confirm',el=>el.disabled),true);await page.type('.execution-review__parameters input[autocomplete=off]','APPROVE');
  assert.equal(await page.$eval('.execution-review__confirm',el=>el.disabled),false);await capture('response-mobile-policy-confirmation');await confirm();
  await page.waitForFunction(()=>document.body.textContent.includes('ارتباط آزمایشی برقرار نشد'));assert.ok(new URL(page.url()).pathname.endsWith(`/actions/${plan.id}`),'rejection must stay in review, not an empty result page');await capture('response-mobile-real-rejection');
  await review();await page.type('.execution-review__parameters input[autocomplete=off]','APPROVE');await confirm();
  await page.waitForFunction(()=>location.pathname.endsWith('/result'));await page.waitForFunction(()=>document.body.textContent.includes('دستور با موفقیت روی دستگاه اجرا شد'));await capture('response-mobile-verified-result');
  quick=true;plan.status='dry_run_ready';plan.lifecycleState='ready_for_confirmation';plan.resultJson=null;plan.evidence.connectorInvoked=false;plan.parametersJson.metadata.connectorInvoked=false;plan.approvalRequirements={typedApprove:false,breakGlass:false,reason:false};
  await page.setViewport({width:1440,height:1000});await page.goto(`${base}/actions/${plan.id}`,{waitUntil:'networkidle0'});await review();
  assert.equal(await page.$('.execution-review__parameters input[autocomplete=off]'),null,'quick-controlled mode needs no extra approval input');await capture('response-quick-single-confirmation');await confirm();await page.waitForFunction(()=>location.pathname.endsWith('/result'));
  assert.equal(confirmations.length,3);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,captures,confirmations:confirmations.length,runtimeErrors:errors.length,scope:'synthetic only'}));
}catch(error){await page.screenshot({path:'/out/response-qa-failure.png',fullPage:true});console.log(JSON.stringify({confirmations:confirmations.length,runtimeErrors:errors,url:new URL(page.url()).pathname,alerts:await page.$$eval('[role=alert]',nodes=>nodes.map(node=>node.textContent))}));throw error;}finally{await browser.close();}
