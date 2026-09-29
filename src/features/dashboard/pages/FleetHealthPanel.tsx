import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "@/config/frontendEnv";
import "./FleetHealthPanel.css";

type Row={metricKey:string;value:number|null;unit:string;measuredAt:string|null;fresh:boolean};
type Device={id:string;name:string;vendor:string;host:string;connection:string;checkedAt:string|null;collecting:boolean;score:number|null;measuredResources:number;rows:Row[]};
type Fleet={devices:Device[];total:number;pageSize:number;collectionIntervalSeconds:number;generatedAt:string};
export function FleetHealthPanel({isFa}:{isFa:boolean}) {
  const [fleet,setFleet]=useState<Fleet|null>(null);
  const [page,setPage]=useState(0);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState(false);
  const [busy,setBusy]=useState(false);
  const t=(fa:string,en:string)=>isFa?fa:en;
  useEffect(()=>{
    let disposed=false, running=false;
    const controller=new AbortController();
    const load=async()=>{
      if(running) return; running=true; setBusy(true);
      try {
        const response=await fetch(`${API_BASE_URL}/dashboard/device-health?page=${page}`,{credentials:"include",signal:controller.signal});
        if(!response.ok) throw new Error("HEALTH_UNAVAILABLE");
        const data=await response.json() as Fleet;
        if(!disposed){setFleet(data);setError(false);}
      } catch {if(!disposed) setError(true);} finally {running=false;if(!disposed)setBusy(false);}
    };
    void load();
    const interval=window.setInterval(()=>{if(document.visibilityState==="visible") void load();},10_000);
    const visible=()=>{if(document.visibilityState==="visible")void load();};
    document.addEventListener("visibilitychange",visible);
    return()=>{disposed=true;controller.abort();window.clearInterval(interval);document.removeEventListener("visibilitychange",visible);};
  },[page,revision]);
  const date=(value:string|null)=>value?new Date(value).toLocaleString(isFa?"fa-IR":"en-US",{dateStyle:"short",timeStyle:"short"}):t("ثبت نشده","Not recorded");
  return <section className="command-linux-section fleet-health" aria-busy={busy}>
    <header className="command-section-heading"><div><span>{t("تلمتری تجهیزات","Device telemetry")}</span><h2>{t("سلامت همهٔ تجهیزات","Fleet health")}</h2><p>{t("به‌روزرسانی نمایش هر ۱۰ ثانیه؛ جمع‌آوری منابع حداکثر یک‌بار در ۲ دقیقه برای هر تجهیز. سنسور ناموجود، صفر نیست.","Display refreshes every 10s; resource collection at most once per 2 minutes per device. Missing sensors are not zero.")}</p></div><button disabled={busy} onClick={()=>setRevision(v=>v+1)}>{t("به‌روزرسانی نمایش","Refresh display")}</button></header>
    {error&&<p role="alert">{t("دریافت داده ناموفق بود؛ اطلاعات نمایش‌داده‌شده ممکن است قدیمی باشد.","Refresh failed; displayed information may be outdated.")}</p>}
    {!fleet&&!error&&<p>{t("در حال دریافت…","Loading…")}</p>}
    {fleet?.total===0&&<p>{t("هنوز تجهیزی ثبت نشده است.","No devices registered.")}</p>}
    <div className="fleet-health-grid">{fleet?.devices.map(device=>{
      const connectionFresh=!!device.checkedAt&&Date.now()-new Date(device.checkedAt).getTime()<300_000;
      const connected=connectionFresh&&device.connection==="online";
      const currentRows=device.rows.map(r=>({...r,fresh:r.fresh&&!!r.measuredAt&&Date.now()-new Date(r.measuredAt).getTime()<300_000}));
      const resourceFresh=currentRows.some(r=>r.fresh&&r.unit==="percent");
      const score=connected&&resourceFresh&&!error?device.score:null;
      const storage=currentRows.find(r=>r.metricKey==="disk.usage_percent"&&r.value!==null)??currentRows.find(r=>r.metricKey==="datastore.usage_percent");
      const legend=[{label:"CPU",row:currentRows.find(r=>r.metricKey==="cpu.usage_percent")},{label:t("حافظه","Memory"),row:currentRows.find(r=>r.metricKey==="memory.usage_percent")},{label:storage?.metricKey==="datastore.usage_percent"?"Datastore":t("دیسک","Disk"),row:storage}];
      const status=!connectionFresh?t("وضعیت نامشخص","Unknown connection"):connected?t("آنلاین","Online"):t("اتصال تأیید نشده","Connection unverified");
      return <article className="linux-server-card command-linux-card" key={device.id}>
        <header className="linux-server-card__header"><div><h3>{device.name}</h3><span dir="ltr">{device.vendor} · {device.host}</span></div><span className="dashboard-status">{status}</span></header>
        <div className="linux-health-visual"><div className="linux-health-dial" style={{"--health-angle":`${(score??0)*3.6}deg`,"--health-color":score===null?"#64748b":score>=75?"#70c7bc":"#d3ad73"} as CSSProperties} aria-label={t("سلامت منابع","Resource health")}><div><span>{t("سلامت منابع","Resource health")}</span><strong>{score===null?"—":score}<small>/ 100</small></strong><em>{score===null?t("منتظر دادهٔ معتبر","Awaiting fresh data"):t(`${device.measuredResources} سنسور معتبر`,`${device.measuredResources} fresh sensors`)}</em></div></div>
        <dl className="linux-resource-chart">{legend.map(({label,row})=>{const fresh=connected&&row?.fresh&&!error;return <div key={label} style={{"--metric-color":"#70b8c2"} as CSSProperties}><dt><b>{label}</b><strong>{row?.value===null||!row?"—":`${Math.round(row.value)}%`}</strong></dt><dd><i style={{width:fresh?`${row!.value??0}%`:"0%"}}/></dd><small>{!row||row.value===null?t("سنسور در دسترس نیست","Sensor unavailable"):fresh?date(row.measuredAt):t("آخرین مقدار؛ قدیمی / اتصال نامعتبر","Last value; stale / unverified connection")}</small></div>;})}</dl></div>
        {currentRows.filter(r=>r.value!==null&&r.unit==="count").map(r=><p key={r.metricKey}>{({"interfaces.down_count":t("اینترفیس پایین","Interfaces down"),"vpn.active_count":t("تونل فعال","Active tunnels"),"sessions.count":t("نشست‌ها","Sessions")} as Record<string,string>)[r.metricKey]}: {r.value} · {r.fresh&&connected&&!error?date(r.measuredAt):t("آخرین مقدار ثبت‌شده","Last recorded value")}</p>)}
        <footer><span>{t("آخرین بررسی اتصال: ","Connection check: ")}{date(device.checkedAt)}{device.collecting&&t(" · در حال جمع‌آوری"," · Collecting")}</span><Link to={`/assets/devices/${device.id}/overview`}>{t("جزئیات","Details")}</Link></footer>
      </article>;
    })}</div>
    {!!fleet&&fleet.total>fleet.pageSize&&<nav className="fleet-pages"><button disabled={page===0||busy} onClick={()=>{setFleet(null);setPage(v=>v-1);}}>{t("قبلی","Previous")}</button><span>{page+1} / {Math.ceil(fleet.total/fleet.pageSize)}</span><button disabled={(page+1)*fleet.pageSize>=fleet.total||busy} onClick={()=>{setFleet(null);setPage(v=>v+1);}}>{t("بعدی","Next")}</button></nav>}
  </section>;
}
