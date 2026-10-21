import { useEffect, useRef, useState } from "react";
import { Camera, Clock3, ImageOff, LoaderCircle, Play } from "lucide-react";
import { cameraImageResponse } from "@/lib/cameras";
import "./CameraThumbnail.css";

// A company grid never opens a decoder for every camera at once.
let active = 0;
const waiting: Array<()=>void> = [];
async function queued<T>(signal: AbortSignal, work:()=>Promise<T>):Promise<T> {
  await new Promise<void>(resolve=>{const start=()=>{active++;resolve();};if(active<2)start();else waiting.push(start);});
  try { if(signal.aborted)throw new DOMException("Aborted","AbortError");return await work(); }
  finally {active--;waiting.shift()?.();}
}
export function CameraThumbnail({id,profile,name,isFa,onOpen,revision}:{id:string;profile?:string;name:string;isFa:boolean;onOpen:()=>void;revision:string}) {
  const root=useRef<HTMLButtonElement>(null),[visible,setVisible]=useState(false),[src,setSrc]=useState(""),[captured,setCaptured]=useState(""),[stale,setStale]=useState(false),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
  const t=(fa:string,en:string)=>isFa?fa:en;
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:"180px"});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    setSrc("");setCaptured("");setFailed(false);setStale(false);setBusy(false);
    if(!profile||!visible)return;
    let disposed=false,running=false,url="",timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,due=0;
    const load=async()=>{
      if(disposed||running||document.hidden)return;
      if(Date.now()<due){timer=setTimeout(()=>void load(),due-Date.now());return;}
      running=true;controller=new AbortController();const signal=controller.signal;setBusy(true);
      try{
        const response=await queued(signal,()=>cameraImageResponse(id,profile,"thumbnail",signal));
        const blob=await response.blob();if(disposed||signal.aborted)return;
        if(!response.headers.get("Content-Type")?.startsWith("image/jpeg")||blob.size>128*1024)throw new Error("Invalid thumbnail");
        const next=URL.createObjectURL(blob);if(url)URL.revokeObjectURL(url);url=next;setSrc(next);
        const at=response.headers.get("X-Camera-Captured-At")??"";setCaptured(Number.isFinite(Date.parse(at))?at:"");setStale(response.headers.get("X-Camera-Stale")==="true");setFailed(false);
        const after=Number(response.headers.get("X-Camera-Refresh-After"));due=Date.now()+(Number.isFinite(after)&&after>=1000?Math.min(after,10_800_000):10_800_000);
      }catch{if(disposed||signal.aborted)return;setFailed(true);setStale(Boolean(url));due=Date.now()+300_000;}
      finally{running=false;if(!disposed&&!signal.aborted){setBusy(false);timer=setTimeout(()=>void load(),Math.max(1000,due-Date.now()));}}
    };
    const visibility=()=>{if(timer)clearTimeout(timer);if(!document.hidden)void load();};
    document.addEventListener("visibilitychange",visibility);void load();
    return()=>{disposed=true;controller?.abort();if(timer)clearTimeout(timer);if(url)URL.revokeObjectURL(url);document.removeEventListener("visibilitychange",visibility);};
  },[id,profile,visible,revision]);
  const time=captured?new Date(captured).toLocaleString(isFa?"fa-IR":"en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  return <button type="button" className={`camera-thumbnail ${src?"has-image":""}`} ref={root} onClick={onOpen} aria-label={t(`نمایش تصویر ${name}`,`View ${name}`)}>
    {src?<img src={src} alt={t(`آخرین نمای ${name}`,`Last captured view of ${name}`)} decoding="async"/>:<span className="camera-thumbnail__empty">{busy?<LoaderCircle className="camera-spin" size={25}/>:failed?<ImageOff size={27}/>:<Camera size={29}/>}<span>{busy?t("دریافت پیش‌نمایش…","Loading preview…"):failed?t("پیش‌نمایش در دسترس نیست","Preview unavailable"):!profile?t("ابتدا اتصال را تکمیل کن","Set up the connection first"):t("پیش‌نمایش دوربین","Camera preview")}</span></span>}
    <span className="camera-thumbnail__badge">{t("تصویر دوره‌ای · هر ۳ ساعت","Periodic image · every 3 hours")}</span>
    {src&&<><span className="camera-thumbnail__play"><Play size={20}/></span><span className="camera-thumbnail__time"><Clock3 size={12}/>{time||t("زمان نامشخص","Time unavailable")}{stale&&<b>{t("قدیمی؛ دریافت جدید ناموفق","Stale; refresh failed")}</b>}</span></>}
  </button>;
}
