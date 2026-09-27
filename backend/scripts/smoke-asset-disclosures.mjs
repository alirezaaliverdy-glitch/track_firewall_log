// Run after deployment. Exercises real workspace polling and transient request failure; no vendor writes.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { prisma } from "../dist/db/prisma.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp("/tmp/cisco-ui-");
const user = await prisma.appUser.findFirst({ where: { role: "admin", isActive: true }, select: { id: true } });
const device = await prisma.device.findFirst({ where: { vendor: "cisco", company: { ownerId: user?.id, deletedAt: null } }, select: { id: true } });
if (!user || !device) throw new Error("Owned Cisco device and active admin required");
const token = randomBytes(32).toString("base64url");
const session = await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now()+300000), userAgent: "cisco-ui-smoke" } });
const browser = spawn("chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", "--user-data-dir="+profile, "about:blank"], { stdio: "ignore" });
let socket;
try {
  let port;
  for(let i=0;i<60;i++){try{port=(await readFile(profile+"/DevToolsActivePort","utf8")).split("\n")[0];break;}catch{await sleep(200);}}
  if(!port)throw new Error("Chromium did not start");
  const targets=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  socket=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("Browser expression failed");return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(150);}console.log(JSON.stringify(await evaluate("({library:!!document.querySelector('[data-testid=action-library]'),wizard:!!document.querySelector('[data-testid=action-library] section[dir]'),wizardMessages:[...document.querySelectorAll('[data-testid=action-library] section[dir]>p')].map(p=>p.textContent.slice(0,200))})")));throw new Error("UI condition not reached: "+expression);};
  await send("Network.enable");
  await send("Network.setCookie",{name:"firewall_session",value:token,url:"http://main-nginx/",path:"/"});
  let refreshes=0;
  const previousMessage=socket.onmessage;
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==="Network.responseReceived"&&m.params.response.url.includes("/device-workspaces/"))refreshes++;previousMessage(event);};
  await send("Page.navigate",{url:"http://main-nginx/firewall/assets/devices/"+encodeURIComponent(device.id)+"/overview"});
  await wait("Boolean(document.querySelector('.asset-overview-technical') && document.querySelector('.asset-cisco-expanded'))");
  for(const [width,height] of [[1440,1000],[390,844]]){
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    await evaluate("(()=>{window.__assetRefs=['.asset-overview-technical','.asset-cisco-expanded'].map(s=>document.querySelector(s));window.__assetRefs.forEach(e=>{if(!e.open)e.querySelector('summary').click();});})()");
    const before=refreshes;await sleep(11000);
    const preserved=await evaluate("window.__assetRefs.every(e=>e.isConnected && e===document.querySelector('.'+e.className.split(' ')[0]) && e.open)");
    if(!preserved||refreshes-before<2)throw new Error("Disclosures did not survive two real refreshes");
    console.log(JSON.stringify({stage:"disclosure-open",width,refreshes:refreshes-before,identityPreserved:preserved}));
    await evaluate("window.__assetRefs.forEach(e=>e.querySelector('summary').click())");
    await sleep(6000);
    if(!await evaluate("window.__assetRefs.every(e=>e.isConnected && !e.open)"))throw new Error("Manual close was undone");
    console.log(JSON.stringify({stage:"manual-close",width,remainsClosed:true}));
  }
  await evaluate("window.__assetRefs.forEach(e=>e.querySelector('summary').click())");
  await send("Network.setBlockedURLs",{urls:["*device-workspaces*"]});await sleep(6000);
  if(!await evaluate("Boolean(document.querySelector('.asset-refresh-notice')) && window.__assetRefs.every(e=>e.isConnected && e.open)"))throw new Error("Transient refresh failure unmounted last data");
  await send("Network.setBlockedURLs",{urls:[]});await sleep(6000);
  if(!await evaluate("!document.querySelector('.asset-refresh-notice') && window.__assetRefs.every(e=>e.isConnected && e.open)"))throw new Error("Recovery reset disclosure state");
  console.log(JSON.stringify({stage:"refresh-recovery",lastDataPreserved:true,openStatePreserved:true,realVendorWrite:false}));
} finally {
  socket?.close();browser.kill("SIGTERM");await sleep(250);
  await prisma.authSession.deleteMany({where:{id:session.id}});await prisma.$disconnect();
  await rm(profile,{recursive:true,force:true});
}
