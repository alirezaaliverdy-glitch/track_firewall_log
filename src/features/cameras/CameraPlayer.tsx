import { useRef, useState } from "react";
import { Camera, Download, Expand, Image, LoaderCircle, Pause, Play, RefreshCw, X } from "lucide-react";
import { cameraErrorMessage, cameraImageResponse, type CameraDevice, type CameraProfile } from "@/lib/cameras";
import { useCameraImage } from "./useCameraImage";

export function CameraPlayer({ camera, profiles, initialProfile, isFa, onClose }: { camera: CameraDevice; profiles: CameraProfile[]; initialProfile: string; isFa: boolean; onClose: () => void }) {
  const [profile, setProfile] = useState(initialProfile), [playing, setPlaying] = useState(true), [mode, setMode] = useState<"live" | "snapshot">(profiles.find((item) => item.token === initialProfile)?.streamAvailable ? "live" : "snapshot");
  const [retry, setRetry] = useState(0), [saveError, setSaveError] = useState(""), [saving, setSaving] = useState(false);
  const panel = useRef<HTMLElement>(null), image = useCameraImage(camera.id, profile, playing, mode, retry);
  const copy = (fa: string, en: string) => isFa ? fa : en;
  const selected = profiles.find((item) => item.token === profile);
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
  const fullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) { void document.exitFullscreen().catch(() => undefined); return; }
    if (!panel.current?.requestFullscreen) { setSaveError(copy("نمای تمام‌صفحه در این مرورگر در دسترس نیست.", "Fullscreen is unavailable in this browser.")); return; }
    void panel.current.requestFullscreen().catch(() => setSaveError(copy("نمای تمام‌صفحه در این مرورگر در دسترس نیست.", "Fullscreen is unavailable in this browser.")));
  };
  return <article className="camera-player" ref={panel}>
    <header><div><span className={`camera-dot ${image.state === "live" ? "is-live" : ""}`} /><strong>{camera.name}</strong><small>{profiles[0]?.sourceToken !== "manual" && camera.kind === "nvr" ? profiles[0]?.name : camera.location}</small></div><button type="button" className="camera-icon-button" onClick={onClose} aria-label={copy("بستن تصویر", "Close view")}><X size={18} /></button></header>
    <div className="camera-player__image">
      {image.src ? <img src={image.src} alt={copy(`تصویر ${camera.name}`, `${camera.name} video`)} /> : <Camera size={46} strokeWidth={1.2} />}
      {image.state === "loading" ? <span className="camera-player__overlay" role="status"><LoaderCircle size={22} className="camera-spin" />{copy("دریافت تصویر", "Connecting video")}</span> : null}
      {image.state === "error" ? <div className="camera-player__overlay camera-player__error" role="alert"><p>{cameraErrorMessage(new Error(image.error), isFa)}</p><button className="camera-button" type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} />{copy("تلاش دوباره", "Retry")}</button>{selected?.snapshotAvailable ? <button className="camera-button" type="button" onClick={() => { setMode("snapshot"); setRetry((value) => value + 1); }}>{copy("دریافت عکس", "Try snapshot")}</button> : null}</div> : null}
      {image.state === "paused" ? <span className="camera-player__overlay">{copy("پخش در پس‌زمینه متوقف است", "Playback paused in background")}</span> : null}
      <span className="camera-player__label">{mode === "snapshot" ? copy("عکس", "Snapshot") : copy("نمای زنده", "Live view")}</span>
    </div>
    <footer><select aria-label={copy("کیفیت تصویر", "Video quality")} value={profile} onChange={(event) => { setProfile(event.target.value); setMode(profiles.find((item) => item.token === event.target.value)?.streamAvailable ? "live" : "snapshot"); setPlaying(true); }}>{profiles.map((item) => <option key={item.token} value={item.token}>{item.name}{item.width ? ` · ${item.width}×${item.height}` : ""}</option>)}</select><div>
      <button className="camera-icon-button" type="button" disabled={!selected?.streamAvailable} onClick={() => { if (mode === "snapshot") { setMode("live"); setPlaying(true); } else setPlaying((value) => !value); }} title={copy(playing && mode === "live" ? "توقف پخش" : "پخش", playing && mode === "live" ? "Pause" : "Play")} aria-label={copy(playing && mode === "live" ? "توقف پخش" : "پخش", playing && mode === "live" ? "Pause" : "Play")}>{playing && mode === "live" ? <Pause size={17} /> : <Play size={17} />}</button>
      <button className="camera-icon-button" type="button" onClick={() => { setMode("snapshot"); setPlaying(true); setRetry((value) => value + 1); }} aria-label={copy("عکس لحظه‌ای", "Snapshot")} title={copy("عکس لحظه‌ای", "Snapshot")}><Image size={17} /></button>
      <button className="camera-icon-button" type="button" disabled={saving} onClick={() => void save()} aria-label={copy("ذخیره عکس", "Save snapshot")} title={copy("ذخیره عکس", "Save snapshot")}>{saving ? <LoaderCircle className="camera-spin" size={17} /> : <Download size={17} />}</button>
      <button className="camera-icon-button" type="button" onClick={fullscreen} aria-label={copy("تمام‌صفحه", "Fullscreen")} title={copy("تمام‌صفحه", "Fullscreen")}><Expand size={17} /></button>
    </div></footer>
    {saveError ? <p className="camera-alert" role="alert">{saveError}</p> : null}
  </article>;
}
