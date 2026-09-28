import { Link } from "react-router-dom";
import "./EsxiHostOverview.css";

const rows = (v:unknown):Record<string,unknown>[] => Array.isArray(v) ? v.filter(item=>item && typeof item==="object") as Record<string,unknown>[] : [];
const record=(v:unknown):Record<string,unknown> => v && typeof v==="object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
export function EsxiHostOverview({facts,deviceId,isFa,locale,ssh,available}:{facts:Record<string,unknown>;deviceId:string;isFa:boolean;locale:string;ssh:boolean;available:boolean}) {
  const text=(fa:string,en:string)=>isFa?fa:en;
  const unknown=text("نامشخص","Unknown");
  const show=(v:unknown)=>v===null || v===undefined || v==="" ? unknown : String(v);
  const number=(v:unknown,unit="")=>typeof v==="number" && Number.isFinite(v) ? `${v.toLocaleString(locale,{maximumFractionDigits:1})}${unit}` : unknown;
  const state=(v:unknown,yes:string,no:string)=>v===true ? yes : v===false ? no : unknown;
  const coverage=rows(facts.coverage);
  const collected=(key:string)=>coverage.some(item=>item.key===key && item.status==="available");
  const groups=[
    {key:"datastores",label:text("ذخیره‌سازی","Datastores"),command:"datastores",items:rows(facts.datastores),fields:["name","capacityBytes","freeBytes","accessible"]},
    {key:"physicalNics",label:text("کارت‌های شبکه","Physical network adapters"),command:"nics",items:rows(facts.physicalNics),fields:["name","linkUp","speedMb"]},
    {key:"vmkernelNics",label:text("اینترفیس‌های VMkernel","VMkernel interfaces"),command:"vmkernel",items:rows(facts.vmkernelNics),fields:["name","ip"]},
    {key:"virtualSwitches",label:text("سوئیچ‌های مجازی","Virtual switches"),command:"switches",items:rows(facts.virtualSwitches),fields:["name","ports"]},
    {key:"sensors",label:text("سلامت سخت‌افزار","Hardware health"),command:"sensors",items:rows(facts.sensors),fields:["name","state","reading","unit"]},
    {key:"portGroups",label:text("شبکه و VLAN","Networks and VLANs"),command:"portgroups",items:rows(facts.portGroups),fields:["name","vlanId","vSwitch"]},
    {key:"services",label:text("سرویس‌های هاست","Host services"),command:"services",items:rows(facts.services),fields:["label","key","running","policy"]},
    {key:"storageAdapters",label:text("کنترلرهای ذخیره‌سازی","Storage adapters"),command:"adapters",items:rows(facts.storageAdapters),fields:["name","model","driver","status"]},
    {key:"firewallRulesets",label:text("فایروال هاست","Host firewall"),command:"firewall",items:rows(facts.firewallRulesets),fields:["label","enabled"]}
  ];
  const names:Record<string,string>={name:text("نام","Name"),capacityBytes:text("ظرفیت","Capacity"),freeBytes:text("فضای آزاد","Free space"),accessible:text("دسترسی","Accessible"),linkUp:text("لینک","Link"),speedMb:text("سرعت لینک","Link speed"),vlanId:"VLAN",vSwitch:text("سوئیچ مجازی","Virtual switch"),label:text("نام","Name"),key:text("شناسه","Key"),running:text("وضعیت اجرا","Running"),policy:text("سیاست اجرا","Policy"),model:text("مدل","Model"),driver:text("درایور","Driver"),status:text("وضعیت","Status"),enabled:text("فعال","Enabled")};
  const field=(key:string,v:unknown)=>key.endsWith("Bytes") ? (typeof v==="number" ? number(v/1024**3," GiB") : unknown)
    : key==="speedMb" ? number(v," Mbps") : typeof v==="boolean" ? state(v,text("بله","Yes"),text("خیر","No")) : show(v);
  Object.assign(names,{ip:text("آدرس IP","IP address"),ports:text("تعداد پورت","Ports"),state:text("وضعیت","State"),reading:text("اندازه‌گیری","Reading"),unit:text("واحد","Unit")});
  const dns=record(facts.dns),time=record(facts.time);
  return <section className="esxi-host" aria-label={text("نمای هاست ESXi","ESXi host overview")}>
    <header><div><small>{text("مدیریت خودِ هاست","Host management")}</small><h2>VMware ESXi</h2></div><span>{ssh?text("SSH · فقط پایش","SSH · Monitoring only"):text("API · عملیات کنترل‌شده","API · Controlled operations")}</span></header>
    <div className="esxi-host__stats">
      {[["CPU",number(facts.cpuPercent,"%")],[text("حافظه","Memory"),number(facts.memoryPercent,"%")],[text("هسته پردازنده","CPU cores"),number(facts.cpuCores)],[text("حافظه کل","Total memory"),typeof facts.memoryBytes==="number"?number(facts.memoryBytes/1024**3," GiB"):unknown]].map(([label,v])=><article key={label}><small>{label}</small><strong>{v}</strong></article>)}
    </div>
    <dl className="esxi-host__identity">
      {[[text("نسخه / بیلد","Version / build"),`${show(facts.version)} / ${show(facts.build)}`],[text("مدل","Model"),show(facts.model)],[text("حالت نگهداری","Maintenance mode"),state(facts.maintenanceMode,text("فعال","Enabled"),text("غیرفعال","Disabled"))],["DNS",Array.isArray(dns.servers)&&dns.servers.length?dns.servers.join(", "):unknown],["NTP",Array.isArray(time.ntpServers)&&time.ntpServers.length?time.ntpServers.join(", "):unknown]].map(([label,v])=><div key={label}><dt>{label}</dt><dd dir="auto">{v}</dd></div>)}
    </dl>
    <p className="esxi-host__notice">{!available?text("اتصال فعلی تأیید نشده؛ این‌ها آخرین اطلاعات دریافت‌شده‌اند.","Current connection is not verified; these are the last collected readings."):text("اطلاعات مربوط به آخرین جمع‌آوری است؛ سلامت سخت‌افزار با در دسترس بودن SSH یکسان نیست.","Readings are from the latest collection; SSH reachability does not prove hardware health.")}</p>
    <div className="esxi-host__groups">{groups.map(group=><details key={group.key}><summary><span>{group.label}</span><small>{collected(group.command)?group.items.length.toLocaleString(locale):text("دریافت نشده","Not collected")}</small></summary>
      {!group.items.length?<p>{collected(group.command)?text("موردی در آخرین پاسخ ثبت نشده است.","No entries in the last response."):text("داده دریافت نشده؛ مجوز حساب و سازگاری نسخه را بررسی کنید.","Not collected; check account permissions and version compatibility.")}</p>:group.items.map((item,i)=><dl key={i}>{group.fields.map(key=><div key={key}><dt>{names[key]}</dt><dd dir="auto">{field(key,item[key])}</dd></div>)}</dl>)}
    </details>)}</div>
    <footer><p>{ssh?text("برای تغییرات هاست، اتصال API را در تنظیم اتصال ثبت و تست کنید. عملیات SSH تغییردهنده فعلاً پشتیبانی نمی‌شود.","Configure and test API access for host changes. SSH mutations are not supported yet."):text("عملیات موجود: ورود/خروج نگهداری، شروع/توقف سرویس مجاز و تنظیم NTP؛ پس از پیش‌نمایش و تأیید.","Available: maintenance enter/exit, allowed service start/stop and NTP setup, with preview and confirmation.")}</p><Link to={ssh?`/assets/devices/${deviceId}/setup`:`/actions?deviceId=${encodeURIComponent(deviceId)}`}>{ssh?text("تنظیم اتصال API","Configure API connection"):text("ساخت اقدام برای هاست","Create host action")}</Link></footer>
  </section>;
}
