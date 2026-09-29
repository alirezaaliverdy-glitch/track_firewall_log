import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Cpu, MemoryStick, Network, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/config/frontendEnv";
import type { Reading } from "@/features/assets/components/assetChartData";
import { FleetMiniChart } from "./FleetMiniChart";
import "./FleetHealthPanel.css";

type Row={metricKey:string;value:number|null;unit:string;measuredAt:string|null;fresh:boolean};
type Device={id:string;name:string;vendor:string;host:string;connection:string;checkedAt:string|null;collecting:boolean;collectionError?:string|null;rows:Row[];charts?:{cpu:Reading[];memory:Reading[];availability:Reading[];traffic:{interface:string|null;method:string;rx:Reading[];tx:Reading[]}}};
type Fleet={devices:Device[];total:number;pageSize:number;collectionIntervalSeconds:number;generatedAt:string};
export function FleetHealthPanel({isFa}:{isFa:boolean}) {
  const [fleet,setFleet]=useState<Fleet|null>(null),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
  const [error,setError]=useState(false),[busy,setBusy]=useState(false),[motion,setMotion]=useState(true);
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
  },[page,revision]);
  const time=(value:string|null)=>value?new Date(value).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—";
  const fresh=(value:string|null)=>!!value&&Date.now()-Date.parse(value)<300_000&&Date.parse(value)<=Date.now()+30_000;
  return <section className="command-linux-section fleet-health" aria-busy={busy}>
    <header className="fleet-heading"><div><span className="fleet-live-indicator"><i/>{t("مانیتورینگ تجهیزات","Device monitoring")}</span><h2>{t("وضعیت زندهٔ دارایی‌ها","Live asset status")}</h2><p>{t("روند ثبت‌شدهٔ CPU، حافظه، ترافیک و دسترسی؛ بدون دادهٔ ساختگی","Recorded CPU, memory, traffic and availability; no simulated values")}</p></div><div className="fleet-controls"><button type="button" aria-pressed={motion} onClick={()=>setMotion(v=>!v)}>{t("حرکت نمودار","Chart motion")}: {motion?t("روشن","On"):t("خاموش","Off")}</button><button type="button" disabled={busy} onClick={()=>setRevision(v=>v+1)} aria-label={t("تازه‌سازی نمایش","Refresh display")}><RefreshCw size={15}/>{t("تازه‌سازی","Refresh")}</button></div></header>
    {error&&<p role="alert">{t("تازه‌سازی ناموفق؛ داده‌ها ممکن است قدیمی باشند.","Refresh failed; data may be outdated.")}</p>}
    {!fleet&&!error&&<p>{t("در حال دریافت…","Loading…")}</p>}
    {fleet?.total===0&&<p>{t("تجهیزی ثبت نشده است.","No devices registered.")}</p>}
    <div className="fleet-health-grid">{fleet?.devices.map(device=>{
      const connected=!error&&fresh(device.checkedAt)&&device.connection==="online";
      const state=error||!fresh(device.checkedAt)?"unknown":device.connection==="online"?"online":device.connection==="offline"?"offline":"unknown";
      const charts=device.charts,traffic=charts?.traffic;
      const resource=(key:string)=>device.rows.find(row=>row.metricKey===key);
      const metricValue=(row:Row|undefined)=>row?.value!==null&&row?.value!==undefined?`${row.value.toLocaleString(locale,{maximumFractionDigits:1})}%`:"—";
      const cpu=resource("cpu.usage_percent"),memory=resource("memory.usage_percent");
      const plots=[
        {key:"cpu",title:"CPU",icon:Cpu,unit:"%",value:metricValue(cpu),at:cpu?.measuredAt??null,series:[{name:"CPU",color:"#7da5e8",points:charts?.cpu??[]}]},
        {key:"memory",title:t("حافظه","Memory"),icon:MemoryStick,unit:"%",value:metricValue(memory),at:memory?.measuredAt??null,series:[{name:t("حافظه","Memory"),color:"#b09bda",points:charts?.memory??[]}]},
        {key:"traffic",title:t("ترافیک","Traffic"),icon:Network,unit:"Mbps",value:[traffic?.rx.at(-1)?.value,traffic?.tx.at(-1)?.value].filter((v):v is number=>typeof v==="number").reduce((sum,v)=>sum+v,0).toLocaleString(locale,{maximumFractionDigits:3}),at:[...(traffic?.rx??[]),...(traffic?.tx??[])].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))[0]?.timestamp??null,series:[{name:t("دریافت","RX"),color:"#7eaeb7",points:traffic?.rx??[]},{name:t("ارسال","TX"),color:"#c4ac80",points:traffic?.tx??[]}]},
        {key:"availability",title:t("دسترسی","Availability"),icon:Activity,unit:"",value:state==="online"?t("برقرار","Online"):state==="offline"?t("قطع","Offline"):t("نامشخص","Unknown"),at:device.checkedAt,series:[{name:t("دسترسی","Availability"),color:state==="offline"?"#d19498":"#8cb3a2",points:charts?.availability??[]}]}
      ];
      return <article className="fleet-device" key={device.id}>
        <header><div><h3>{device.name}</h3><span dir="ltr">{device.vendor} · {device.host}</span></div><span className={`fleet-status is-${state}`}><i/>{state==="online"?t("آنلاین","Online"):state==="offline"?t("آفلاین","Offline"):t("نامشخص","Unknown")}</span></header>
        <div className="fleet-device-plots">{plots.map(plot=>{const hasData=plot.series.some(s=>s.points.length>0),current=plot.key==="availability"?!error&&fresh(plot.at):connected&&fresh(plot.at);return <section key={plot.key} className={`fleet-metric ${motion&&current?"is-live":""}`}><div className="fleet-metric-title"><span><plot.icon size={13}/>{plot.title}</span><strong>{hasData?plot.value:"—"}{hasData&&plot.unit&&<small>{plot.unit}</small>}</strong></div>{hasData?<FleetMiniChart title={plot.title} series={plot.series} unit={plot.unit} binary={plot.key==="availability"} motion={motion&&current} locale={locale}/>:<div className="fleet-metric-empty">{t("هنوز نمونهٔ معتبر نداریم","No verified sample yet")}</div>}<small className="fleet-metric-note">{hasData?`${current?t("آخرین نمونه","Last sample"):t("دادهٔ تاریخی","Historical")} · ${time(plot.at)}`:t("جمع‌آوری/مجوز دسترسی را بررسی کنید","Check collection / permissions")}</small></section>;})}</div>
        {traffic?.interface&&<p className="fleet-traffic-note">{t("ترافیک اینترفیس","Interface traffic")} <b dir="ltr">{traffic.interface}</b> · {traffic.method==="device_5m_average"?t("میانگین ۵ دقیقهٔ دستگاه","Device 5-minute average"):t("اختلاف شمارندهٔ واقعی","Measured counter delta")}</p>}
        {device.collectionError&&<p className="fleet-collection-error">{device.collectionError==="AUTHENTICATION_FAILED"?t("هاست قابل‌دسترسی است، اما ورود برای خواندن سنسورها رد شد. اعتبارنامهٔ اتصال را اصلاح کنید.","Host reachable, but sensor authentication was rejected. Update the connection credential."):t("جمع‌آوری سنسورها ناموفق بود؛ اتصال و مجوز خواندن را بررسی کنید.","Sensor collection failed; check connection and read permissions.")}</p>}
        <footer><span>{device.collecting?t("در حال جمع‌آوری…","Collecting…"):t("نمایش ۱۰ ثانیه · جمع‌آوری ≥۲ دقیقه","Display 10s · collection ≥2m")}</span><Link to={`/assets/devices/${device.id}/overview`}>{t("جزئیات و سنسورها","Details & sensors")}</Link></footer>
      </article>;
    })}</div>
    {!!fleet&&fleet.total>fleet.pageSize&&<nav className="fleet-pages"><button disabled={page===0||busy} onClick={()=>{setFleet(null);setPage(v=>v-1);}}>{t("قبلی","Previous")}</button><span>{page+1} / {Math.ceil(fleet.total/fleet.pageSize)}</span><button disabled={(page+1)*fleet.pageSize>=fleet.total||busy} onClick={()=>{setFleet(null);setPage(v=>v+1);}}>{t("بعدی","Next")}</button></nav>}
  </section>;
}
