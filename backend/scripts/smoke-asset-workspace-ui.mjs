// Read-only deployed UI smoke: overview, bounded history and an existing preview. Never confirms execution.
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
  const navigate = async path => { await send("Page.navigate", { url: "http://main-nginx/firewall/"+path }); };
  await navigate("assets/devices/"+encodeURIComponent(device.id)+"/overview");
  await wait("Boolean(document.querySelector('.asset-overview-trends'))");
  for (const [width,height] of [[1440,1000],[390,844]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    await sleep(500);
    const result = await evaluate("(()=>{const root=document.querySelector('.asset-overview-trends');return {scrollWidth:document.documentElement.scrollWidth,plots:root.querySelectorAll('svg circle').length,nonzeroPlots:[...root.querySelectorAll('.asset-chart-plot')].every(e=>e.getBoundingClientRect().height>70),collapsedInventory:!document.querySelector('.asset-vendor-overview').open};})()");
    if(result.scrollWidth > width+1 || !result.plots || !result.nonzeroPlots || !result.collapsedInventory) throw new Error("Overview assertion: "+JSON.stringify(result));
    console.log(JSON.stringify({stage:"overview",width,...result}));
  }
  await navigate("assets/devices/"+encodeURIComponent(device.id)+"/history");
  await wait("Boolean(document.querySelector('.asset-history'))");
  const history = await evaluate("({rows:document.querySelectorAll('.asset-history li').length,filters:document.querySelectorAll('.asset-history nav button').length,grouped:document.querySelectorAll('.asset-history__duplicates').length})");
  if(history.rows>12 || history.filters!==4) throw new Error("History not bounded");
  console.log(JSON.stringify({stage:"history",...history}));
  await evaluate("document.querySelector('.asset-history nav button:last-child').click()");
  await sleep(200);
  if(!await evaluate("document.querySelector('.asset-history nav button:last-child').getAttribute('aria-pressed')==='true'"))throw new Error("History filter failed");
  const actions = await prisma.actionPlan.findMany({where:{device:{company:{ownerId:user.id,deletedAt:null}},status:{in:["dry_run_ready","awaiting_approval","approved"]}},orderBy:{updatedAt:"desc"},take:10,select:{id:true}});
  let opened=false;
  for(const action of actions) {
    await navigate("actions/"+encodeURIComponent(action.id));
    await sleep(2000);
    if(await evaluate("Boolean(document.querySelector('.operator-execute:not(:disabled)'))")) {
      await evaluate("document.querySelector('.operator-execute:not(:disabled)').click()");
      await wait("Boolean(document.querySelector('.execution-review__commands'))");
      opened=true;break;
    }
  }
  if(!opened)throw new Error("No existing executable preview available for read-only dialog check");
  for(const [width,height] of [[1440,1000],[390,844]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
    await sleep(300);
    const result=await evaluate("(()=>{const d=document.querySelector('.execution-review__commands'),body=document.querySelector('.execution-review__body');if(!d.open)d.querySelector('summary').click();const list=d.querySelector('ol');body.scrollTop=d.offsetTop;list.scrollTop=list.scrollHeight;const rect=d.getBoundingClientRect();return {open:d.open,commands:list.children.length,detailHeight:rect.height,listHeight:list.clientHeight,lastCommandHeight:list.lastElementChild.getBoundingClientRect().height,bodyScrollable:body.scrollHeight>body.clientHeight,dialogRight:document.querySelector('.execution-review__card').getBoundingClientRect().right,scrollWidth:document.documentElement.scrollWidth};})()");
    if(!result.open || !result.commands || result.detailHeight<80 || !result.lastCommandHeight || result.scrollWidth>width+1 || result.dialogRight>width+1)throw new Error("Command dialog assertion: "+JSON.stringify(result));
    console.log(JSON.stringify({stage:"command-review",width,...result,realVendorWrite:false}));
    await evaluate("document.querySelector('.execution-review__commands summary').click()");
    if(!await evaluate("!document.querySelector('.execution-review__commands').open"))throw new Error("Commands failed to close");
    await evaluate("document.querySelector('.execution-review__commands summary').click()");
  }
  await evaluate("document.querySelector('.execution-review__close').click()");
  console.log(JSON.stringify({stage:"cancel",realVendorWrite:false}));

} finally {
  socket?.close();browser.kill("SIGTERM");await sleep(250);
  await prisma.authSession.deleteMany({where:{id:session.id}});await prisma.$disconnect();
  await rm(profile,{recursive:true,force:true});
}

