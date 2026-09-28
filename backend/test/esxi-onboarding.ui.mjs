// Run against the deployed web from a container with puppeteer-core/Chromium.
// All API requests are intercepted; no account or asset is created.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import {listConnectionProfiles} from "../dist/vendors/connection-method.registry.js";

const browser = await puppeteer.launch({executablePath:"/usr/bin/chromium-browser",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const fingerprintCommand = "/usr/lib/vmware/openssh/bin/ssh-keygen -l -f /etc/ssh/ssh_host_rsa_key.pub -E sha256";
try {
  for (const width of [1440,390,320]) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "clipboard", {configurable:true,value:{writeText:async text => { window.testCopiedCommand = text; }}});
    });
    await page.setViewport({width,height:1000});
    const errors = [];
    const paths = [];
    let session = null, testCalls = 0, commitCalls = 0, unverifiedCalls = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async req => {
      const path = new URL(req.url()).pathname;
      paths.push(path);
      if (!path.includes("/api/") && !path.startsWith("/firewall-api/")) return req.continue();
      let body = {};
      if (path.endsWith("/auth/me") || path.endsWith("/auth/session-status")) body = {ok:true,authenticated:true,user:{id:"test-user",username:"ui-test",displayName:"UI Test",role:"admin",allowedSections:["dashboard","assets","security","monitoring","actions","assistant","attackers"]}};
      else if (path.endsWith("/auth/csrf")) body = {token:"ui-test-only",csrfToken:"ui-test-only"};
      else if (path.endsWith("/product-state/navigation")) body = {contractVersion:"1",navigation:[]};
      else if (path.endsWith("/companies")) body = {companies:[{id:"test-company",name:"Test company",code:"TEST",deletedAt:null,_count:{devices:0,assets:0}}]};
      else if (path.endsWith("/credentials")) body = {credentials:[{id:"test-credential",name:"Test SSH",type:"password",username:"test",sudo:false}]};
      else if (path.endsWith("/vendors/connection-methods")) body = {profiles:listConnectionProfiles()};
      else if (path.endsWith("/device-onboarding/sessions")) {
        const input = JSON.parse(req.postData() || "{}");
        body = {id:"test-session",status:"draft",step:"vendor",draft:{companyId:"test-company",vendor:"linux",platform:"linux",connectionMethod:"ssh",name:"",host:"",managementPort:22,credentialId:"",enableCredentialId:"",site:"",location:"",environment:"lab",...input},test:null,detection:null,discovery:null,preview:null,result:null};
        session = body;
      } else if (path.includes("/device-onboarding/sessions/test-session")) {
        const action = path.split("/").at(-1);
        if (action === "answers") session = {...session,draft:JSON.parse(req.postData()),status:"answers_saved",test:null,detection:null,discovery:null,preview:null};
        if (action === "test") { testCalls++; session = {...session,status:"connection_verified",test:{connected:true,connectorInvoked:true}}; }
        if (action === "detect") session = {...session,status:"platform_detected",detection:{supported:true}};
        if (action === "discover") session = {...session,status:"discovery_completed",discovery:{connectorInvoked:true}};
        if (action === "preview") session = {...session,status:"preview_ready",preview:{device:session.draft}};
        if (action === "register-unverified") unverifiedCalls++;
        if (action === "commit") {
          commitCalls++;
          if (commitCalls === 1) {
            session = {...session,status:"save_failed",result:{error:"Simulated save failure"}};
            return req.respond({status:400,contentType:"application/json",body:JSON.stringify({error:{code:"ONBOARDING_COMMIT_BLOCKED",message:"Simulated save failure"}})});
          }
          session = {...session,status:"completed",result:{verificationStatus:"verified",connectorInvoked:true,connectionVerified:true}};
        }
        body = session;
      } else body = {devices:[],items:[],data:[],count:0};
      await req.respond({status:200,contentType:"application/json",body:JSON.stringify(body)});
    });
    await page.goto(process.env.WEB_TEST_URL || "http://main-nginx/firewall/assets/devices/new", {waitUntil:"networkidle0"});
    await page.waitForSelector('[data-testid="onboarding-step-identity"]', {timeout:10000}).catch(async error => {
      console.log(JSON.stringify({url:page.url(),errors,paths,text:await page.$eval("body",v=>v.innerText.slice(0,1200))}));
      throw error;
    });
    await page.evaluate(() => [...document.querySelectorAll(".onboarding-vendor-choice")].find(v => v.textContent.includes("VMware ESXi")).click());
    await page.evaluate(() => [...document.querySelectorAll(".onboarding-method-card")].find(v => v.textContent.includes("SSH")).click());
    assert.equal(await page.$eval('input[type="number"]',v => v.value), "22");
    const inputs = await page.$$('.onboarding-stage--identity input:not([type="number"])');
    await inputs[0].type("ESXi test"); await inputs[1].type("esxi.example.test");
    await page.$eval(".onboarding-stage--identity .onboarding-stage__actions .primary-button", el => el.scrollIntoView({block:"center"}));
    await page.click(".onboarding-stage--identity .onboarding-stage__actions .primary-button");
    await page.waitForSelector('[data-testid="onboarding-step-credential"]', {timeout:8000}).catch(async error => {
      console.log(JSON.stringify({width,url:page.url(),errors,text:await page.$eval("body",v=>v.innerText.slice(0,700)),feedback:await page.$$eval(".onboarding-feedback",vs=>vs.map(v=>v.innerText)),inputs:await page.$$eval(".onboarding-stage--identity input",vs=>vs.map(v=>({type:v.type,value:v.value})))}));
      throw error;
    });
    assert.ok(await page.$('input[placeholder="SHA256:…"]'));
    assert.equal(await page.$('textarea[placeholder="-----BEGIN CERTIFICATE-----"]'), null);
    const guide = '[data-testid="esxi-fingerprint-guide"]';
    assert.equal(await page.$eval(guide,v => v.open), false, "Help starts collapsed");
    await page.click(`${guide} summary`);
    assert.ok(await page.$eval(guide,v => v.open));
    assert.equal(await page.$eval(`${guide} .esxi-ssh-fingerprint__command>code`,v => v.textContent), fingerprintCommand);
    assert.equal(await page.$eval(`${guide} mark`,v => v.textContent), "SHA256:…");
    assert.equal(await page.$$eval(`${guide} ol li`,vs => vs.length), 3);
    await page.type('#esxi-ssh-fingerprint-input', `SHA256:${Buffer.alloc(32,1).toString("base64").replace(/=+$/u,"")}`);
    assert.ok(await page.$eval(guide,v => v.open), "Typing must not close the guide");
    await page.click('[data-testid="esxi-copy-fingerprint-command"]');
    await page.waitForFunction(() => window.testCopiedCommand !== undefined);
    assert.equal(await page.evaluate(() => window.testCopiedCommand), fingerprintCommand);
    assert.match(await page.$eval(`${guide} [role="status"]`,v => v.textContent), /کپی شد/u);
    await page.evaluate(() => {
      Object.defineProperty(navigator,"clipboard", {configurable:true,value:{writeText:async () => { throw new Error("Test clipboard unavailable"); }}});
    });
    await page.click('[data-testid="esxi-copy-fingerprint-command"]');
    await page.waitForFunction(() => document.querySelector('.esxi-ssh-fingerprint__copy-status').textContent.includes("دستی"));
    assert.equal(await page.evaluate(() => window.getSelection().toString()), fingerprintCommand, "Manual fallback selects the full command");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+4), false, `SSH form overflows at ${width}px`);
    await page.click(`${guide} summary`);
    assert.equal(await page.$eval(guide,v => v.open), false, "Help can be closed");
    await page.select('.onboarding-stage--credential select',"test-credential");
    await page.click('.onboarding-stage--credential .workflow-primary-action');
    await page.waitForSelector('[data-testid="onboarding-step-review"]');
    assert.ok(await page.$('.onboarding-result-hero.is-verified'));
    await page.click('.onboarding-stage--review .workflow-primary-action');
    await page.waitForFunction(() => document.querySelector('.onboarding-feedback.is-error'));
    await page.waitForFunction(() => !document.querySelector('.onboarding-stage--review .workflow-primary-action').disabled);
    assert.ok(await page.$('.onboarding-result-hero.is-verified'),"Save failure must preserve verified evidence");
    await page.click('.onboarding-stage--review .workflow-primary-action');
    await page.waitForFunction(() => !document.querySelector('.onboarding-stage--review .workflow-primary-action').disabled);
    assert.equal(commitCalls,2,"Retry must call verified commit, not unverified registration");
    assert.equal(unverifiedCalls,0);
    assert.equal(testCalls,1,"Saving again must not reconnect to the vendor");
    await page.click(".onboarding-context-bar nav button");
    await page.waitForSelector('[data-testid="onboarding-step-identity"]');
    await page.evaluate(() => [...document.querySelectorAll(".onboarding-method-card")].find(v => v.textContent.includes("API")).click());
    assert.equal(await page.$eval('input[type="number"]',v => v.value), "443");
    await page.$eval(".onboarding-stage--identity .onboarding-stage__actions .primary-button", el => el.scrollIntoView({block:"center"}));
    await page.click(".onboarding-stage--identity .onboarding-stage__actions .primary-button");
    await page.waitForSelector('[data-testid="onboarding-step-credential"]');
    assert.ok(await page.$('textarea[placeholder="-----BEGIN CERTIFICATE-----"]'));
    assert.equal(await page.$('input[placeholder="SHA256:…"]'), null);
    assert.equal(await page.$(guide), null, "SSH guide must not appear for API connections");
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,width,sshSelectable:true,apiSelectable:true,fieldsSeparated:true,guideStable:true,copyCommand:true,manualCopyFallback:true,noOverflow:true,verifiedSaveRecovery:true}));
    await page.close();
  }
} finally { await browser.close(); }
