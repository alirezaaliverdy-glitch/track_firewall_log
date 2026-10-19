import { useEffect, useRef, useState } from "react";
import { Download, Film, History, LoaderCircle, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cameraJson, cameraErrorMessage, type CameraDevice } from "@/lib/cameras";
import { apiRequest } from "@/lib/apiTransport";
import { useAuth } from "@/context/AuthContext";
import "./CameraPlaybackPanel.css";

type Recording = { token: string; name: string; source: string; from: string | null; until: string | null; tracks: string[] };
type Inventory = { supported: boolean; recordings: Recording[]; truncated: boolean; maxClipSeconds: number };
const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

export function CameraPlaybackPanel({ camera, isFa }: { camera: CameraDevice; isFa: boolean }) {
  const { user } = useAuth();
  const t = (fa: string, en: string) => isFa ? fa : en;
  const [inventory, setInventory] = useState<Inventory>(), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [token, setToken] = useState(""), [start, setStart] = useState(localTime(new Date(Date.now() - 60000))), [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false), [clip, setClip] = useState(""), [rate, setRate] = useState(1), [clipTime, setClipTime] = useState("");
  const controller = useRef<AbortController | null>(null), blob = useRef(""), alive = useRef(true), video = useRef<HTMLVideoElement>(null);
  const load = () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request; setLoading(true); setError("");
    void cameraJson<Inventory>(`/${encodeURIComponent(camera.id)}/recordings`, { signal: request.signal }).then(data => {
      if (request.signal.aborted || !alive.current) return;
      setInventory(data); setToken(data.recordings[0]?.token ?? "");
      const latest = data.recordings[0]?.until; if (latest) setStart(localTime(new Date(Math.min(Date.parse(latest), Date.now()) - 30000)));
    }).catch(failure => { if (!request.signal.aborted && alive.current) setError(failure instanceof Error ? failure.message : "CAMERA_REPLAY_FAILED"); }).finally(() => { if (alive.current && !request.signal.aborted) setLoading(false); });
  };
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; controller.current?.abort(); if (blob.current) URL.revokeObjectURL(blob.current); }; }, [camera.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = inventory?.recordings.find(item => item.token === token);
  const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString(isFa ? "fa-IR" : "en-US") : t("نامشخص", "Unknown");
  const play = async (exporting = false) => {
    if (busy || !selected) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); if (!exporting) { if (blob.current) URL.revokeObjectURL(blob.current); blob.current = ""; setClip(""); }
    try {
      const stamp = new Date(start); if (!Number.isFinite(stamp.getTime())) throw new Error("CAMERA_REPLAY_WINDOW_INVALID");
      const query = new URLSearchParams({ recordingToken: token, start: stamp.toISOString(), duration: String(duration) });
      const response = await apiRequest(`/cameras/${encodeURIComponent(camera.id)}/playback${exporting ? "/export" : `?${query}`}`, { signal: request.signal, ...(exporting ? { method: "POST", body: JSON.stringify({ recordingToken: token, start: stamp.toISOString(), duration }) } : {}) });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error?.code ?? "CAMERA_REPLAY_FAILED"); }
      if (!response.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("CAMERA_REPLAY_FAILED");
      const bytes = await response.blob(); if (bytes.size > 12 * 1024 * 1024) throw new Error("CAMERA_REPLAY_SIZE_LIMIT");
      if (alive.current && !request.signal.aborted) {
        if (exporting) { const url = URL.createObjectURL(bytes), anchor = document.createElement("a"); anchor.href = url; anchor.download = `recording-${stamp.getTime()}.mp4`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
        else { blob.current = URL.createObjectURL(bytes); setClip(blob.current); setClipTime(stamp.toISOString()); setRate(1); }
      }
    } catch (failure) { if (alive.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : "CAMERA_REPLAY_FAILED"); }
    finally { if (alive.current && !request.signal.aborted) setBusy(false); }
  };
  const unavailable = ["CAMERA_REPLAY_UNSUPPORTED", "CAMERA_ONVIF_UNAVAILABLE", "CAMERA_OPERATION_UNSUPPORTED"].includes(error);
  return <section className="camera-replay" aria-label={t("بازپخش آرشیو", "Recorded playback")}>
    <header className="camera-replay__heading"><span><History size={23}/></span><div><h3>{t("لحظه‌ای که دنبالشی", "Find the moment")}</h3><p>{t("آرشیو واقعی دستگاه، بدون ذخیرهٔ دائمی در سرور", "Real recorder footage · no permanent server cache")}</p></div><button className="camera-icon-button" disabled={loading || busy} onClick={load} aria-label={t("دریافت دوباره آرشیو", "Refresh recordings")}><RefreshCw size={17}/></button></header>
    {loading ? <p role="status" className="camera-replay__state"><LoaderCircle className="camera-spin"/>{t("بررسی سرویس ضبط دستگاه…", "Checking the recorder…")}</p> : unavailable ? <div className="camera-replay__state"><Film size={34}/><h4>{t("بازپخش استاندارد در این اتصال ارائه نشد", "Standard replay is unavailable on this connection")}</h4><p>{t("مشاهدهٔ زنده و پایش هارد مستقل‌اند. بازپخش نیازمند ONVIF Profile G و مجوز مشاهدهٔ ضبط است؛ XMEye و بعضی دستگاه‌های AppWeb/DVRIP از رابط اختصاصی سازنده استفاده می‌کنند که هنوز به این برنامه متصل نیست.", "Live view and disk monitoring are separate. Replay requires ONVIF Profile G and recording access. Some XMEye/AppWeb/DVRIP devices need a proprietary vendor adapter that is not integrated yet.")}</p></div> : <>
      {inventory?.recordings.length ? <><div className="camera-replay__form"><label>{t("آرشیو / کانال ضبط", "Recording / source")}<select value={token} disabled={busy} onChange={event => { setToken(event.target.value); const next = inventory.recordings.find(item => item.token === event.target.value); if (next?.until) setStart(localTime(new Date(Math.min(Date.parse(next.until), Date.now()) - duration * 1000))); }}>{inventory.recordings.map((item, index) => <option key={item.token} value={item.token}>{item.name || `${t("آرشیو", "Recording")} ${index + 1}`}{item.source ? ` · ${item.source}` : ""}</option>)}</select></label>
        <label>{t("شروع به وقت مرورگر", "Start · browser local time")}<input type="datetime-local" step="1" value={start} max={localTime(new Date())} disabled={busy} onChange={event => setStart(event.target.value)}/></label>
        <label>{t("طول کلیپ", "Clip length")}<select value={duration} disabled={busy} onChange={event => setDuration(Number(event.target.value))}>{[15, 30, 60].map(value => <option key={value} value={value}>{value} {t("ثانیه", "seconds")}</option>)}</select></label>
      </div><div className="camera-replay__coverage"><Film size={17}/><span>{t("بازهٔ گزارش‌شدهٔ آرشیو", "Recorder-reported coverage")}<strong>{time(selected?.from)} ← {time(selected?.until)}</strong><small>{t("پیوستگی ضبط در این بازه تأیید نشده؛ زمان انتخابی ممکن است ضبط نداشته باشد.", "Recording may have gaps within this range.")}</small></span></div>
      <div className="camera-replay__actions"><button className="camera-button camera-button--primary" disabled={busy || !start || !selected} onClick={() => void play()}>{busy ? <LoaderCircle size={17} className="camera-spin"/> : <Play size={17}/>} {busy ? t("آماده‌سازی کلیپ…", "Preparing clip…") : t("نمایش بازپخش", "View recording")}</button>{user?.role !== "viewer" && <button className="camera-button" disabled={busy || !start || !selected} onClick={() => void play(true)}><Download size={16}/>{t("دانلود کلیپ", "Download clip")}</button>}{busy && <button className="camera-button" onClick={() => { controller.current?.abort(); setBusy(false); }}><X size={16}/>{t("لغو", "Cancel")}</button>}<small>{t("حداکثر ۶۰ ثانیه و ۱۲ مگابایت؛ هر بار یک کلیپ در فضای کاری", "Up to 60 s / 12 MiB · one clip per workspace")}</small></div></> : inventory && <p className="camera-replay__state">{t("سرویس بازپخش فعال است؛ هیچ آرشیو قابل‌دسترسی گزارش نشد.", "Replay is available but no accessible recordings were returned.")}</p>}
      {clip && <div className="camera-replay__video"><video ref={video} src={clip} controls controlsList="nodownload" playsInline preload="metadata" aria-label={t("کلیپ ضبط‌شده", "Recorded clip")} onLoadedMetadata={() => { if (video.current) video.current.playbackRate = rate; }}/><footer><span><ShieldCheck size={16}/>{time(clipTime)}</span><label>{t("سرعت", "Speed")}<select value={rate} onChange={event => { const value = Number(event.target.value); setRate(value); if (video.current) video.current.playbackRate = value; }}>{[.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}</select></label></footer></div>}
      {error && <p className="camera-alert" role="alert">{cameraErrorMessage(new Error(error), isFa)}</p>}
      {inventory?.truncated && <p className="camera-hint">{t("نمایش به ۳۲ آرشیو نخست محدود شده است.", "Showing the first 32 recordings.")}</p>}
    </>}
  </section>;
}
