import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { API_BASE_URL } from "@/config/frontendEnv";
import "./FleetHealthPanel.css";

type Row = { metricKey:string; value:number|null; unit:string; measuredAt:string|null; fresh:boolean };
type Device = { id:string; name:string; vendor:string; host:string; connection:string; checkedAt:string|null; collecting:boolean; collectionError?:string|null; score:number|null; rows:Row[] };
type Fleet = { devices:Device[]; total:number; pageSize:number };
const recent = (at:string|null) => !!at && Date.now()-Date.parse(at)<=300_000 && Date.parse(at)<=Date.now()+30_000;

export function FleetHealthPanel({isFa}:{isFa:boolean}) {
  const [fleet,setFleet]=useState<Fleet|null>(null),[page,setPage]=useState(0);
  const [error,setError]=useState(false),[busy,setBusy]=useState(false);
  const t=(fa:string,en:string)=>isFa?fa:en,locale=isFa?"fa-IR":"en-US";
  useEffect(()=>{
    let disposed=false,running=false;const controller=new AbortController();
    const load=async()=>{
      if(running)return;running=true;setBusy(true);
      try{const response=await fetch(`${API_BASE_URL}/dashboard/device-health?page=${page}`,{credentials:"include",signal:controller.signal});if(!response.ok)throw new Error("HEALTH_UNAVAILABLE");const data=await response.json() as Fleet;if(!disposed){setFleet(data);setError(false);}}
      catch{if(!disposed)setError(true);}finally{running=false;if(!disposed)setBusy(false);}
    };
    void load();const interval=window.setInterval(()=>{if(document.visibilityState==="visible")void load();},10_000);
    const visible=()=>{if(document.visibilityState==="visible")void load();};document.addEventListener("visibilitychange",visible);
    return()=>{disposed=true;controller.abort();window.clearInterval(interval);document.removeEventListener("visibilitychange",visible);};
  },[page]);
  const date=(at:string|null)=>at?new Date(at).toLocaleString(locale,{dateStyle:"short",timeStyle:"short"}):t("ثبت نشده","Not recorded");
  return <section className="command-linux-section fleet-health" aria-busy={busy}>
    <header className="fleet-heading"><div><span className="fleet-live-indicator"><i/>{t("وضعیت تجهیزات","Device status")}</span><h2>{t("سلامت دارایی‌ها","Asset health")}</h2><p>{t("CPU، حافظه و فضای ذخیره‌سازیِ اندازه‌گیری‌شده","Measured CPU, memory and storage")}</p></div></header>
    {error&&<p role="alert">{t("تازه‌سازی ناموفق؛ اطلاعات ممکن است قدیمی باشد.","Refresh failed; data may be outdated.")}</p>}
    {!fleet&&!error&&<p>{t("در حال دریافت…","Loading…")}</p>}
    {fleet?.total===0&&<p>{t("تجهیزی ثبت نشده است.","No devices registered.")}</p>}
    <div className="fleet-health-grid">{fleet?.devices.map(device=>{
      const state=error||!recent(device.checkedAt)?"unknown":device.connection==="online"?"online":device.connection==="offline"?"offline":"unknown";
      const connected=state==="online"&&!device.collectionError;
      const resource=(key:string)=>device.rows.find(row=>row.metricKey===key);
      const current=(row?:Row)=>connected&&!!row?.fresh&&recent(row.measuredAt)&&row.value!==null;
      const disk=resource("disk.usage_percent"),datastore=resource("datastore.usage_percent");
      const storage=[disk,datastore].find(row=>row?.value!==null&&row?.value!==undefined)||[disk,datastore].find(row=>!!row?.measuredAt);
      const rows=[
        {label:"CPU",row:resource("cpu.usage_percent"),icon:Cpu,color:"#22d3ee"},
        {label:t("حافظه","Memory"),row:resource("memory.usage_percent"),icon:MemoryStick,color:"#a78bfa"},
        ...(storage?[{label:storage.metricKey==="datastore.usage_percent"?t("فضای داده","Datastore"):t("دیسک","Disk"),row:storage,icon:HardDrive,color:"#f59e0b"}]:[])
      ];
      const coverage=rows.filter(item=>current(item.row)).length;
      const score=coverage&&connected&&Number.isFinite(device.score)?device.score:null;
      const color=score===null?"#52687a":"#fbbf24";
      return <article className="fleet-device fleet-summary" key={device.id}>
        <header><div><h3>{device.name}</h3><span dir="ltr">{device.vendor} · {device.host}</span></div><span className={`fleet-status is-${state}`}><i/>{state==="online"?t("آنلاین","Online"):state==="offline"?t("آفلاین","Offline"):t("نامشخص","Unknown")}</span></header>
        <div className="fleet-summary-visual">
          <div className="fleet-summary-dial" style={{"--fleet-health-angle":`${(score??0)*3.6}deg`,"--health-color":color} as CSSProperties} aria-label={t("امتیاز سلامت منابع","Resource health score")}><div><span>{t("سلامت منابع","Resource health")}</span><strong>{score===null?"—":score.toLocaleString(locale)}<small>/ {Number(100).toLocaleString(locale)}</small></strong><em>{score===null?t("منتظر دادهٔ معتبر","Awaiting fresh data"):t(`${coverage.toLocaleString(locale)} از ${rows.length.toLocaleString(locale)} سنسور به‌روز`,`${coverage} of ${rows.length} sensors current`)}</em></div></div>
          <dl className="fleet-summary-resources">{rows.map(({label,row,icon:Icon,color:metricColor})=>{
            const valid=current(row),measured=row?.value!=null;
            return <div key={label} style={{"--metric-color":metricColor} as CSSProperties}><dt><span><Icon size={15}/>{label}</span><strong>{measured?`${row.value!.toLocaleString(locale,{maximumFractionDigits:1})}%`:"—"}</strong></dt><dd><i style={{width:valid?`${Math.max(0,Math.min(100,row!.value!))}%`:"0%"}}/></dd><small>{!measured?t("سنسور در دسترس نیست","Sensor unavailable"):valid?t("به‌روز","Current"):t("آخرین مقدار؛ قدیمی / تأییدنشده","Last value; stale / unverified")}</small></div>;
          })}</dl>
        </div>
        {!storage&&connected?<p className="fleet-sensor-note">{t("این تجهیز سنسور ذخیره‌سازی گزارش نمی‌کند؛ فقط داده‌های واقعی نمایش داده شده‌اند.","This device does not report a storage sensor; only measured data is shown.")}</p>:null}
        {device.collectionError&&<p className="fleet-collection-error">{device.collectionError==="AUTHENTICATION_FAILED"?t("ورود برای خواندن سنسورها رد شد؛ اعتبارنامه را بررسی کنید.","Sensor login rejected; check credentials."):t("جمع‌آوری سنسورها ناموفق بود؛ اتصال را بررسی کنید.","Sensor collection failed; check connection.")}</p>}
        <footer><span>{device.collecting?t("در حال جمع‌آوری…","Collecting…"):date(device.checkedAt)}</span><Link to={`/assets/devices/${device.id}/overview`}>{t("جزئیات و نمودارها","Details & charts")}</Link></footer>
      </article>;
    })}</div>
    {!!fleet&&fleet.total>fleet.pageSize&&<nav className="fleet-pages"><button disabled={page===0||busy} onClick={()=>{setFleet(null);setPage(v=>v-1);}}>{t("قبلی","Previous")}</button><span>{page+1} / {Math.ceil(fleet.total/fleet.pageSize)}</span><button disabled={(page+1)*fleet.pageSize>=fleet.total||busy} onClick={()=>{setFleet(null);setPage(v=>v+1);}}>{t("بعدی","Next")}</button></nav>}
  </section>;
}
