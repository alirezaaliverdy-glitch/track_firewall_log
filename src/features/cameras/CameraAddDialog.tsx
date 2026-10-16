import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, LoaderCircle, Radar, Server, Video } from "lucide-react";
import { cameraErrorMessage, createCamera, discoverCameras, type CameraCandidate, type CameraDevice, type CameraDiscovery, type CameraInput } from "@/lib/cameras";
import { CameraDialog } from "./CameraDialog";
import { VpnAccessField } from "@/features/vpn/VpnAccessField";

const defaultInput: CameraInput = { host: "", name: "", location: "", kind: "camera", connectionMode: "onvif", onvifPort: 80, onvifPath: "/onvif/device_service", username: "", password: "", rtspUrl: "", vpnConnectionId: "" };
export function CameraAddDialog({ isFa, onClose, onSaved }: { isFa: boolean; onClose: () => void; onSaved: (devices: CameraDevice[]) => void }) {
  const [tab, setTab] = useState<"discover" | "manual">("discover"), [cidr, setCidr] = useState("192.168.18.0/24");
  const [input, setInput] = useState(defaultInput), [result, setResult] = useState<CameraDiscovery | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [scanning, setScanning] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [progress, setProgress] = useState("");
  const [ports, setPorts] = useState("80,8000,8080,8899,2020");
  const copy = (fa: string, en: string) => isFa ? fa : en;
  const tabsId = useId();
  const selectTab = (next: "discover" | "manual") => { setTab(next); setError(""); setMessage(""); };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (saving || scanning || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "discover" : event.key === "End" ? "manual" : tab === "discover" ? "manual" : "discover";
    selectTab(next); document.getElementById(`${tabsId}-${next}`)?.focus();
  };
  const change = <K extends keyof CameraInput>(key: K, value: CameraInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  const key = (candidate: CameraCandidate) => `${candidate.host}:${candidate.onvifPort}`;
  const available = result?.candidates.filter((candidate) => !candidate.registered) ?? [];
  const scan = async () => {
    setScanning(true); setError(""); setMessage(""); setResult(null); setSelected([]);
    try { setResult(await discoverCameras(cidr, ports.split(",").map((port) => Number(port.trim())), input.vpnConnectionId)); }
    catch (failure) { setError(cameraErrorMessage(failure, isFa)); }
    finally { setScanning(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving || scanning) return;
    setSaving(true); setError(""); setMessage("");
    const devices: CameraDevice[] = [];
    let failures = 0;
    try {
      if (tab === "manual") devices.push((await createCamera(input)).camera);
      else {
        const candidates = available.filter((candidate) => selected.includes(key(candidate)));
        if (!candidates.length) { setError(copy("یک دستگاه را انتخاب کن.", "Select a device.")); return; }
        if (candidates.some((candidate) => candidate.evidence === "rtsp")) { setError(copy("برای دستگاه‌های احتمالی RTSP از افزودن دستی و آدرس پخش استفاده کن.", "Use manual setup with a stream URL for RTSP candidates.")); return; }
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i]; setProgress(`${i + 1} / ${candidates.length}`);
          try {
            devices.push((await createCamera({ ...input, host: candidate.host, name: candidate.name, onvifPort: candidate.onvifPort, onvifPath: candidate.onvifPath, onvifHttps: candidate.onvifHttps, connectionMode: "onvif" })).camera);
            setResult((current) => current ? { ...current, candidates: current.candidates.map((item) => key(item) === key(candidate) ? { ...item, registered: true } : item) } : current);
          } catch { failures++; }
        }
      }
      if (devices.length) onSaved(devices);
      if (!failures && devices.length) onClose();
      else { setSelected([]); setMessage(copy(`${devices.length} دستگاه اضافه شد؛ ${failures} مورد نیاز به بررسی دارد.`, `${devices.length} devices added; ${failures} need review.`)); }
    } catch (failure) { setError(cameraErrorMessage(failure, isFa)); }
    finally { setSaving(false); setProgress(""); }
  };
  return <CameraDialog title={copy("افزودن دوربین و NVR", "Add camera or NVR")} onClose={() => { if (!saving && !scanning) onClose(); }} wide>
    <div className="camera-tabs" role="tablist" aria-label={copy("روش افزودن", "Setup method")}>
      <button type="button" role="tab" id={`${tabsId}-discover`} aria-controls={`${tabsId}-panel`} tabIndex={tab === "discover" ? 0 : -1} onKeyDown={tabKey} aria-selected={tab === "discover"} disabled={saving || scanning} onClick={() => selectTab("discover")}><Radar size={17} />{copy("کشف شبکه", "Discover network")}</button>
      <button type="button" role="tab" id={`${tabsId}-manual`} aria-controls={`${tabsId}-panel`} tabIndex={tab === "manual" ? 0 : -1} onKeyDown={tabKey} aria-selected={tab === "manual"} disabled={saving || scanning} onClick={() => selectTab("manual")}><Video size={17} />{copy("افزودن دستی", "Manual setup")}</button>
    </div>
    <form onSubmit={(event) => void save(event)} className="camera-form" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
      <VpnAccessField value={input.vpnConnectionId ?? ""} onChange={id => { change("vpnConnectionId", id); setResult(null); setSelected([]); }} host={tab === "manual" ? input.host : undefined} isFa={isFa} />
      {tab === "discover" ? <>
        <div className="camera-discover-row"><label>{copy("شبکه", "Network")}<input dir="ltr" value={cidr} onChange={(event) => setCidr(event.target.value)} disabled={scanning || saving} placeholder="192.168.18.0/24" /></label><button type="button" className="camera-button camera-button--primary" disabled={scanning || saving} onClick={() => void scan()}>{scanning ? <LoaderCircle className="camera-spin" size={18} /> : <Radar size={18} />}{copy(scanning ? "در حال جست‌وجو" : "جست‌وجو", scanning ? "Searching" : "Search")}</button></div>
        <p className="camera-hint">{copy("جست‌وجو از سرور برنامه انجام می‌شود؛ سرور باید به شبکهٔ دوربین‌ها دسترسی داشته باشد.", "Discovery runs from the app server, which needs a route to the camera network.")}</p>
        <details className="camera-disclosure"><summary>{copy("پورت‌های جست‌وجو", "Discovery ports")}</summary><label><input dir="ltr" value={ports} onChange={(event) => setPorts(event.target.value)} disabled={saving || scanning} aria-label={copy("پورت‌ها", "Ports")} /></label></details>
        {result ? <div className="camera-discovered"><header><strong>{copy(`${result.candidates.length} دستگاه پیدا شد`, `${result.candidates.length} devices found`)}</strong><button type="button" disabled={saving || !available.some((item) => item.evidence === "onvif")} onClick={() => setSelected(selected.length ? [] : available.filter((item) => item.evidence === "onvif").map(key))}>{copy(selected.length ? "لغو انتخاب" : "انتخاب همه", selected.length ? "Clear selection" : "Select all")}</button></header>
          {result.candidates.map((candidate) => <label className="camera-candidate" key={key(candidate)}>
            <input type="checkbox" checked={selected.includes(key(candidate))} disabled={saving || candidate.registered || candidate.evidence === "rtsp"} onChange={(event) => setSelected((current) => event.target.checked ? [...current, key(candidate)] : current.filter((item) => item !== key(candidate)))} />
            <span><b>{candidate.name}</b><small dir="ltr">{candidate.host} · {candidate.onvifPort}</small></span>
            <small>{candidate.registered ? <><Check size={14} />{copy("اضافه شده", "Registered")}</> : candidate.evidence === "onvif" ? "ONVIF" : <button type="button" className="camera-button camera-button--quiet" onClick={() => { setInput((current) => ({ ...current, host: candidate.host, name: candidate.name, connectionMode: "rtsp", rtspUrl: `rtsp://${candidate.host}:554/` })); setTab("manual"); }}>{copy("افزودن دستی RTSP", "Set up RTSP")}</button>}</small>
          </label>)}
          {!result.candidates.length ? <p>{copy("دستگاهی پیدا نشد؛ ONVIF و مسیر شبکه را بررسی کن یا NVR را دستی اضافه کن.", "No devices found. Check ONVIF and routing, or add the NVR manually.")}</p> : null}
          {result.partial ? <p className="camera-hint">{copy("جست‌وجو کامل نشد؛ برای آدرس مشخص دوباره تلاش کن.", "Discovery was partial. Retry with a specific address.")}</p> : null}
        </div> : null}
      </> : <>
        <div className="camera-form-grid"><label>{copy("نوع دستگاه", "Device type")}<select value={input.kind} onChange={(event) => change("kind", event.target.value as CameraInput["kind"])}><option value="camera">{copy("دوربین", "Camera")}</option><option value="nvr">NVR</option></select></label><label>{copy("IP دستگاه", "Device IP")}<input required dir="ltr" value={input.host} onChange={(event) => change("host", event.target.value)} placeholder={input.kind === "nvr" ? "192.168.18.50" : "192.168.18.4"} /></label><label>{copy("نام", "Name")}<input value={input.name} onChange={(event) => change("name", event.target.value)} maxLength={160} placeholder={copy("مثلاً ورودی ساختمان", "e.g. Main entrance")} /></label><label>{copy("روش اتصال", "Connection")}<select value={input.connectionMode} onChange={(event) => change("connectionMode", event.target.value as CameraInput["connectionMode"])}><option value="onvif">ONVIF</option><option value="rtsp">RTSP</option></select></label></div>
        {input.connectionMode === "onvif" ? <details className="camera-disclosure"><summary>{copy("تنظیمات ONVIF", "ONVIF settings")}</summary><div className="camera-form-grid"><label>{copy("پورت", "Port")}<input type="number" min={1} max={65535} value={input.onvifPort} onChange={(event) => change("onvifPort", Number(event.target.value))} /></label><label>{copy("مسیر سرویس", "Service path")}<input dir="ltr" value={input.onvifPath} onChange={(event) => change("onvifPath", event.target.value)} /></label><label>{copy("پروتکل", "Protocol")}<select value={input.onvifHttps ? "https" : "http"} onChange={(event) => change("onvifHttps", event.target.value === "https")}><option value="http">HTTP</option><option value="https">HTTPS</option></select></label></div></details> : <label>{copy("آدرس پخش، بدون نام کاربری و رمز", "Stream URL, without embedded credentials")}<input required dir="ltr" value={input.rtspUrl} onChange={(event) => change("rtspUrl", event.target.value)} placeholder="rtsp://192.168.18.50:554/…" /></label>}
      </>}
      <div className="camera-form-grid camera-credentials"><label>{copy("نام کاربری دستگاه", "Device username")}<input dir="ltr" autoComplete="off" value={input.username} onChange={(event) => change("username", event.target.value)} maxLength={128} /></label><label>{copy("رمز دستگاه", "Device password")}<input type="password" autoComplete="new-password" value={input.password} onChange={(event) => change("password", event.target.value)} maxLength={1024} /></label><label className="camera-form-full">{copy("محل نصب", "Location")}<input value={input.location} onChange={(event) => change("location", event.target.value)} placeholder={copy("اختیاری", "Optional")} maxLength={160} /></label></div>
      {tab === "discover" ? <p className="camera-hint">{copy("اطلاعات ورود برای دستگاه‌های انتخاب‌شده استفاده می‌شود. اگر رمزها متفاوت‌اند، جداگانه اضافه کن.", "Credentials apply to selected devices. Add devices separately if their passwords differ.")}</p> : input.kind === "nvr" ? <p className="camera-hint"><Server size={15} />{copy("کانال‌های ارائه‌شده توسط NVR بعد از اتصال نمایش داده می‌شوند.", "The NVR's available channels appear after connection.")}</p> : null}
      {error ? <p className="camera-alert" role="alert">{error}</p> : null}{message ? <p className="camera-hint" role="status">{message}</p> : null}
      <footer className="camera-dialog__actions"><button className="camera-button" type="button" onClick={onClose} disabled={saving || scanning}>{copy("انصراف", "Cancel")}</button><button className="camera-button camera-button--primary" type="submit" disabled={saving || scanning || tab === "discover" && !selected.length}>{saving ? <LoaderCircle size={17} className="camera-spin" /> : <Check size={17} />}{saving ? copy(`در حال افزودن ${progress}`, `Adding ${progress}`) : copy(tab === "discover" ? `افزودن ${selected.length || ""} دستگاه` : "افزودن و بررسی اتصال", tab === "discover" ? `Add ${selected.length || ""} devices` : "Add and check connection")}</button></footer>
    </form>
  </CameraDialog>;
}
