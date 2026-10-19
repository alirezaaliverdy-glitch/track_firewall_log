import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CircleAlert, Download, Expand, Minimize, Image, LoaderCircle, Pause, Play, RefreshCw, Settings2, X, ZoomIn, ZoomOut, RotateCw, FlipHorizontal, History } from "lucide-react";
import { cameraErrorMessage, cameraImageResponse, type CameraDevice, type CameraProfile } from "@/lib/cameras";
import { useCameraImage } from "./useCameraImage";
import { useCameraFullscreen } from "./useCameraFullscreen";
import "./CameraStudio.css";

export function CameraPlayer({ camera, profiles, initialProfile, isFa, onClose, onDetail, onPlayback, viewId }: { camera: CameraDevice; profiles: CameraProfile[]; initialProfile: string; isFa: boolean; onClose: () => void; onDetail?: () => void; onPlayback?: () => void; viewId?: string }) {
  const [profile, setProfile] = useState(initialProfile), [playing, setPlaying] = useState(true), [mode, setMode] = useState<"live" | "snapshot">(profiles.find((item) => item.token === initialProfile)?.streamAvailable ? "live" : "snapshot");
  const [retry, setRetry] = useState(0), [saveError, setSaveError] = useState(""), [saving, setSaving] = useState(false);
  const panel = useRef<HTMLElement>(null), image = useCameraImage(camera.id, profile, playing, mode, retry);
  const fullscreen = useCameraFullscreen(panel);
  const [zoom, setZoom] = useState(1), [rotation, setRotation] = useState(0), [mirrored, setMirrored] = useState(false);
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem("eosnet.cameraAccent") ?? "teal"; } catch { return "teal"; } });
  const copy = (fa: string, en: string) => isFa ? fa : en;
  const selected = profiles.find((item) => item.token === profile);
  useEffect(() => {
    if (!profiles.some(item => item.token === profile && (item.streamAvailable || item.snapshotAvailable))) {
      const next = profiles.find(item => item.token === initialProfile) ?? profiles.find(item => item.streamAvailable || item.snapshotAvailable);
      if (next) { setProfile(next.token); setMode(next.streamAvailable ? "live" : "snapshot"); }
    }
  }, [profiles, profile, initialProfile]);
  const save = async () => {
    setSaving(true); setSaveError("");
    try {
      const response = await cameraImageResponse(camera.id, profile, "snapshot");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `camera-${camera.host}-${Date.now()}.jpg`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setSaveError(cameraErrorMessage(error, isFa)); }
    finally { setSaving(false); }
  };
  const playbackLabel = image.state === "live" ? copy("زنده", "Live") : image.state === "snapshot" ? copy("عکس", "Snapshot") : image.state === "paused" ? copy("متوقف", "Paused") : image.state === "error" ? copy("قطع تصویر", "Video unavailable") : copy("اتصال…", "Connecting…");
  const view = <article data-accent={accent} className={`camera-player camera-player--${image.state} ${fullscreen.expanded ? "is-viewport" : ""}`} role={fullscreen.expanded ? "dialog" : undefined} aria-modal={fullscreen.expanded || undefined} ref={panel} id={viewId} tabIndex={-1} aria-label={copy(`نمای ${camera.name}`, `${camera.name} view`)}>
    <header><div><span className={`camera-dot ${image.state === "live" ? "is-live" : ""}`} /><strong>{camera.name}</strong><small>{profiles[0]?.sourceToken !== "manual" && camera.kind === "nvr" ? profiles[0]?.name : camera.location}</small></div><button type="button" className="camera-icon-button" onClick={onClose} aria-label={copy("بستن تصویر", "Close view")}><X size={18} /></button></header>
    <div className="camera-player__image">
      {image.src ? <img style={{ transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${mirrored ? -1 : 1})` }} src={image.src} alt={copy(`تصویر ${camera.name}`, `${camera.name} video`)} /> : <Camera size={46} strokeWidth={1.2} />}
      {image.state === "loading" ? <span className="camera-player__overlay" role="status"><LoaderCircle size={22} className="camera-spin" />{copy("دریافت تصویر", "Connecting video")}</span> : null}
      {image.state === "error" ? <div className="camera-player__overlay camera-player__error" role="alert"><span className="camera-player__error-icon"><CircleAlert size={25} /></span><p>{cameraErrorMessage(new Error(image.error), isFa)}</p><div className="camera-player__error-actions"><button className="camera-button" type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} />{copy("تلاش دوباره", "Retry")}</button>{onDetail ? <button className="camera-button camera-button--quiet" type="button" onClick={onDetail}><Settings2 size={16} />{copy("بررسی اتصال", "Check connection")}</button> : null}{selected?.snapshotAvailable && mode !== "snapshot" ? <button className="camera-button camera-button--quiet" type="button" onClick={() => { setMode("snapshot"); setRetry((value) => value + 1); }}>{copy("دریافت عکس", "Try snapshot")}</button> : null}</div></div> : null}
      {image.state === "paused" ? <div className="camera-player__overlay camera-player__paused">{!playing ? <><button type="button" className="camera-player__resume" aria-label={copy("ادامه پخش", "Resume video")} onClick={() => setPlaying(true)}><Play size={25} /></button><span>{copy("پخش متوقف است", "Playback paused")}</span></> : <span>{copy("پخش در پس‌زمینه متوقف است", "Playback paused in background")}</span>}</div> : null}
      <span className="camera-player__label"><i className={image.state === "live" ? "is-live" : ""} />{playbackLabel}</span>
    </div>
    <footer><select aria-label={copy("کیفیت تصویر", "Video quality")} value={profile} onChange={(event) => { setProfile(event.target.value); setMode(profiles.find((item) => item.token === event.target.value)?.streamAvailable ? "live" : "snapshot"); setPlaying(true); }}>{profiles.map((item) => <option key={item.token} value={item.token} disabled={!item.streamAvailable && !item.snapshotAvailable}>{item.name}{item.width ? ` · ${item.width}×${item.height}` : ""}</option>)}</select><div>
      <button className="camera-icon-button" type="button" disabled={!selected?.streamAvailable} onClick={() => { if (mode === "snapshot") { setMode("live"); setPlaying(true); } else setPlaying((value) => !value); }} title={copy(playing && mode === "live" ? "توقف پخش" : "پخش", playing && mode === "live" ? "Pause" : "Play")} aria-label={copy(playing && mode === "live" ? "توقف پخش" : "پخش", playing && mode === "live" ? "Pause" : "Play")}>{playing && mode === "live" ? <Pause size={17} /> : <Play size={17} />}</button>
      <button className="camera-icon-button" type="button" onClick={() => { setMode("snapshot"); setPlaying(true); setRetry((value) => value + 1); }} aria-label={copy("عکس لحظه‌ای", "Snapshot")} title={copy("عکس لحظه‌ای", "Snapshot")}><Image size={17} /></button>
      <button className="camera-icon-button" type="button" disabled={saving} onClick={() => void save()} aria-label={copy("ذخیره عکس", "Save snapshot")} title={copy("ذخیره عکس", "Save snapshot")}>{saving ? <LoaderCircle className="camera-spin" size={17} /> : <Download size={17} />}</button>
      <button className="camera-icon-button" type="button" onClick={fullscreen.toggle} aria-label={fullscreen.expanded ? copy("خروج از تمام‌صفحه", "Exit fullscreen") : copy("تمام‌صفحه", "Fullscreen")} title={copy("تمام‌صفحه", "Fullscreen")}>{fullscreen.expanded ? <Minimize size={17}/> : <Expand size={17}/>}</button>
    </div></footer>
    <div className="camera-studio-tools"><span>{copy("ابزار نمایش؛ بدون تغییر دستگاه", "View tools · device unchanged")}</span>
      <button className="camera-icon-button" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))} aria-label={copy("بزرگ‌نمایی دیجیتال", "Digital zoom in")}><ZoomIn size={16}/></button>
      <button className="camera-icon-button" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))} aria-label={copy("کوچک‌نمایی", "Zoom out")}><ZoomOut size={16}/></button>
      <button className="camera-icon-button" onClick={() => setRotation(value => (value + 90) % 360)} aria-label={copy("چرخش نمایش", "Rotate view")}><RotateCw size={16}/></button>
      <button className="camera-icon-button" aria-pressed={mirrored} onClick={() => setMirrored(value => !value)} aria-label={copy("قرینهٔ نمایش", "Mirror view")}><FlipHorizontal size={16}/></button>
      {onPlayback && <button className="camera-icon-button" onClick={() => { fullscreen.close(); onPlayback(); }} aria-label={copy("بازپخش ضبط‌ها", "Recorded playback")}><History size={16}/></button>}
      <div className="camera-studio-palette" aria-label={copy("رنگ پلیر", "Player accent")}>{[["teal", "#69dfcf"], ["violet", "#b6a0ff"], ["amber", "#f6c76f"], ["blue", "#85c4ff"]].map(([key, color]) => <button key={key} style={{ background: color }} aria-label={`${copy("رنگ", "Accent")} ${key}`} aria-pressed={accent === key} onClick={() => { setAccent(key); try { localStorage.setItem("eosnet.cameraAccent", key); } catch { /* preference is optional */ } }}/>)}</div>
    </div>
    {saveError ? <p className="camera-alert" role="alert">{saveError}</p> : null}
  </article>;
  return fullscreen.expanded ? createPortal(view, document.body) : view;
}
