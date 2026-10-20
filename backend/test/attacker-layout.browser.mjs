import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: process.env.QA_CHROMIUM || "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(theme => { localStorage.setItem("firewall-log-analyzer.locale", "fa");localStorage.setItem("eosnet.appearance",theme); },process.env.QA_APPEARANCE || "dark");
  const errors = [], writes = [];
  page.on("pageerror", error => errors.push(error.message));
  const now = new Date().toISOString();
  const assessment = { verdict: "likely_attack", containmentStatus: "not_contained", actionableFindingCount: 1, informationalFindingCount: 0, logicalAuthenticationFailures: 4, bruteForceDetected: false, authenticationServices: ["ssh"], authenticationFailureVendors: ["linux"], targetedUsers: [], authenticationSuccesses: 0, normalSessionEvents: 0, notes: [] };
  const attacker = { ip: "45.198.224.140", riskScore: 83, severity: "high", scope: "public", firstSeen: now, lastSeen: now, findingCount: 1, eventCount: 9, confidence: .8, vendors: ["linux"], devices: [{ id: "linux-one", name: "linux-one", vendor: "linux", host: "192.0.2.10" }], assets: [], categories: ["authentication"], sources: [], actions: [], protocols: ["ssh"], targetedIps: [], targetedPorts: [22], usernames: [], eventTypes: ["ssh"], mitreTags: [], assessment, attackFamilies: [], responseReadiness: [], enrichment: { status: "dbip_lite", geo: { countryCode: "SE", countryName: "Sweden" }, asn: 19948, networkOwner: "Example Hosting" }, latestEvidence: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, eventType: "ssh", timestamp: now, message: `Failed SSH authentication attempt ${i} from 45.198.224.140`, vendor: "linux", device: { name: "linux-one" } })), findings: [] };
  attacker.targets=attacker.devices.map(device=>({deviceId:device.id,name:device.name,vendor:device.vendor,findingCount:1,eventCount:8}));
  attacker.decision={mode:'investigate',reason:'fixture',evidence:[],readiness:[]};
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/firewall-api/") && !url.pathname.startsWith("/api/")) return url.hostname === "main-nginx" || url.protocol === "data:" ? request.continue() : request.abort();
    if (request.method() !== "GET") writes.push(url.pathname);
    let body = {};
    if (url.pathname.endsWith("/auth/session-status")) body = { user: { id: "fixture", username: "test", displayName: "Test", role: "admin", allowedSections: ["assets", "actions", "dashboard", "monitoring", "security"] } };
    else if (url.pathname.endsWith("/auth/csrf")) body = { csrfToken: "fixture" };
    else if (url.pathname.endsWith("/product-state/navigation")) body = { contractVersion: "test", navigation: [] };
    else if (url.pathname.endsWith("/security/attackers-geoip/status")) body = { ready: true, source: "DB-IP Lite", loadedAt: now };
    else if (url.pathname.endsWith("/security/attackers-allowlist")) body = { entries: [], vendors: ["all", "linux"] };
    else if (url.pathname.endsWith("/security/attackers/analytics")) { const days=Number(url.searchParams.get('days') || 7);body={generatedAt:now,days,coverage:{complete:true,scanned:8},summary:{sources:8,devices:2,findings:9,peakSources:4,peakAt:now},series:Array.from({length:days===1?24:days},(_,i)=>({at:new Date(Date.now()-(days===1?24-i:days-i)*(days===1?3600000:86400000)).toISOString(),high:i%4,other:1,total:i%4+1})),patterns:[{key:'authentication',sources:5},{key:'reconnaissance',sources:3},{key:'network_defense',sources:1}]}; }
    else if (url.pathname.endsWith("/security/attackers")) body = { generatedAt: now, qualification: "fixture", summary: { total: 1, high: 1, critical: 0, affectedDevices: 1, contained: 0, bruteForce: 0, vendors: ["linux"] }, coverage: { findingsScanned: 1, eventsScanned: 8, eventWindowDays: 30 }, attackers: [attacker] };
    else if (url.pathname.endsWith("/security/attackers/45.198.224.140")) body = { generatedAt: now, qualification: "fixture", attacker };
    return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("http://main-nginx/firewall/attackers", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".attacker-card").catch(async error=>{console.log(JSON.stringify({url:page.url(),errors,body:await page.$eval('body',el=>el.innerText.slice(0,1000))}));throw error;});
  await page.waitForSelector('.attacker-chart--patterns svg.recharts-surface');
  assert.equal((await page.$$('.attacker-chart')).length,2);
  for(const index of [0,2,1]){await page.$$eval('.attacker-insights__controls [role=group] button',(buttons,index)=>buttons[index].click(),index);await page.waitForFunction(()=>document.querySelectorAll('.attacker-chart svg.recharts-surface').length===2);}
  for(const width of [1440,390,320]){await page.setViewport({width,height:1000});for(const plot of await page.$$('.attacker-chart__plot')){await plot.evaluate(el=>el.scrollIntoView({block:'center'}));await new Promise(resolve=>setTimeout(resolve,1200));}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`chart overflow at ${width}`);if(process.env.QA_SCREENSHOTS==='1')await page.screenshot({path:`/out/${process.env.QA_APPEARANCE || 'dark'}-attackers-${width}.png`,fullPage:true});}
  await page.setViewport({width:1440,height:1000});
  await page.$eval('.attacker-chart--timeline',el=>el.scrollIntoView({block:'center'}));await new Promise(resolve=>setTimeout(resolve,1500));
  assert.ok(await page.$('.recharts-area-area'),'timeline must render real data, not just axes');
  assert.ok(await page.$('.recharts-bar-rectangle path'),'pattern chart must render bars');
  assert.equal(await page.$$(".attacker-operations").then(items => items.length), 0);
  assert.ok((await page.$eval(".attacker-card__identity", el => el.textContent)).includes("Sweden") || (await page.$eval(".attacker-card__identity", el => el.textContent)).includes("سوئد"));
  await page.click(".attacker-card");
  await page.waitForSelector(".attacker-enrichment-note__country");
  assert.equal(await page.$eval(".attacker-enrichment-note__country code", el => el.textContent), "SE");
  assert.ok(await page.$eval(".attacker-enrichment-note__country .fi", el => el.classList.contains('fi-se') && getComputedStyle(el).backgroundImage !== 'none' && el.getBoundingClientRect().width>0));
  assert.equal(await page.$$(".attacker-evidence-list article").then(items => items.length), 3);
  await page.click(".attacker-evidence-more");
  assert.equal(await page.$$(".attacker-evidence-list article").then(items => items.length), 8);
  await page.click(".attacker-evidence-list article details summary");
  assert.ok(await page.$eval(".attacker-evidence-list article details", el => el.open));
  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `horizontal overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log("Passed: two animated charts, 1/7/30-day controls, local SVG country flag, evidence expansion, 1440/390/320px widths, no runtime errors or writes.");
} finally { await browser.close(); }
