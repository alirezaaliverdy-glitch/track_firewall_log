import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire("/app/package.json");
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("i18nextLng", "fa"));
  const errors = [], writes = [], pages = [];
  let revision = 0, mode = "fresh";
  const vendors = ["linux", "cisco", "mikrotik", "fortigate", "sophos", "esxi"];
  const points = (value, label) => Array.from({length:12}, (_,i) => ({timestamp:new Date(Date.now()-(11-i)*120000-(mode==="stale"?600000:0)).toISOString(),value:value+i%3+revision,label,unit:"percent"}));
  const workspace = id => {
    const now = new Date().toISOString(), vendor = id.split("-")[0];
    const cpu = mode==="empty"?[]:points(18,"cpu.usage_percent"), memory = mode==="empty"?[]:points(31,"memory.usage_percent");
    return { reference:id,device:{id,name:id,vendor,host:"192.0.2.10",managementPort:22,protocol:"ssh",environment:"lab",tags:[],status:"online",credentialConfigured:true},
      asset:null,overview:{name:id,vendor,platform:vendor,availability:"online",healthScore:100,healthState:"healthy",verificationStatus:"verified",pendingActions:0,lastSuccessfulCollection:now,lastContact:now,configBackup:{}},
      vendor:{key:vendor,sections:[]},vendorOverview:{collectedAt:now,summary:[],sections:[]},capabilities:null,health:null,findings:[],actions:[],audit:[],collections:[],connections:[],sensors:[],
      statusChecks:[{status:"online",checkedAt:now}],traffic:{interface:"ether1",method:"counter_delta",rx:mode==="empty"?[]:points(2).map(p=>({...p,value:p.value/10,unit:"Mbps"})),tx:mode==="empty"?[]:points(1).map(p=>({...p,value:p.value/10,unit:"Mbps"}))},
      charts:{resources:[...cpu,...memory],availability:mode==="empty"?[]:points(1).map(p=>({...p,value:1,unit:"state"})),healthScore:[],connectorResults:[],findings:[],actions:[],recentChanges:[]}};
  };
  await page.setRequestInterception(true);
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/firewall-api/") && !url.pathname.startsWith("/api/")) return url.hostname==="main-nginx"||url.protocol==="data:" ? request.continue() : request.abort();
    if (request.method()!=="GET") writes.push(url.pathname);
    let body = {}, known = true;
    if (url.pathname.endsWith("/auth/session-status")) body={user:{id:"fixture",username:"test",displayName:"Test",role:"admin",allowedSections:["assets","actions","dashboard","monitoring","security"]}};
    else if (url.pathname.endsWith("/auth/csrf")) body={csrfToken:"fixture"};
    else if (url.pathname.endsWith("/product-state/navigation")) body={contractVersion:"test",navigation:[]};
    else if (url.pathname.endsWith("/dashboard/device-health")) {
      const p=Number(url.searchParams.get("page")??0), now=new Date().toISOString(); pages.push(p);
      body={total:13,pageSize:12,page:p,collectionIntervalSeconds:120,generatedAt:now,devices:(p?["esxi-last"]:vendors.map(v=>v+"-one")).map(id=>({id,name:id,vendor:id.split("-")[0],host:"192.0.2.10",connection:"online",checkedAt:now,collecting:false,score:id.startsWith("esxi")?null:100,rows:id.startsWith("esxi")?[]:[{metricKey:"cpu.usage_percent",value:19,unit:"percent",measuredAt:now,fresh:true},{metricKey:"memory.usage_percent",value:32,unit:"percent",measuredAt:now,fresh:true}]}))};
    } else if (url.pathname.includes("/device-workspaces/")) body=workspace(decodeURIComponent(url.pathname.split("/").at(-1)));
    else if (url.pathname.endsWith("/assets")||url.pathname.endsWith("/security/findings")) body={};
    else known=false;
    return request.respond({status:known?200:503,contentType:"application/json",body:JSON.stringify(body)});
  });
  await page.goto("http://main-nginx/firewall/dashboard",{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".fleet-summary-dial");
  assert.equal(await page.$$eval(".fleet-summary-dial",items=>items.length),6);
  assert.equal(await page.$$eval(".fleet-health .highcharts-container",items=>items.length),0);
  assert.ok((await page.$eval(".fleet-health",el=>el.textContent)).includes("منتظر دادهٔ معتبر"));
  const top=await page.$eval(".platform-sidebar",el=>el.getBoundingClientRect().top);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  assert.ok(Math.abs(top-await page.$eval(".platform-sidebar",el=>el.getBoundingClientRect().top))<2);
  for(const width of [1440,390,320]){
    await page.setViewport({width,height:1000});
    assert.ok(await page.$eval(".fleet-health",el=>el.scrollWidth<=el.clientWidth+2));
  }
  await page.$$eval(".fleet-pages button",items=>items[1].click());
  await page.waitForFunction(()=>document.querySelector(".fleet-health-grid")?.textContent?.includes("esxi-last"));
  assert.deepEqual(pages.slice(0,2),[0,1]);
  for(const vendor of vendors){
    mode="fresh";
    await page.goto("http://main-nginx/firewall/assets/devices/"+vendor+"-one/overview",{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".asset-live-grid .highcharts-container");
    assert.equal(await page.$$eval(".asset-live-metric",items=>items.length),4);
    assert.equal(await page.$$eval(".asset-live-grid .highcharts-container",items=>items.length),4);
    assert.equal(await page.$$eval(".asset-overview-trends__grid",items=>items.length),0);
    assert.equal(await page.$eval(".asset-device-overview",el=>el.firstElementChild.className),"asset-overview-trends");
    assert.ok(await page.$eval(".asset-live-grid",el=>el.textContent.includes("مصرف حافظه")));
  }
  for(const width of [1440,1024,390,320]){
    await page.setViewport({width,height:1000});
    await new Promise(r=>setTimeout(r,150));
    assert.ok(await page.$eval(".asset-overview-trends",el=>el.scrollWidth<=el.clientWidth+2),"detail overflow "+width);
  }
  await page.$eval(".asset-live-toolbar button",el=>el.click());
  await page.waitForFunction(()=>document.querySelector(".asset-mini-plot")?.dataset.animated==="false");
  assert.equal(await page.$eval(".asset-live-freshness.is-current i",el=>getComputedStyle(el).animationName),"none");
  await page.$eval(".asset-live-toolbar button",el=>el.click());
  await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
  await page.waitForFunction(()=>document.querySelector(".asset-mini-plot")?.dataset.animated==="false");
  assert.equal(await page.$eval(".asset-live-metric",el=>getComputedStyle(el).animationName),"none");
  await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"no-preference"}]);
  await page.waitForFunction(()=>document.querySelector(".asset-mini-plot")?.dataset.animated==="true");
  await page.evaluate(()=>window.fixtureChart=document.querySelector(".asset-mini-plot .highcharts-container"));
  revision=12;
  await page.waitForFunction(()=>document.querySelector(".asset-live-reading")?.textContent.includes("۳۲"),{timeout:12000});
  assert.ok(await page.evaluate(()=>window.fixtureChart===document.querySelector(".asset-mini-plot .highcharts-container")),"chart remounted on poll");
  if(process.env.FLEET_SCREENSHOT_PATH){
    await page.setViewport({width:1440,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:process.env.FLEET_SCREENSHOT_PATH});
  }
  mode="stale";
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector(".asset-live-grid");
  assert.ok(await page.$eval(".asset-live-grid",el=>el.textContent.includes("تاریخی / تأییدنشده")));
  assert.equal(await page.$$eval(".asset-mini-plot[data-animated=true]",items=>items.length),0);
  mode="empty";
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector(".asset-live-empty");
  assert.equal(await page.$$eval(".asset-live-empty",items=>items.length),4);
  assert.equal(await page.$$eval(".asset-live-grid .highcharts-container",items=>items.length),0);
  assert.ok(!await page.$eval(".asset-live-grid",el=>el.textContent.includes("NaN")));
  assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
  console.log("Passed: summary rings, six vendor detail charts, early placement, 1440/1024/390/320px, live updates, motion toggle/reduced motion, stale/empty data, pagination and no writes.");
} finally { await browser.close(); }
