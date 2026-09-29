import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire("/app/package.json");
const puppeteer=require("puppeteer-core");
const browser=await puppeteer.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox","--disable-dev-shm-usage"]});
try {
  const page=await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({width:1440,height:900});
  await page.evaluateOnNewDocument(()=>localStorage.setItem("i18nextLng","fa"));
  const errors=[]; const writes=[]; const healthPages=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request",async request=>{
    const url=new URL(request.url());
    if(!url.pathname.startsWith("/firewall-api/")&&!url.pathname.startsWith("/api/")) {
      if(url.hostname==="main-nginx"||url.protocol==="data:") return request.continue();
      return request.abort();
    }
    if(request.method()!=="GET") writes.push(url.pathname);
    let body={};
    if(url.pathname.endsWith("/auth/session-status")) body={user:{id:"test",username:"test",displayName:"Test",role:"admin",allowedSections:["assets","actions","dashboard","monitoring","security"]}};
    else if(url.pathname.endsWith("/auth/csrf")) body={csrfToken:"fixture"};
    else if(url.pathname.endsWith("/product-state/navigation")) body={contractVersion:"test",navigation:[]};
    else if(url.pathname.endsWith("/dashboard/device-health")) {
      const p=Number(url.searchParams.get("page")??0); healthPages.push(p);
      const now=new Date().toISOString();
      const points=Array.from({length:16},(_,i)=>({timestamp:new Date(Date.now()-(16-i)*120000).toISOString(),value:15+i%4*8,unit:"percent"}));
      const device=(id,connection,checkedAt,rows,score)=>({id,name:id,vendor:id.split("-")[0],host:"192.0.2.10",connection,checkedAt,collecting:false,score,measuredResources:rows.length,rows,charts:{cpu:rows.length?points:[],memory:rows.length?points:[],availability:[{timestamp:now,value:connection==="online"?1:0,unit:"state"}],traffic:{interface:"ether1",method:"counter_delta",rx:rows.length?points.map(p=>({...p,value:p.value/20,unit:"Mbps"})):[],tx:[],}}});
      body={total:13,pageSize:12,page:p,collectionIntervalSeconds:120,generatedAt:now,devices:p===0?[
        device("linux-one","online",now,[{metricKey:"cpu.usage_percent",value:17,unit:"percent",measuredAt:now,fresh:true}],100),
        device("cisco-two","online",now,[{metricKey:"cpu.usage_percent",value:54,unit:"percent",measuredAt:now,fresh:true}],100),
        device("sophos-three","online",now,[],null),
        device("fortigate-four","offline",now,[{metricKey:"cpu.usage_percent",value:90,unit:"percent",measuredAt:new Date(Date.now()-600000).toISOString(),fresh:false}],25)
      ]:[device("esxi-five","online",now,[],null)]};
    }
    const known=url.pathname.endsWith("/auth/session-status")||url.pathname.endsWith("/auth/csrf")||url.pathname.endsWith("/product-state/navigation")||url.pathname.endsWith("/dashboard/device-health")||url.pathname.endsWith("/assets")||url.pathname.endsWith("/security/findings");
    return request.respond({status:known?200:503,contentType:"application/json",body:JSON.stringify(body)});
  });
  await page.goto("http://main-nginx/firewall/dashboard",{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".fleet-health-grid article",{timeout:15000}).catch(async()=>{throw new Error(`Fleet panel did not render. Errors: ${errors.join(" | ")}; body: ${(await page.$eval("body",el=>el.textContent))?.slice(0,300)}`);});
  assert.equal(await page.$$eval(".fleet-health-grid article",items=>items.length),4);
  const text=await page.$eval(".fleet-health",el=>el.textContent);
  for(const vendor of ["linux","cisco","sophos","fortigate"]) assert.ok(text.includes(vendor),vendor);
  assert.ok(text.includes("هنوز نمونهٔ معتبر نداریم"));
  assert.equal(await page.$$eval(".fleet-metric",items=>items.length),16);
  assert.ok(await page.$$eval(".highcharts-container",items=>items.length)>=4);
  const sidebarBefore=await page.$eval(".platform-sidebar",el=>el.getBoundingClientRect().top);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await new Promise(resolve=>setTimeout(resolve,200));
  const sidebarAfter=await page.$eval(".platform-sidebar",el=>el.getBoundingClientRect().top);
  assert.ok(Math.abs(sidebarBefore-sidebarAfter)<2,`Sidebar moved: ${sidebarBefore} -> ${sidebarAfter}`);
  await page.evaluate(()=>window.scrollTo(0,0));
  for(const width of [1440,390,320]) {
    await page.setViewport({width,height:900});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await page.$eval(".fleet-health",el=>el.scrollWidth<=el.clientWidth+2),true,`overflow ${width}`);
  }
  await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
  assert.equal(await page.$eval(".fleet-metric.is-live",el=>getComputedStyle(el,"::after").animationName),"none");
  assert.ok(!text.includes("NaN"));
  assert.equal(await page.$eval(".fleet-health",el=>el.scrollWidth<=el.clientWidth+2),true);
  if(process.env.FLEET_SCREENSHOT_PATH){
    await page.setViewport({width:1440,height:900});
    await page.$eval(".fleet-health",el=>el.scrollIntoView({block:"start"}));
    await page.screenshot({path:process.env.FLEET_SCREENSHOT_PATH});
  }
  await page.$$eval(".fleet-pages button",buttons=>buttons[1].click());
  await page.waitForFunction(()=>document.querySelector(".fleet-health-grid")?.textContent?.includes("esxi-five"));
  assert.deepEqual(healthPages.slice(0,2),[0,1]);
  assert.deepEqual(writes,[]);
  assert.deepEqual(errors,[]);
  console.log("Fleet charts/browser regression passed: 4 mini charts per vendor, actual Highcharts, sticky sidebar, 1440/390/320px, reduced motion, pagination, no writes.");
} finally {await browser.close();}
