// Deployed-browser acceptance with intercepted API: no live vendor calls or writes.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const browser=await puppeteer.launch({executablePath:"/usr/bin/chromium-browser",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const now=new Date().toISOString(),prior=new Date(Date.now()-60000).toISOString();
const facts={version:"7.0.3",build:"18644231",model:"Test Host",cpuPercent:25,memoryPercent:50,cpuCores:8,memoryBytes:8589934592,maintenanceMode:false,
  datastores:[{name:"Main datastore",capacityBytes:1024**3*100,freeBytes:1024**3*40,accessible:true}],
  physicalNics:[{name:"vmnic0",linkUp:true,speedMb:1000}],vmkernelNics:[{name:"vmk0",ip:"192.0.2.10"}],virtualSwitches:[{name:"vSwitch0",ports:128}],
  portGroups:[{name:"Management Network",vlanId:10,vSwitch:"vSwitch0"}],services:[{label:"NTP Daemon",key:"ntpd",running:true,policy:"on"}],
  storageAdapters:[],firewallRulesets:[],sensors:[],dns:{servers:["192.0.2.53"]},time:{ntpServers:["ntp.example.test"]},
  coverage:["datastores","nics","vmkernel","switches","portgroups","services"].map(key=>({key,status:"available"}))};
const device={id:"test-esxi",name:"Test ESXi",vendor:"esxi",type:"server",host:"192.0.2.10",managementPort:22,protocol:"ssh",environment:"lab",status:"online",credentialConfigured:true,tags:[],createdAt:now,updatedAt:now};
const workspace={reference:device.id,device,asset:null,overview:{name:device.name,vendor:"esxi",platform:"esxi",version:"7.0.3",site:null,location:null,managementIp:device.host,availability:"online",healthScore:null,healthState:"unknown",connectorState:"connected",connectorType:"esxi-ssh",lastContact:now,lastSuccessfulCollection:now,findingsBySeverity:{},pendingActions:0,recentChanges:[],configBackup:{},verificationStatus:"verified"},statusChecks:[],health:null,findings:[],actions:[],audit:[],capabilities:{connectorType:"esxi-ssh",facts,capabilities:[],warnings:[],refreshedAt:now},collections:[],connections:[],sensors:[],traffic:{interface:"vmnic0",method:"counter_delta",rx:[{timestamp:prior,value:1},{timestamp:now,value:2}],tx:[{timestamp:prior,value:2},{timestamp:now,value:3}]},charts:{healthScore:[],connectorResults:[],availability:[{timestamp:prior,value:1},{timestamp:now,value:1}],resources:[{timestamp:prior,value:25,label:"cpu.usage_percent",unit:"percent"},{timestamp:now,value:25,label:"cpu.usage_percent",unit:"percent"}],findings:[],actions:[],recentChanges:[]},vendor:{key:"esxi",sections:[]},vendorOverview:{vendorKey:"esxi",collectedAt:now,source:"verified_connector",summary:[],sections:[]},vendorDetails:null};
try {
  for(const width of [1440,390,320]) {
    const page=await browser.newPage();await page.setViewport({width,height:1000});
    let reads=0,writes=0;const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request",req=>{
      const path=new URL(req.url()).pathname;
      if(!path.includes("/api/")&&!path.startsWith("/firewall-api/"))return req.continue();
      if(req.method()!=="GET")writes++;
      let body={};
      if(path.endsWith("/auth/me")||path.endsWith("/auth/session-status"))body={ok:true,authenticated:true,user:{id:"ui-test",username:"test",displayName:"Test",role:"admin",allowedSections:["dashboard","assets","security","monitoring","actions","assistant","attackers"]}};
      else if(path.includes("/device-workspaces/")){reads++;body=workspace;}
      else if(path.endsWith("/companies"))body={companies:[]};
      else if(path.endsWith("/devices"))body={devices:[device]};
      else if(path.endsWith("/product-state/navigation"))body={contractVersion:"1",navigation:[]};
      else if(path.includes("verification"))body={attempts:[]};
      req.respond({status:200,contentType:"application/json",body:JSON.stringify(body)});
    });
    await page.goto("http://main-nginx/firewall/assets/devices/test-esxi/overview",{waitUntil:"networkidle0"});
    await page.waitForSelector(".esxi-host",{timeout:20000});
    assert.equal(await page.$$(".esxi-host").then(v=>v.length),1);
    assert.equal(await page.$$(".asset-vendor-overview").then(v=>v.length),0);
    assert.equal(await page.$$(".esxi-host details[open]").then(v=>v.length),0);
    assert.equal(await page.$$(".esxi-host__groups details").then(v=>v.length),9);
    await page.evaluate(()=>{const el=document.querySelector(".esxi-host details");el.open=true;window.testEsxiDetails=el;});
    const firstReads=reads;
    await page.waitForFunction(()=>document.querySelector(".esxi-host details")?.open && document.querySelector(".esxi-host details").isConnected);
    await new Promise(resolve=>setTimeout(resolve,6000));
    assert.ok(reads>firstReads,"Workspace polling still works");
    assert.equal(await page.evaluate(()=>document.querySelector(".esxi-host details")===window.testEsxiDetails && window.testEsxiDetails.open),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,"No page overflow");
    assert.equal(await page.$eval(".esxi-host footer a",el=>el.getAttribute("href")),"/firewall/assets/devices/test-esxi/setup");
    workspace.device.protocol="api";workspace.capabilities.connectorType="esxi-soap";
    workspace.overview.availability="offline";facts.cpuPercent=null;
    await page.reload({waitUntil:"networkidle0"});await page.waitForSelector(".esxi-host");
    assert.equal(await page.$eval(".esxi-host footer a",el=>el.getAttribute("href")),"/firewall/actions?deviceId=test-esxi");
    assert.equal(await page.$eval(".esxi-host__stats article strong",el=>el.textContent),"نامشخص");
    assert.match(await page.$eval(".esxi-host__notice",el=>el.textContent),/تأیید نشده/);
    assert.deepEqual(errors,[]);assert.equal(writes,0);
    workspace.device.protocol="ssh";workspace.capabilities.connectorType="esxi-ssh";workspace.overview.availability="online";facts.cpuPercent=25;
    console.log(JSON.stringify({width,hostPanel:true,pollingStable:true,noOverflow:true,noWrites:true,apiActionLink:true,offlineAndUnknownExplicit:true}));
    await page.close();
  }
}finally{await browser.close();}
