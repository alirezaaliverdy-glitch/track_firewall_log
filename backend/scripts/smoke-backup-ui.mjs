// Run in the API container (Chromium installed), after deploying web and API.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { prisma } from "../dist/db/prisma.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp("/tmp/backup-ui-");
const user = await prisma.appUser.findFirst({ where: { role: "admin", isActive: true }, select: { id: true } });
if (!user) throw new Error("No active admin");
const token = randomBytes(32).toString("base64url");
const session = await prisma.authSession.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now()+300000), userAgent: "backup-ui-smoke" } });
const browser = spawn("chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", "--user-data-dir="+profile, "about:blank"], { stdio: "ignore" });
let socket;
try {
  let port;
  for (let i=0; i<60; i++) { try { port = (await readFile(profile+"/DevToolsActivePort","utf8")).split("\n")[0]; break; } catch { await sleep(250); } }
  if (!port) throw new Error("Chromium did not start");
  const targets = await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  socket = new WebSocket(targets.find(t => t.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
  let id=0; const pending = new Map();
  socket.onmessage = event => { const message=JSON.parse(event.data); if (message.id) { const item=pending.get(message.id); if(item){pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); } } };
  const send = (method,params={}) => new Promise((resolve,reject) => { const key=++id; pending.set(key,{resolve,reject}); socket.send(JSON.stringify({id:key,method,params})); });
  const evaluate = async expression => (await send("Runtime.evaluate",{expression,returnByValue:true})).result.value;
  await send("Network.enable");
  await send("Network.setCookie",{name:"firewall_session",value:token,url:"http://main-nginx/",path:"/"});
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send("Page.navigate",{url:"http://main-nginx/firewall/backups"});
  let ready=false;
  for(let i=0;i<100;i++){ await sleep(200); ready=await evaluate("Boolean(document.querySelector('.backup-page select option[value]:not([value=\"\" ])'))"); if(ready)break; }
  if(!ready) throw new Error("Backup page failed to load devices");
  await evaluate("(()=>{const s=document.querySelector('.backup-device-field select');s.value=([...s.options].find(o=>o.textContent.includes('mikrotik'))??s.options[1]).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(500);
  for (const [width,height,label] of [[390,844,"mobile"],[1440,1000,"desktop"]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    await sleep(300);
    const result=await evaluate(`(() => {const page=document.querySelector('.backup-page');const panel=page.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visible:panel.width>0,overflows:[...page.querySelectorAll('input,select,button')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).length}})()`);
    if(!result.visible||result.scrollWidth>width+1||result.overflows) throw new Error("Layout overflow: "+JSON.stringify(result));
    console.log(JSON.stringify({viewport:label,...result}));
    if(label==="mobile"){const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile("/tmp/backups-mobile.png",Buffer.from(shot.data,"base64"));}
  }
} finally {
  socket?.close(); browser.kill("SIGTERM"); await sleep(300);
  await prisma.authSession.deleteMany({where:{id:session.id}});
  await prisma.$disconnect();
  await rm(profile,{recursive:true,force:true});
}
