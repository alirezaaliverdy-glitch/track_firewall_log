import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Client, type ConnectConfig, type ClientChannel } from "ssh2";
import { Prisma, type ActionPlan, type Device } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getDeviceById } from "../services/device.service.js";
import { publicUser, type PublicUser } from "../services/auth.service.js";
import { canAccessApi } from "../security/section-access.js";
import { sshHostKeySha256Fingerprint } from "../security/ssh-host-key-trust.js";
import { assertVpnTarget } from "../vpn/vpn.service.js";
import { trackApplicationSshCommand } from "../security/application-command-provenance.js";
import { discoverWebLogContainer, liveLogCommands, liveLogMatches, liveLogProbeError, liveLogQuery, redactLiveLog, shellQuote, WEB_LOG_DISCOVERY, type LiveLogQuery } from "./live-log-query.js";

const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export class LiveLogError extends Error { constructor(message:string,public statusCode=400,public probeExitCode?:number|null){super(message);} }
type Preview={userId:string;ownerId:string;deviceId:string;revision:string;fingerprint:string;query:LiveLogQuery;expires:number};
export type LiveLogEvent={sequence:number;receivedAt:string;deviceTime:string|null;source:string;priority:number|null;message:string};
type Source={id:string;label:string;kind:"journal"|"file"|"docker";status:"live"|"failed";observed:number;matched:number;lastReceivedAt:string|null;privateKeyBlock:boolean};
type Session=Preview&{id:string;actionPlanId:string;deviceName:string;deviceHost:string;startedAt:string;status:"live"|"closed"|"failed";reason:string;events:LiveLogEvent[];sequence:number;observed:number;matched:number;dropped:number;bytes:number;lastRead:number;client:Client;channel?:ClientChannel;wake:Set<()=>void>;warnings:Set<string>;privateKeyBlock:boolean;sources:Map<string,Source>;inventoryComplete:boolean};
const previews=new Map<string,Preview>(), sessions=new Map<string,Session>();
const preparing=new Set<string>();
const userAllowed=(u:PublicUser)=>u.role!=="viewer"&&canAccessApi(u,"/api/commands","GET");
function owner(u:PublicUser){if(!userAllowed(u))throw new LiveLogError("اجازهٔ شروع پایش لاگ را ندارید.",403);return u.scopeOwnerId??u.id;}
async function target(deviceId:string,ownerId:string){
  const d=await getDeviceById(deviceId,ownerId),caps=obj(d?.capabilities);
  if(!d||caps.inventoryStatus==="archived"||obj(caps.inventory).removedAt||obj(caps.inventory).status==="archived")throw new LiveLogError("تجهیز در دسترس این حساب نیست.",404);
  if(d.protocol!=="ssh"||!(d.type==="linux_edge"||/linux|ubuntu|debian|centos|rocky|alma/i.test(d.vendor)))throw new LiveLogError("این قابلیت به تجهیز لینوکسی با اتصال SSH نیاز دارد.");
  const c=d.credentialId?await prisma.deviceCredential.findUnique({where:{id:d.credentialId},select:{id:true,updatedAt:true}}):d.credentialRef?await prisma.deviceCredential.findUnique({where:{name:d.credentialRef},select:{id:true,updatedAt:true}}):null;
  if(!c)throw new LiveLogError("اعتبارنامهٔ SSH ذخیره‌شده برای تجهیز لازم است.");
  const fingerprint=String(caps.terminalSshFingerprint??caps.liveLogSshFingerprint??caps.esxiSshFingerprint??"");
  if(caps.liveLogSshFingerprint&&caps.liveLogSshFingerprint!==fingerprint)throw new LiveLogError("کلیدهای مورد اعتماد SSH ناسازگارند؛ هویت تجهیز را بررسی کنید.",409);
  const revision=createHash("sha256").update(JSON.stringify({id:d.id,ownerId,host:d.host,port:d.managementPort,credential:c,company:d.companyId,vpn:d.vpnConnectionId,fingerprint})).digest("hex");
  await assertVpnTarget(d.vpnConnectionId,d.host,ownerId,!!d.vpnConnectionId);
  return {device:d,revision,fingerprint};
}
async function keyProbe(host:string,port:number){
  return new Promise<string>((resolve,reject)=>{
    const c=new Client();let key="",done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);c.destroy();key?resolve(key):reject(new LiveLogError("اتصال SSH برقرار نشد؛ مسیر شبکه و پورت را بررسی کنید.",502));};
    const timer=setTimeout(finish,10000);timer.unref();c.on("error",finish).on("close",finish);
    c.connect({host,port,username:"eosnet-key-probe",readyTimeout:8000,hostVerifier:(k:Buffer)=>{key=sshHostKeySha256Fingerprint(k);return false;}});
  });
}
export async function prepareLiveLog(deviceId:string,query:unknown,user:PublicUser){
  const ownerId=owner(user),q=liveLogQuery(query);for(const[id,p]of previews)if(p.expires<Date.now())previews.delete(id);
  if(previews.size>=64||preparing.size>=8||preparing.has(user.id))throw new LiveLogError("تعداد پیش‌نمایش‌ها زیاد است؛ کمی بعد تلاش کنید.",429);
  preparing.add(user.id);
  try{
  const t=await target(deviceId,ownerId),fingerprint=await keyProbe(t.device.host,t.device.managementPort??22);
  if(t.fingerprint&&t.fingerprint!==fingerprint)throw new LiveLogError("کلید SSH با کلید مورد اعتماد تجهیز تطابق ندارد.",409);
  if(previews.size>=64)throw new LiveLogError("تعداد پیش‌نمایش‌ها زیاد است؛ کمی بعد تلاش کنید.",429);
  const previewId=randomUUID();previews.set(previewId,{userId:user.id,ownerId,deviceId,revision:t.revision,fingerprint,query:q,expires:Date.now()+600000});
  return {logQuery:JSON.stringify(q),liveLogPreviewId:previewId,liveLogFingerprint:fingerprint,liveLogFirstTrust:!t.fingerprint};
  }finally{preparing.delete(user.id);}
}
function close(s:Session,reason:string,failed=false){
  if(s.status!=="live")return;s.status=failed?"failed":"closed";s.reason=reason;try{s.channel?.signal("TERM");s.channel?.close();}catch{/* Transport may already be gone. */}s.client.end();for(const wake of s.wake)wake();
  void prisma.auditLog.create({data:{actor:s.userId,deviceId:s.deviceId,action:"linux.live_log.closed",targetType:"live_log_session",targetId:s.id,metadata:{reason,observed:s.observed,matched:s.matched,dropped:s.dropped,ownerId:s.ownerId}}}).catch(()=>{});
}
const sweeper=setInterval(()=>{const now=Date.now();for(const[id,s]of sessions){if(s.status==="live"&&(now-s.lastRead>45000||now-Date.parse(s.startedAt)>1800000))close(s,now-s.lastRead>45000?"مهلت ارتباط با صفحه تمام شد.":"پایان سقف ۳۰ دقیقه‌ای؛ برای ادامه دوباره شروع کنید.");if(s.status!=="live"&&now-s.lastRead>60000)sessions.delete(id);}for(const[id,p]of previews)if(p.expires<now)previews.delete(id);},5000);sweeper.unref();
function append(s:Session,line:string,format:"text"|"json",origin?:Source){
  s.observed++;if(origin){origin.observed++;origin.lastReceivedAt=new Date().toISOString();}let message=line,deviceTime:string|null=null,priority:number|null=null,source=origin?.label??s.query.container??s.query.file??s.query.unit??"journal";
  if((origin?.kind??s.query.source)==="docker"){const time=line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s/);if(time&&Number.isFinite(Date.parse(time[1])))deviceTime=new Date(time[1]).toISOString();}
  if(format==="json"){try{const j=JSON.parse(line);if(typeof j.MESSAGE!=="string")return;message=j.MESSAGE;const ms=Number(j.__REALTIME_TIMESTAMP)/1000;if(Number.isFinite(ms)&&ms>0&&ms<8640000000000000)deviceTime=new Date(ms).toISOString();priority=/^[0-7]$/.test(String(j.PRIORITY))?Number(j.PRIORITY):null;source=String(j._SYSTEMD_UNIT??j.SYSLOG_IDENTIFIER??"journal").slice(0,120);}catch{return;}}
  const privacy=origin??s;
  if(/-----BEGIN [^-]*PRIVATE KEY-----/.test(message))privacy.privateKeyBlock=true;
  if(privacy.privateKeyBlock){if(/-----END [^-]*PRIVATE KEY-----/.test(message))privacy.privateKeyBlock=false;s.dropped++;return;}
  if(!liveLogMatches(origin?{...s.query,source:origin.kind}:s.query,message,priority))return;s.matched++;if(origin)origin.matched++;
  const event:LiveLogEvent={sequence:++s.sequence,receivedAt:new Date().toISOString(),deviceTime,source:redactLiveLog(source).slice(0,120),priority,message:redactLiveLog(message)};
  const size=Buffer.byteLength(JSON.stringify(event));s.events.push(event);s.bytes+=size;while(s.events.length>500||s.bytes>1048576){s.bytes-=Buffer.byteLength(JSON.stringify(s.events.shift()!));s.dropped++;}for(const wake of s.wake)wake();
}
function multiplex(s:Session,line:string){
  let v:Record<string,unknown>;try{v=obj(JSON.parse(line));}catch{close(s,"قالب جریان چندمنبعی معتبر نیست.",true);return;}
  if(v.type==="source"&&typeof v.id==="string"&&/^(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(v.id)&&typeof v.label==="string"&&v.label.length<=240&&["journal","file","docker"].includes(String(v.kind))&&["live","failed"].includes(String(v.status))){
    const existing=s.sources.get(v.id);s.sources.set(v.id,{...(existing??{observed:0,matched:0,lastReceivedAt:null,privateKeyBlock:false}),id:v.id,label:redactLiveLog(v.label),kind:v.kind as Source['kind'],status:v.status as Source['status']});
    if(v.status==="failed")s.warnings.add("یک منبع بسته یا غیرقابل‌خواندن شد؛ وضعیت منابع را بررسی کنید.");
  }else if(v.type==="line"&&typeof v.id==="string"&&typeof v.line==="string"){
    const source=s.sources.get(v.id);if(source&&Buffer.byteLength(v.line)<=16384)append(s,v.line,source.kind==="journal"?"json":"text",source);else s.dropped++;
  }else if(v.type==="inventory")s.inventoryComplete=true;
  else if(v.type==="warning"&&typeof v.message==="string"&&s.warnings.size<24)s.warnings.add(redactLiveLog(v.message));
  else if(v.type==="diagnostic"&&typeof v.id==="string")s.warnings.add("منبع شمارهٔ "+v.id+" هشدار خواندن/چرخش فایل دارد؛ پوشش آن ممکن است ناقص باشد.");
  else if(v.type==="dropped")s.dropped++;
  for(const wake of s.wake)wake();
}
export async function openLiveLog(plan:ActionPlan,device:Device,config:ConnectConfig){
  const params=obj(plan.parametersJson),p=previews.get(String(params.liveLogPreviewId)),q=liveLogQuery(params.logQuery);
  if(!p||p.expires<Date.now()||p.deviceId!==device.id||p.userId!==obj(plan.approvalJson).approvedBy||JSON.stringify(p.query)!==JSON.stringify(q))throw new LiveLogError("پیش‌نمایش پایش منقضی یا تغییر کرده است؛ درخواست را دوباره بسازید.",409);
  const t=await target(device.id,p.ownerId);if(t.revision!==p.revision)throw new LiveLogError("تنظیمات تجهیز تغییر کرده؛ دوباره پیش‌نمایش بگیرید.",409);
  const approvedUser=await prisma.appUser.findFirst({where:{id:p.userId,isActive:true}});
  if(!approvedUser||owner(publicUser(approvedUser))!==p.ownerId)throw new LiveLogError("دسترسی تأییدکننده تغییر کرده است.",403);
  if([...sessions.values()].filter(s=>s.status==="live").length>=8||[...sessions.values()].filter(s=>s.userId===p.userId&&s.status==="live").length>=2)throw new LiveLogError("حداکثر دو جریان هم‌زمان برای هر کاربر مجاز است؛ یکی را متوقف کنید.",429);
  if(sessions.size>=64){for(const[id,s]of sessions){if(s.status!=="live")sessions.delete(id);if(sessions.size<64)break;}}
  previews.delete(String(params.liveLogPreviewId));
  let commands=liveLogCommands(q);const client=new Client();
  const s:Session={...p,id:randomUUID(),actionPlanId:plan.id,deviceName:device.name,deviceHost:device.host,startedAt:new Date().toISOString(),status:"live",reason:"",events:[],sequence:0,observed:0,matched:0,dropped:0,bytes:0,lastRead:Date.now(),client,wake:new Set(),warnings:new Set(),privateKeyBlock:false,sources:new Map(),inventoryComplete:false};sessions.set(s.id,s);
  try{
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new LiveLogError("مهلت اتصال SSH تمام شد.",504)),15000);timer.unref();client.once("ready",()=>{clearTimeout(timer);resolve();});client.on("error",()=>{clearTimeout(timer);reject(new LiveLogError("اتصال یا احراز هویت SSH ناموفق بود.",502));close(s,"ارتباط SSH قطع شد.",true);});client.on("close",()=>close(s,"ارتباط SSH بسته شد.",true));client.connect({...config,readyTimeout:12000,keepaliveInterval:10000,keepaliveCountMax:2,hostVerifier:(k:Buffer)=>sshHostKeySha256Fingerprint(k)===p.fingerprint});});
    // Only fixed, bounded read-only commands; user filters are applied as literals locally.
    const run=(cmd:string)=>trackApplicationSshCommand({deviceId:device.id,username:config.username??"",command:cmd},()=>new Promise<string>((resolve,reject)=>{
      client.exec(cmd,(error,ch)=>{if(error)return reject(new LiveLogError("اجرای بررسی منبع ناموفق بود.",502));let out="",bytes=0;const timer=setTimeout(()=>{ch.close();reject(new LiveLogError("مهلت بررسی منبع تمام شد.",504));},8000);timer.unref();ch.on("data",(b:Buffer)=>{bytes+=b.length;if(bytes>32768){ch.close();reject(new LiveLogError("پاسخ بررسی منبع غیرمنتظره است."));}else out+=b.toString("utf8");});ch.stderr.on("data",()=>{});ch.on("close",(code:number|null)=>{clearTimeout(timer);code===0?resolve(out):reject(new LiveLogError(liveLogProbeError(code),422,code));});});
    }));
    const privilege=(await run("id -u; if sudo -n true 2>/dev/null; then printf '\nEOSNET_SUDO\n'; fi")).trim();
    const wrap=(c:string)=>privilege.split("\n")[0]==="0"?c:privilege.includes("EOSNET_SUDO")?`sudo -n sh -c ${shellQuote(c)}`:c;
    if(privilege.split("\n")[0]!=="0"&&!privilege.includes("EOSNET_SUDO"))s.warnings.add("پوشش لاگ محدود به مجوزهای حساب SSH است؛ دسترسی کامل سیستم تأیید نشده است.");
    if(q.source==="auto")s.warnings.add("فقط لاگ‌های واقعاً ثبت‌شده خوانده می‌شوند؛ IP پشت پراکسی/CDN ممکن است متفاوت باشد. کش مرورگر و ثبت با تأخیر نیز می‌تواند باعث نبودن درخواست تازه شود. لاگ‌گیری خاموش خودکار فعال نمی‌شود.");
    try{await run(wrap(commands.probe));}
    catch(error){
      if(!q.webFallback||!(error instanceof LiveLogError)||error.probeExitCode!==49)throw error;
      let container:string;try{container=discoverWebLogContainer(await run(wrap(WEB_LOG_DISCOVERY)),q);}catch(e){throw new LiveLogError(e instanceof LiveLogError?e.message:e instanceof Error?e.message:"منبع وب شناسایی نشد.",422);}
      s.query=liveLogQuery({source:"docker",container,...(q.ip?{ip:q.ip}:{}),...(q.text?{text:q.text}:{}),...(q.errorsOnly?{errorsOnly:true}:{})});
      commands=liveLogCommands(s.query);await run(wrap(commands.probe));
      s.warnings.add("فایل استاندارد وب موجود نبود؛ منبع واقعی از تنها کانتینر سازگار شناسایی شد.");
    }
    await trackApplicationSshCommand({deviceId:device.id,username:config.username??"",command:wrap(commands.follow)},()=>new Promise<void>((resolve,reject)=>{
      client.exec(wrap(commands.follow),(error,ch)=>{if(error)return reject(new LiveLogError("شروع جریان لاگ ناموفق بود.",502));s.channel=ch;const decoder=new StringDecoder("utf8");let buffer="",windowAt=Date.now(),windowBytes=0;let ready=false;
        const timer=setInterval(()=>{if(s.status!=="live"){clearInterval(timer);return reject(new LiveLogError("منبع لاگ پیش از شروع بسته شد.",422));}if(commands.format==="multiplex"&&!s.inventoryComplete){if(Date.now()-Date.parse(s.startedAt)>40000){clearInterval(timer);reject(new LiveLogError("مهلت شناسایی منابع لاگ تمام شد؛ سرویس یا کانتینر را دقیق‌تر مشخص کنید.",504));}return;}if(commands.format==="multiplex"&&![...s.sources.values()].some(v=>v.status==="live")){clearInterval(timer);return reject(new LiveLogError("هیچ منبع لاگ قابل‌خواندن نیست؛ مجوز حساب و سرویس‌های ثبت لاگ را بررسی کنید.",422));}clearInterval(timer);ready=true;resolve();},500);timer.unref();
        ch.on("data",(b:Buffer)=>{if(Date.now()-windowAt>1000){windowAt=Date.now();windowBytes=0;}windowBytes+=b.length;if(windowBytes>524288){close(s,"حجم جریان از سقف امن عبور کرد؛ فیلتر سرویس را محدودتر کنید.",true);return;}
          buffer+=decoder.write(b);let index:number;const limit=commands.format==="multiplex"?131072:16384;while((index=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(Buffer.byteLength(line)>limit){s.dropped++;continue;}if(commands.format==="multiplex")multiplex(s,line);else append(s,line,commands.format);}if(Buffer.byteLength(buffer)>limit){close(s,"یک خط لاگ بیش از سقف مجاز بود.",true);}
        });
        ch.stderr.on("data",()=>{s.warnings.add("منبع یک هشدار فرستاده است؛ ممکن است پوشش لاگ کامل نباشد.");for(const wake of s.wake)wake();});
        ch.on("close",()=>{clearInterval(timer);close(s,"جریان منبع پایان یافت؛ برای ادامه دوباره شروع کنید.",true);if(!ready)reject(new LiveLogError("منبع لاگ جریان قابل‌خواندن ارائه نکرد؛ برای تشخیص چندمنبعی Python 3 و ابزارهای منبع لازم است.",422));});
      });
    }));
    if(s.status!=="live")throw new LiveLogError("جریان لاگ برقرار نماند.",502);
    const current=await target(device.id,p.ownerId),active=await prisma.appUser.findFirst({where:{id:p.userId,isActive:true}});
    if(current.revision!==p.revision||!active||owner(publicUser(active))!==p.ownerId)throw new LiveLogError("دسترسی یا تنظیمات حین اتصال تغییر کرد.",409);
    if(!t.fingerprint){
      const saved=await prisma.device.updateMany({where:{id:device.id,capabilities:{equals:t.device.capabilities??Prisma.DbNull}},data:{capabilities:{...obj(t.device.capabilities),liveLogSshFingerprint:p.fingerprint}}});
      if(saved.count!==1)throw new LiveLogError("هویت تجهیز حین اتصال تغییر کرد؛ دوباره پیش‌نمایش بگیرید.",409);
      s.revision=(await target(device.id,p.ownerId)).revision;
    }
    await prisma.auditLog.create({data:{actor:p.userId,deviceId:device.id,action:"linux.live_log.started",targetType:"live_log_session",targetId:s.id,dryRun:false,metadata:{ownerId:p.ownerId,actionPlanId:plan.id,connectorInvoked:true,source:s.query.source,template:"linux_live_log_query"}}});
    return {sessionId:s.id,status:s.status,startedAt:s.startedAt,query:s.query};
  }catch(e){close(s,"شروع پایش ناموفق بود.",true);throw e;}
}
async function owned(id:string,user:PublicUser){const ownerId=owner(user),s=sessions.get(id);if(!s||s.userId!==user.id||s.ownerId!==ownerId)throw new LiveLogError("نشست پایش پیدا نشد یا متعلق به این حساب نیست.",404);try{const t=await target(s.deviceId,ownerId);if(t.revision!==s.revision)throw new Error();}catch{close(s,"دسترسی یا تنظیمات تجهیز تغییر کرده است.",true);throw new LiveLogError("دسترسی یا تنظیمات تجهیز تغییر کرده است.",409);}return s;}
export async function readLiveLog(id:string,user:PublicUser,cursor:number,signal?:AbortSignal){
  const s=await owned(id,user);s.lastRead=Date.now();
  if(s.wake.size>=2)throw new LiveLogError("خواندن هم‌زمان بیش از حد مجاز است.",429);
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>s.sequence)throw new LiveLogError("موقعیت جریان معتبر نیست.");
  if(cursor===s.sequence&&s.status==="live"&&!signal?.aborted)await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);s.wake.delete(finish);signal?.removeEventListener("abort",finish);resolve();};const timer=setTimeout(finish,10000);s.wake.add(finish);signal?.addEventListener("abort",finish,{once:true});});
  await new Promise(resolve=>setTimeout(resolve,200));
  return {sessionId:s.id,deviceId:s.deviceId,deviceName:s.deviceName,deviceHost:s.deviceHost,actionPlanId:s.actionPlanId,status:s.status,reason:s.reason,startedAt:s.startedAt,query:s.query,sources:[...s.sources.values()].map(({privateKeyBlock,...v})=>v),inventoryComplete:s.inventoryComplete,events:s.events.filter(e=>e.sequence>cursor).slice(0,200),cursor:s.events.filter(e=>e.sequence>cursor).slice(0,200).at(-1)?.sequence??cursor,observed:s.observed,matched:s.matched,dropped:s.dropped,gap:cursor<(s.events[0]?.sequence??1)-1,warnings:[...s.warnings],serverTime:new Date().toISOString(),expiresAt:new Date(Date.parse(s.startedAt)+1800000).toISOString()};
}
export async function stopLiveLog(id:string,user:PublicUser){const s=await owned(id,user);close(s,"پایش به درخواست شما متوقف شد.");return {status:s.status};}
export async function checkLiveLogAccess(id:string,user:PublicUser){await owned(id,user);}
export function shutdownLiveLogs(){for(const s of sessions.values())close(s,"سرویس برنامه راه‌اندازی مجدد شد.");sessions.clear();previews.clear();}
