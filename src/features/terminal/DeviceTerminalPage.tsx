import { useCallback, useEffect, useRef, useState } from "react";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronRight, CircleHelp, Eraser, Expand, Info, Keyboard, KeyRound, LoaderCircle, PlugZap, Power, ShieldCheck, TerminalSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppearance } from "@/lib/appearance";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { terminalApi, terminalCloseReason, terminalError, type TerminalInfo, type TerminalPreview, type TerminalRead } from "./terminalApi";
import "@xterm/xterm/css/xterm.css";
import "./DeviceTerminalPage.css";

type State="idle"|"checking"|"connecting"|"connected"|"recovering"|"closed";
function terminalPalette(appearance:string){
  return appearance==="light"
    ? {background:"#d5e0e2",foreground:"#283344",cursor:"#166c52",selectionBackground:"#a8bfc8",black:"#283344",red:"#b42343",green:"#13734d",yellow:"#87590b",blue:"#4338ca",magenta:"#7e3ba0",cyan:"#096f76",white:"#475569",brightBlack:"#526476",brightWhite:"#0f172a"}
    : {background:"#0b1622",foreground:"#dbe8f5",cursor:"#5eead4",selectionBackground:"#4f46e566",black:"#111827",red:"#fb7185",green:"#34d399",yellow:"#fbbf24",blue:"#818cf8",magenta:"#c4b5fd",cyan:"#67e8f9",white:"#f1f5f9",brightBlack:"#94a3b8",brightWhite:"#ffffff"};
}
export default function DeviceTerminalPage({params}:RouteComponentProps){
  const {user}=useAuth(),{i18n}=useTranslation(),isFa=i18n.language.startsWith("fa"),id=params.deviceId;
  const appearance=useAppearance(),pane=useRef<HTMLElement>(null);
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  const t=useCallback((fa:string,en:string)=>isFa?fa:en,[isFa]);
  const [info,setInfo]=useState<TerminalInfo|null>(null),[state,setState]=useState<State>("idle"),[preview,setPreview]=useState<TerminalPreview|null>(null),[error,setError]=useState(""),[reason,setReason]=useState(""),[connectedAt,setConnectedAt]=useState(0),[elapsed,setElapsed]=useState(0),[paste,setPaste]=useState("");
  const root=useRef<HTMLDivElement>(null),screen=useRef<HTMLDivElement>(null),term=useRef<Terminal|null>(null),fit=useRef<FitAddon|null>(null),dialog=useRef<HTMLDialogElement>(null),pasteDialog=useRef<HTMLDialogElement>(null);
  const [opened,setOpened]=useState(false);
  const live=useRef<{id:string;cursor:number;sequence:number}|null>(null),sendQueue=useRef(Promise.resolve()),pending=useRef(""),inputTimer=useRef<ReturnType<typeof setTimeout>|null>(null),disposed=useRef(false),generation=useRef(0),readState=useRef<State>(state),controller=useRef<AbortController|null>(null);
  readState.current=state;
  const stop=useCallback(async()=>{
    generation.current++;controller.current?.abort();const session=live.current;live.current=null;pending.current="";if(inputTimer.current)clearTimeout(inputTimer.current);
    if(session)await terminalApi(`/terminal-sessions/${session.id}/close`,{},{keepalive:true}).catch(()=>{});
  },[]);
  const send=useCallback((data:string)=>{
    const session=live.current;if(!session||readState.current!=="connected")return;
    if(new TextEncoder().encode(data).length>32768){setError(terminalError(new Error("TERMINAL_INPUT_LIMIT"),isFa));return;}
    sendQueue.current=sendQueue.current.then(async()=>{
      if(live.current!==session)return;
      try{await terminalApi(`/terminal-sessions/${session.id}/input`,{data,sequence:++session.sequence});}
      catch(e){if(live.current!==session)return;setError(terminalError(e,isFa));setState("closed");void stop();}
    });
  },[isFa,stop]);
  const enqueue=useCallback((data:string)=>{
    if(!live.current||readState.current!=="connected")return;
    if(data.length>4096){if(pending.current){send(pending.current);pending.current="";}setPaste(data);pasteDialog.current?.showModal();return;}
    pending.current+=data;
    if(pending.current.length>32768){pending.current="";setError(terminalError(new Error("TERMINAL_INPUT_LIMIT"),isFa));return;}
    if(!inputTimer.current)inputTimer.current=setTimeout(()=>{const data=pending.current;pending.current="";inputTimer.current=null;send(data);},30);
  },[isFa,send]);
  const enqueueRef=useRef(enqueue);enqueueRef.current=enqueue;
  useEffect(()=>{
    disposed.current=false;setOpened(false);setState("idle");setConnectedAt(0);setReason("");const box=screen.current;if(!box||user?.role!=="admin")return;
    const terminal=new Terminal({cursorBlink:true,scrollback:2500,fontSize:14,fontFamily:'"Cascadia Code", Consolas, monospace',lineHeight:1.35,convertEol:false,allowProposedApi:false,disableStdin:true,theme:terminalPalette("dark"),letterSpacing:0,fontWeight:"400",fontWeightBold:"700",linkHandler:{activate:()=>{}}});
    const addon=new FitAddon();terminal.loadAddon(addon);terminal.open(box);term.current=terminal;fit.current=addon;
    // Device output cannot read/write the browser clipboard or launch links.
    terminal.parser.registerOscHandler(52,()=>true);
    const subscription=terminal.onData(data=>enqueueRef.current(data));
    let resizeTimer:ReturnType<typeof setTimeout>;
    const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      if(box.clientWidth<40||box.clientHeight<40)return;
      addon.fit();if(terminal.cols>240||terminal.rows>80)terminal.resize(Math.min(240,terminal.cols),Math.min(80,terminal.rows));
      const s=live.current;if(s&&readState.current==="connected")void terminalApi(`/terminal-sessions/${s.id}/resize`,{cols:Math.max(20,terminal.cols),rows:Math.max(5,terminal.rows)}).catch(()=>{});
    },120);};
    const observer=new ResizeObserver(resize);observer.observe(box);resize();
    const unload=()=>{void stop();};window.addEventListener("pagehide",unload);
    return()=>{disposed.current=true;void stop();observer.disconnect();clearTimeout(resizeTimer);subscription.dispose();terminal.dispose();term.current=null;fit.current=null;window.removeEventListener("pagehide",unload);};
  },[id,user?.role,stop]);
  useEffect(()=>{if(term.current)term.current.options.theme=terminalPalette(appearance);},[appearance,id,user?.role]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const resize=()=>{const height=viewport?.height??window.innerHeight;root.current?.style.setProperty("--terminal-viewport-height",`${height}px`);if(root.current)root.current.dataset.keyboard=height<window.innerHeight*.75?"open":"closed";};
    resize();viewport?.addEventListener("resize",resize);window.addEventListener("resize",resize);
    return()=>{viewport?.removeEventListener("resize",resize);window.removeEventListener("resize",resize);};
  },[]);
  useEffect(()=>{setInfo(null);setError("");if(user?.role!=="admin")return;const abort=new AbortController();void terminalApi<TerminalInfo>(`/devices/${encodeURIComponent(id)}/terminal`,undefined,{signal:abort.signal}).then(setInfo).catch(e=>{if(!abort.signal.aborted)setError(terminalError(e,isFa));});return()=>abort.abort();},[id,isFa,user?.role]);
  useEffect(()=>{if(!connectedAt)return;const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-connectedAt)/1000)),1000);return()=>clearInterval(timer);},[connectedAt]);
  useEffect(()=>{if(preview)dialog.current?.showModal();},[preview]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(live.current){event.preventDefault();}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[]);
  const prepare=async()=>{
    if(state==="checking"||state==="connecting"||live.current)return;setState("checking");setError("");setReason("");
    const token=++generation.current;
    try{const p=await terminalApi<TerminalPreview>(`/devices/${encodeURIComponent(id)}/terminal/preview`,{});if(!disposed.current&&token===generation.current){setPreview(p);setState("idle");}}
    catch(e){if(!disposed.current&&token===generation.current){setState("idle");setError(terminalError(e,isFa));}}
  };
  const connect=async()=>{
    if(!preview||state==="connecting")return;
    dialog.current?.close();setState("connecting");setError("");const token=++generation.current;
    try{
      const result=await terminalApi<{id:string}>(`/devices/${encodeURIComponent(id)}/terminal/sessions`,{previewId:preview.previewId,intent:"execute",confirmed:true,cols:Math.max(20,Math.min(240,term.current?.cols??80)),rows:Math.max(5,Math.min(80,term.current?.rows??24))});
      if(disposed.current||generation.current!==token){await terminalApi(`/terminal-sessions/${result.id}/close`,{}).catch(()=>{});return;}
      const session={id:result.id,cursor:0,sequence:0};live.current=session;sendQueue.current=Promise.resolve();setOpened(true);setState("connected");readState.current="connected";setConnectedAt(Date.now());setElapsed(0);setPreview(null);
      term.current?.reset();if(term.current)term.current.options.disableStdin=false;term.current?.focus();
      let failures=0;
      while(live.current===session&&!disposed.current){
        const abort=new AbortController();controller.current=abort;const deadline=setTimeout(()=>abort.abort(),12_000);
        try{
          const chunk=await terminalApi<TerminalRead>(`/terminal-sessions/${session.id}?cursor=${session.cursor}`,undefined,{signal:abort.signal});
          if(live.current!==session)break;
          failures=0;setState("connected");readState.current="connected";if(term.current)term.current.options.disableStdin=false;
          if(chunk.truncated){term.current?.reset();term.current?.writeln(t("[خروجی قدیمی از حافظهٔ محدود نشست خارج شد]","[Older output left the bounded session buffer]"));}
          if(chunk.data){const bytes=Uint8Array.from(atob(chunk.data),char=>char.charCodeAt(0));await new Promise<void>(resolve=>{if(term.current)term.current.write(bytes,resolve);else resolve();});}
          session.cursor=chunk.cursor;
          if(chunk.state==="closed"&&!chunk.hasMore){setReason(terminalCloseReason(chunk.reason,isFa));setState("closed");if(term.current)term.current.options.disableStdin=true;live.current=null;setConnectedAt(0);break;}
        }catch(e){
          if(live.current!==session)break;
          if(++failures>=3 || (e instanceof Error&&!['Failed to fetch','The user aborted a request.','TERMINAL_SERVICE_UNAVAILABLE','fetch failed'].includes(e.message)&&e.name!=="AbortError")){setError(terminalError(e,isFa));setState("closed");setConnectedAt(0);void stop();break;}
          setState("recovering");readState.current="recovering";if(term.current)term.current.options.disableStdin=true;
        }finally{clearTimeout(deadline);}
        await new Promise(resolve=>setTimeout(resolve,document.hidden?1500:400));
      }
    }catch(e){if(!disposed.current&&token===generation.current){setState("closed");setError(terminalError(e,isFa));}}
  };
  const disconnect=async()=>{setState("closed");readState.current="closed";setConnectedAt(0);if(term.current)term.current.options.disableStdin=true;setReason(t("به درخواست شما قطع شد","Disconnected by you"));await stop();};
  const active=state==="connected"||state==="recovering",busy=state==="checking"||state==="connecting";
  const status=({idle:t("آمادهٔ اتصال","Ready to connect"),checking:t("بررسی هویت دستگاه","Checking device identity"),connecting:t("در حال اتصال","Connecting"),connected:t("متصل","Connected"),recovering:t("در حال دریافت دوبارهٔ خروجی","Restoring output connection"),closed:t("نشست بسته است","Session closed")})[state];
  return <div ref={root} className="terminal-page" dir={isFa?"rtl":"ltr"}>
    <header className="terminal-heading"><div><Link to={`/assets/devices/${encodeURIComponent(id)}`}><ArrowRight size={15}/>{t("بازگشت به تجهیز","Back to device")}</Link><span className="terminal-eyebrow">EOSNET / {t("مدیریت یکپارچه","Unified management")}</span><h1>{t("کنسول مستقیم تجهیز","Device command line")}</h1><p>{t("یک فضای متمرکز برای کار با CLI واقعی دستگاه.","A focused workspace for your device's real CLI.")}</p></div><span className="terminal-heading-icon"><TerminalSquare size={30}/></span></header>
    {user?.role!=="admin"?<div className="terminal-notice" role="alert">{terminalError(new Error("TERMINAL_ADMIN_REQUIRED"),isFa)}</div>:<>
      <div className="terminal-layout"><section ref={pane} className="terminal-console" aria-label={t("ترمینال SSH","SSH terminal")}>
        <header className="terminal-console__bar"><div className="terminal-window-dots" aria-hidden="true"><i/><i/><i/></div><div className="terminal-target"><strong>{info?.device.name??t("دستگاه","Device")}</strong><span dir="ltr">{info?`${info.username??"SSH"}@${info.device.host}:${info.device.port}`:"SSH / CLI"}</span></div><span className={`terminal-state is-${state}`} role="status"><i/>{status}</span></header>
        <div className="terminal-tools"><span><ShieldCheck size={14}/>{t("ارتباط رمزنگاری‌شده SSH","Encrypted SSH transport")}</span><div><button type="button" disabled={!active} onClick={()=>{term.current?.clear();term.current?.focus();}} title={t("پاک کردن نمای ترمینال","Clear terminal viewport")} aria-label={t("پاک کردن نمای ترمینال","Clear terminal viewport")}><Eraser size={16}/></button><button type="button" onClick={()=>pane.current?.requestFullscreen?.().catch(()=>{})} title={t("تمام صفحه","Fullscreen")} aria-label={t("تمام صفحه","Fullscreen")}><Expand size={16}/></button></div></div>
        <div className="terminal-stage"><div ref={screen} className="terminal-screen" dir="ltr"/>{!active&&!opened&&<div className="terminal-welcome"><span><TerminalSquare size={31}/></span><h2>{state==="closed"?t("نشست پایان یافت","Session ended"):t("آماده برای مدیریت","Ready when you are")}</h2><p>{reason||t("اتصال را بررسی کن و وارد محیط دستگاه شو.","Check the connection and open the device shell.")}</p>{info&&<code dir="ltr">ssh {info.username??"user"}@{info.device.host} -p {info.device.port}</code>}<button className="terminal-connect" type="button" disabled={busy||!info?.supported||!info?.credentialsConfigured} onClick={()=>void prepare()}>{busy?<LoaderCircle className="terminal-spin" size={18}/>:<PlugZap size={18}/>} {busy?status:t("بررسی و اتصال","Check & connect")}</button></div>}</div>
        <div hidden={!keyboardOpen} className="terminal-keyboard" aria-label={t("کلیدهای کمکی ترمینال","Terminal helper keys")}>{([["Ctrl+C","\u0003"],["Tab","\t"],["Esc","\u001b"],["↑","\u001b[A"],["↓","\u001b[B"],["Ctrl+D","\u0004"]]).map(([label,data])=><button type="button" key={label} aria-label={label} disabled={state!=="connected"} onClick={()=>{enqueue(data);term.current?.focus();}}>{label==="↑"?<ArrowUp size={15}/>:label==="↓"?<ArrowDown size={15}/>:label}</button>)}</div>
        <footer className="terminal-console__footer"><Link className="terminal-dock-back" to={`/assets/devices/${encodeURIComponent(id)}`} aria-label={t("بازگشت به تجهیز","Back to device")}><ArrowRight size={19}/></Link><span className="terminal-session-tab"><TerminalSquare size={18}/><strong>{info?.device.name??"SSH"}</strong>{active?<><i className="terminal-live-dot"/>{`${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`}</>:t("SSH / CLI","SSH / CLI")}</span>{!active&&opened&&<button type="button" disabled={busy} onClick={()=>void prepare()}><PlugZap size={15}/>{busy?status:t("اتصال دوباره","Connect again")}</button>}<button type="button" disabled={!active} onClick={()=>void disconnect()}><Power size={15}/><span>{t("قطع اتصال","Disconnect")}</span></button><button type="button" className="terminal-dock-keyboard" aria-label={t("نمایش صفحه‌کلید","Show keyboard")} aria-expanded={keyboardOpen} onClick={()=>{setKeyboardOpen(value=>!value);term.current?.focus();}}><Keyboard size={20}/></button></footer>
      </section><details className="terminal-details"><summary><Info size={16}/>{t("اطلاعات اتصال و راهنما","Connection details & help")}</summary><aside className="terminal-sidebar"><section className="terminal-device-card"><span className="terminal-eyebrow">{t("مقصد اتصال","Connection target")}</span><h2>{info?.device.name??"—"}</h2><dl><div><dt>{t("شرکت","Company")}</dt><dd>{info?.device.company??"—"}</dd></div><div><dt>{t("وندور","Vendor")}</dt><dd dir="ltr">{info?.device.vendor??"—"}</dd></div><div><dt>{t("آدرس","Address")}</dt><dd dir="ltr">{info?.device.host??"—"}</dd></div><div><dt>{t("حساب دستگاه","Device account")}</dt><dd dir="ltr">{info?.username??"—"}</dd></div><div><dt>{t("مسیر دسترسی","Network path")}</dt><dd>{info?.device.vpnConnectionId?"VPN":t("شبکهٔ مستقیم","Direct network")}</dd></div></dl><Link to={`/assets/devices/${encodeURIComponent(id)}/setup`}><KeyRound size={15}/>{t("تنظیمات اتصال","Connection settings")}<ChevronRight size={15}/></Link></section>
      <section className="terminal-guidance"><CircleHelp size={19}/><h3>{t("در اختیار شما","You're in control")}</h3><p>{t("دستورهایی که وارد می‌کنی مستقیماً روی همین تجهیز اجرا می‌شوند. سطح دسترسی، همان حساب دستگاه است.","Your commands run directly on this device with its configured account permissions.")}</p><p>{t("با بستن صفحه نشست قطع می‌شود. ورودی و خروجی ترمینال در برنامه ذخیره نمی‌شوند؛ اتصال و پایان نشست ممیزی می‌شوند.","Leaving closes the session. Terminal input/output is not stored by EOSNET; session opening and closing are audited.")}</p><details><summary>{t("کلیدهای کاربردی","Useful keys")}</summary><p dir="ltr">Tab · autocomplete<br/>Ctrl+C · interrupt<br/>↑ / ↓ · device history<br/>Ctrl+D · EOF</p></details></section></aside></details></div>
      {error&&<p className="terminal-notice" role="alert">{error}</p>}{info&&(!info.supported||!info.credentialsConfigured)&&<p className="terminal-notice">{terminalError(new Error(info.supported?"SSH_CREDENTIAL_MISSING":"TERMINAL_SSH_NOT_CONFIGURED"),isFa)}</p>}
      <dialog ref={dialog} className="terminal-confirm" onCancel={()=>setPreview(null)} onClose={()=>setPreview(null)}><span className="terminal-confirm__icon"><ShieldCheck size={27}/></span><h2>{t("اتصال به CLI دستگاه","Connect to device CLI")}</h2><p>{t("مقصد و حساب را بررسی کن؛ با تأیید، پوستهٔ تعاملی واقعی باز می‌شود.","Review the target and account. Confirmation opens a real interactive shell.")}</p><div className="terminal-confirm__target"><strong>{preview?.device.name}</strong><code dir="ltr">{preview?.username}@{preview?.device.host}:{preview?.device.port}</code></div><label>{t("اثر انگشت هویت SSH","SSH identity fingerprint")}<code dir="ltr">{preview?.fingerprint}</code></label><p className="terminal-trust"><Check size={15}/>{preview?.firstTrust?t("این اثر انگشت پس از اتصال موفق برای این تجهیز ذخیره می‌شود.","This fingerprint will be saved for this device after a successful connection."):t("اثر انگشت با هویت ثبت‌شده مطابقت دارد.","The fingerprint matches the saved device identity.")}</p><footer><button type="button" onClick={()=>dialog.current?.close()}>{t("انصراف","Cancel")}</button><button className="terminal-connect" type="button" disabled={state==="connecting"} onClick={()=>void connect()}><PlugZap size={17}/>{t("تأیید و اتصال","Confirm & connect")}</button></footer></dialog>
      <dialog ref={pasteDialog} className="terminal-confirm"><h2>{t("ارسال متن بلند به دستگاه؟","Send a large paste to the device?")}</h2><p>{t("متن چندخطی می‌تواند بلافاصله دستور اجرا کند. محتوای کلیپ‌بورد را قبل از ارسال بررسی کن.","Multiline text can execute commands immediately. Review your clipboard content before sending.")}</p><pre dir="ltr">{paste.slice(0,32768)}</pre><footer><button type="button" onClick={()=>{pasteDialog.current?.close();setPaste("");}}>{t("انصراف","Cancel")}</button><button className="terminal-connect" type="button" onClick={()=>{send(paste);pasteDialog.current?.close();setPaste("");term.current?.focus();}}>{t("ارسال متن","Send text")}</button></footer></dialog>
    </>}
  </div>;
}
