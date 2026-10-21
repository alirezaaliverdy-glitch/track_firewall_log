import { isIP } from "node:net";

export type LiveLogQuery = { source: "journal" | "file" | "docker"; unit?: string; file?: string; container?:string; ip?: string; text?: string; errorsOnly?: boolean; kernel?:boolean; webFallback?:boolean };
export const LIVE_LOG_TEMPLATE = "linux_live_log_query";
const files = ["/var/log/auth.log", "/var/log/secure", "/var/log/syslog", "/var/log/messages", "/var/log/kern.log", "/var/log/ufw.log", "/var/log/nginx/access.log", "/var/log/nginx/error.log", "/var/log/apache2/access.log", "/var/log/apache2/error.log", "/var/log/httpd/access_log", "/var/log/httpd/error_log", "/var/log/fail2ban.log"];
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function liveLogQuery(value: unknown): LiveLogQuery {
  let input = value;
  if (typeof input === "string") { if (input.length > 1200) throw new Error("پرس‌وجوی لاگ بیش از حد طولانی است."); try { input = JSON.parse(input); } catch { throw new Error("پرس‌وجوی لاگ معتبر نیست."); } }
  const q = object(input);
  if (Object.keys(q).some(k => !["source", "unit", "file", "container", "ip", "text", "errorsOnly", "kernel", "webFallback"].includes(k))) throw new Error("فیلتر ناشناختهٔ لاگ مجاز نیست.");
  if (q.source !== "journal" && q.source !== "file" && q.source!=="docker") throw new Error("منبع لاگ باید مشخص باشد.");
  if(q.container!==undefined&&(typeof q.container!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(q.container)))throw new Error("نام یا شناسهٔ کانتینر معتبر نیست.");
  if(q.source==="docker"? !q.container||!!q.file||!!q.unit : !!q.container)throw new Error("منبع کانتینر ناسازگار است.");
  if (q.unit !== undefined && (typeof q.unit !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,95}$/.test(q.unit))) throw new Error("نام سرویس معتبر نیست.");
  if (q.file !== undefined && (typeof q.file !== "string" || !files.includes(q.file))) throw new Error("این مسیر در فهرست فایل‌های لاگ مجاز نیست؛ از سرویس systemd استفاده کنید.");
  if (q.source === "file" ? !q.file || !!q.unit : !!q.file) throw new Error("منبع لاگ ناسازگار است.");
  if (q.ip !== undefined && (typeof q.ip !== "string" || !isIP(q.ip))) throw new Error("آدرس IP معتبر نیست.");
  if (q.text !== undefined && (typeof q.text !== "string" || !q.text.trim() || q.text.length > 160 || /[\x00-\x1f\x7f]/.test(q.text))) throw new Error("عبارت جست‌وجو معتبر نیست.");
  if (q.errorsOnly !== undefined && typeof q.errorsOnly !== "boolean") throw new Error("شدت لاگ معتبر نیست.");
  if(q.kernel!==undefined&&(typeof q.kernel!=="boolean"||q.source!=="journal"||!!q.unit))throw new Error("فیلتر کرنل با این منبع سازگار نیست.");
  if(q.webFallback!==undefined&&(typeof q.webFallback!=="boolean"||q.source!=="file"||!/^\/var\/log\/(nginx|apache2)\/(access|error)\.log$/.test(String(q.file))))throw new Error("تشخیص وب فقط برای مسیرهای ثبت‌شدهٔ nginx و Apache مجاز است.");
  return { source: q.source, ...(q.unit ? {unit: q.unit as string} : {}), ...(q.file ? {file: q.file as string} : {}), ...(q.container?{container:q.container as string}:{}), ...(q.ip ? {ip: q.ip as string} : {}), ...(q.text ? {text: (q.text as string).trim()} : {}), ...(q.errorsOnly ? {errorsOnly:true} : {}),...(q.kernel?{kernel:true}:{}),...(q.webFallback?{webFallback:true}:{}) };
}
export function isLiveLogPlan(parameters: unknown) { return object(object(parameters).metadata).catalogCommandId === "linux.live-logs"; }
export function parseLiveLogIntent(request: string): { query?: LiveLogQuery; clarification?: string } | null {
  const normalized = request.normalize("NFKC").replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
  if (!/(لاگ|رویداد|logs?\b|journal\b)/i.test(normalized)) return null;
  if(/^\s*(?:پاک|حذف|توقف|خاموش|ریست|راه.اندازی|restart\b|delete\b|clear\b|disable\b|stop\b)/i.test(normalized))return null;
  if (normalized.length > 1000 || /[\x00-\x1f\x7f;`|]|\$\(|&&|>>|<script/i.test(normalized)) return { clarification: "فقط سرویس، IP یا عبارت موردنظر را بنویسید؛ فرمان پوسته پذیرفته نمی‌شود." };
  const quoted = [...normalized.matchAll(/[«“"]([^»”"]{1,160})[»”"]/g)];
  if (quoted.length > 1) return {clarification:"فقط یک عبارت را داخل گیومه بنویسید."};
  const semantic=normalized.replace(/[«“"]([^»”"]*)[»”"]/g,"");
  const path = semantic.match(/\/var\/log\/[a-zA-Z0-9_./-]+/)?.[0];
  const container=semantic.match(/(?:کانتینر|container)\s+([a-zA-Z0-9][a-zA-Z0-9_.-]{0,127})/i)?.[1];
  const ipCandidates = semantic.match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[a-fA-F0-9]{0,4}:){2,}[a-fA-F0-9:.]*/g) ?? [];
  if (ipCandidates.length > 1) return {clarification:"برای هر جریان یک IP مشخص کنید."};
  const explicit = semantic.match(/(?:سرویس|service|unit)\s+([a-zA-Z0-9][a-zA-Z0-9_.@:-]*)/i)?.[1];
  const aliases=[...semantic.matchAll(/\b(nginx|apache2|apache|httpd|ssh|sshd|docker|fail2ban|postgresql|mysql|mariadb|redis|cron|ufw)\b/gi)].map(m=>m[1].toLowerCase());
  if(!container&&new Set(aliases).size>1)return {clarification:"برای هر جریان یک سرویس انتخاب کنید؛ مثلاً «لاگ سرویس nginx»."};
  const alias=aliases[0];
  const unit = explicit ?? (alias === "apache" ? "apache2" : alias);
  const errorsOnly = /(خطا|ارور|errors?\b|critical\b)/i.test(semantic);
  const file = path ?? (!explicit&&!container?(alias === "nginx" ? `/var/log/nginx/${errorsOnly ? "error" : "access"}.log` : alias === "apache" || alias === "apache2" ? `/var/log/apache2/${errorsOnly ? "error" : "access"}.log` : /ورود|احراز|authentication|\bauth\b/i.test(semantic)?"/var/log/auth.log":alias==="fail2ban"?"/var/log/fail2ban.log":undefined):undefined);
  if (!container&&!file && !unit && !ipCandidates.length && !quoted.length && !errorsOnly && !/(همه|سیستم|system|journal|ورود|احراز|kernel|کرنل)/i.test(normalized)) return {clarification:"منبع را دقیق‌تر بگویید؛ مثلاً «لاگ سرویس nginx»، «لاگ IP 192.0.2.10» یا «لاگ شامل «connection refused»»."};
  if(container&&(explicit||path))return {clarification:"برای هر جریان یک منبع انتخاب کنید: کانتینر، سرویس یا فایل."};
  try { return {query:liveLogQuery({source:container?"docker":file ? "file" : "journal", ...(container?{container}:file ? {file} : unit ? {unit} : {}), ...(ipCandidates[0] ? {ip:ipCandidates[0]} : {}), ...(quoted[0] ? {text:quoted[0][1]} : {}), ...(errorsOnly ? {errorsOnly:true} : {}),...(!container&&!file&&!unit&&/kernel|کرنل/i.test(semantic)?{kernel:true}:{}),...(!path&&!explicit&&file&&/\/var\/log\/(nginx|apache2)\//.test(file)?{webFallback:true}:{})})}; }
  catch(e) { return {clarification:e instanceof Error ? e.message : "فیلتر معتبر نیست."}; }
}
export const shellQuote = (value:string) => `'${value.replace(/'/g, `'"'"'`)}'`;
export function liveLogCommands(input: unknown) {
  const q = liveLogQuery(input);
  if(q.source==="docker"){
    const name=shellQuote(q.container!);
    return {probe:`command -v timeout >/dev/null || exit 40; command -v docker >/dev/null || exit 41; docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || exit 42; running=$(docker inspect --format '{{.State.Running}}' ${name} 2>/dev/null) || exit 43; test "$running" = true || exit 44`,follow:`timeout 1800 docker logs --follow --timestamps --tail 50 ${name} 2>&1`,format:"text" as const};
  }
  if (q.source === "file") {
    // Canonical path check prevents even an allowlisted filename being redirected to a secret by a symlink.
    const p = shellQuote(q.file!);
    return { probe:`command -v timeout >/dev/null || exit 40; test "$(readlink -f -- ${p})" = ${p} || exit 49; test -f ${p} || exit 49; test -r ${p} || exit 48; command -v tail >/dev/null || exit 50`, follow:`timeout 1800 tail -n 50 -F -- ${p}`, format:"text" as const };
  }
  const unit = q.unit ? ` --unit=${shellQuote(q.unit.endsWith(".service") ? q.unit : `${q.unit}.service`)}` : "";
  const base = `journalctl --no-pager --quiet --output=json${unit}${q.kernel?" --dmesg":""}${q.errorsOnly ? " --priority=0..3" : ""}`;
  return {probe:`command -v timeout >/dev/null || exit 40; command -v journalctl >/dev/null || exit 46; ${q.unit ? `test "$(systemctl show --property=LoadState --value ${shellQuote(q.unit.endsWith(".service") ? q.unit : `${q.unit}.service`)})" = loaded || exit 47; ` : ""}${base} --lines=1 >/dev/null || exit 48`, follow:`timeout 1800 ${base} --follow --lines=50`, format:"json" as const};
}
export function liveLogProbeError(code:number|null){
 const messages:Record<number,string>={40:"ابزار timeout روی تجهیز موجود نیست؛ برای پایش محدود و امن لازم است.",41:"Docker روی این تجهیز موجود نیست؛ لاگ سرویس systemd یا فایل مجاز را درخواست کنید.",42:"دسترسی به موتور Docker برقرار نیست؛ مجوز حساب SSH و وضعیت Docker را بررسی کنید.",43:"کانتینر انتخابی روی این تجهیز پیدا نشد؛ نام دقیق کانتینر را وارد کنید.",44:"کانتینر متوقف است؛ این قابلیت فقط لاگ کانتینر در حال اجرا را پایش می‌کند.",46:"این تجهیز journalctl ندارد؛ یک فایل لاگ مجاز را مشخص کنید.",47:"واحد systemd انتخابی بارگذاری نشده است؛ نام دقیق سرویس را بررسی کنید.",48:"حساب SSH اجازهٔ خواندن این منبع را ندارد؛ دسترسی journal یا sudo بدون رمز را بررسی کنید.",49:"فایل لاگ وجود ندارد یا مسیر واقعی آن با مسیر مجاز متفاوت است؛ نام سرویس یا منبع دیگری را مشخص کنید.",50:"ابزار tail روی تجهیز موجود نیست."};
 return code===null?"بررسی منبع بدون کد خروج معتبر پایان یافت.":messages[code]??"منبع لاگ خواندنی نیست یا سرویس/فایل وجود ندارد؛ دسترسی journal و sudo بدون رمز را بررسی کنید.";
}
// Minimal source inventory, never environment variables or container inspect JSON.
export const WEB_LOG_DISCOVERY = `docker ps --format '{"ID":"{{.ID}}","Image":"{{.Image}}","Ports":"{{.Ports}}"}'`;
export function discoverWebLogContainer(raw:string,query:LiveLogQuery):string{
 if(!query.webFallback)throw new Error("تشخیص خودکار منبع درخواست نشده است.");
 const rows=raw.split("\n").filter(line=>line.trim());
 if(rows.length>100)throw new Error("فهرست کانتینرها بیش از سقف بررسی است؛ نام دقیق کانتینر را مشخص کنید.");
 if(rows.some(line=>{try{const entry=JSON.parse(line);return !entry||typeof entry!=="object"||!/^[a-f0-9]{12,64}$/.test(entry.ID)||typeof entry.Image!=="string"||typeof entry.Ports!=="string";}catch{return true;}}))throw new Error("فهرست منبع کامل و معتبر نیست؛ نام دقیق کانتینر را مشخص کنید.");
 const nginx=query.file?.includes("/nginx/");
 const matches=rows.flatMap(line=>{const entry=JSON.parse(line),image=entry.Image.toLowerCase();if(nginx?!/(?:^|\/)nginx(?=[:@]|$)/.test(image):!/(?:^|\/)(?:httpd|apache2?)(?=[:@]|$)/.test(image))return [];return [entry];});
 const publicWeb=matches.filter(e=>/(?:0\.0\.0\.0|\[::\]|:::):?80->/.test(String(e.Ports??"")));
 const candidates=publicWeb.length?publicWeb:matches;
 if(candidates.length!==1)throw new Error(candidates.length?"چند کانتینر وب پیدا شد؛ نام دقیق کانتینر را در درخواست بنویسید.":"فایل وب یا کانتینر سازگار پیدا نشد؛ نام دقیق سرویس یا کانتینر را مشخص کنید.");
 return candidates[0].ID;
}
export function liveLogMatches(q:LiveLogQuery, message:string, priority:number|null) {
  if(q.ip) {
    if(isIP(q.ip)===6){
      const canonical=(address:string)=>{try{return new URL(`http://[${address}]/`).hostname.toLowerCase();}catch{return "";}};
      const wanted=canonical(q.ip),tokens=message.match(/[a-fA-F0-9:.]+/g)??[];
      if(!tokens.some(t=>isIP(t)===6&&canonical(t)===wanted))return false;
    }else{
      const address=q.ip.replace(/\./g,"\\.");if(!new RegExp(`(?:^|[^0-9.])${address}(?=$|[^0-9.])`).test(message))return false;
    }
  }
  if(q.text&&!message.toLocaleLowerCase().includes(q.text.toLocaleLowerCase()))return false;
  if(q.errorsOnly&&q.source!=="journal"&&!(/error|critical|fatal|failed|panic|\b[45]\d\d\b/i.test(message)))return false;
  return priority===null||!q.errorsOnly||priority<=3;
}
export function redactLiveLog(message:string) {
  return message.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|$))/g,"").replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,"")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*/g,"[REDACTED PRIVATE KEY]")
    .replace(/\b(authorization\s*[:=]\s*)(?:Bearer|Basic)\s+\S+/gi,"$1[REDACTED]")
    .replace(/\b((?:set-cookie|cookie)\s*[:=]\s*)[^\r\n]+/gi,"$1[REDACTED]")
    .replace(/((?:password|passwd|token|api[_-]?key|secret|credential)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,"$1[REDACTED]")
    .replace(/((?:password|passwd|token|api[_-]?key|secret|cookie|set-cookie|credential|private[_-]?key)["']?\s*[:=]\s*)["']?[^\s,;&"']+/gi,"$1[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,"$1[REDACTED]@").slice(0,4096);
}
