// Run in the API container after deployment. Opens/cancels a wizard; never builds or executes an action.
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
  await send("Page.navigate",{url:"http://main-nginx/firewall/actions?deviceId="+encodeURIComponent(device.id)});
  await wait("Boolean(document.querySelector('.operations-hero__actions .secondary-button'))");
  await evaluate("document.querySelector('.operations-hero__actions .secondary-button').click()");
  await wait("Boolean([...document.querySelectorAll('[data-testid=action-library] article')].find(e=>e.querySelector('h3')?.textContent==='ساخت EtherChannel ترانک'))");
  await evaluate("[...document.querySelectorAll('[data-testid=action-library] article')].find(e=>e.querySelector('h3')?.textContent==='ساخت EtherChannel ترانک').querySelector('button').click()");
  await wait("Boolean(document.querySelector('[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"]'))");
  await sleep(1500);
  console.log(JSON.stringify(await evaluate("(()=>{const group=document.querySelector('[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"]');return {stage:'ports',count:group.querySelectorAll('button').length,labels:[...group.closest('section').querySelectorAll('label')].map(l=>l.firstChild?.textContent?.trim()),fallback:group.parentElement.textContent.includes('فهرست پورت هنوز')};})()")));
  await wait("Boolean(document.querySelector('[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"] button'))");
  const buttons="[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"] button";
  await evaluate(`document.querySelector(${JSON.stringify(buttons)}).click()`);
  if(!await evaluate(`document.querySelector(${JSON.stringify(buttons)}).getAttribute('aria-pressed')==='true'`))throw new Error("Port selection did not apply");
  for(const [width,height] of [[390,844],[1440,1000]]){
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});await sleep(250);
    const result=await evaluate(`(()=>{const group=document.querySelector('[aria-label="انتخاب پورت‌های واقعی دستگاه"]');const wizard=group.closest('section');return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,portCount:group.querySelectorAll('button').length,overflow:[...wizard.querySelectorAll('input,select,button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1)}).length}})()`);
    if(result.scrollWidth>width+1||result.overflow)throw new Error("Wizard overflow: "+JSON.stringify(result));
    console.log(JSON.stringify({stage:"switching-wizard",...result,realVendorWrite:false}));
  }
  await evaluate("document.querySelector('[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"]').closest('section').querySelector('button[title=\"لغو\"]').click()");
  await wait("!document.querySelector('[aria-label=\"انتخاب پورت‌های واقعی دستگاه\"]')");
  console.log(JSON.stringify({stage:"cancel",noActionBuiltOrExecuted:true}));
} finally {
  socket?.close();browser.kill("SIGTERM");await sleep(250);
  await prisma.authSession.deleteMany({where:{id:session.id}});await prisma.$disconnect();
  await rm(profile,{recursive:true,force:true});
}
