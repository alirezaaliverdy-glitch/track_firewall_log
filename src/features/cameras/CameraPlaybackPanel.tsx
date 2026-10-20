import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Film, History, LoaderCircle, Play, Pause, RefreshCw, X, SkipBack, SkipForward, RotateCcw, RotateCw, Expand, Minimize } from "lucide-react";
import { cameraJson, cameraErrorMessage, type CameraDevice } from "@/lib/cameras";
import { apiRequest } from "@/lib/apiTransport";
import { useAuth } from "@/context/AuthContext";
import { CameraSelect } from "./CameraSelect";
import { useCameraFullscreen } from "./useCameraFullscreen";
import { reviewRange, reviewSegment } from "./playbackRange";
import "./CameraPlaybackPanel.css";

type Recording = { token: string; name: string; source: string; from: string | null; until: string | null };
type Inventory = { recordings: Recording[]; truncated: boolean; maxClipSeconds?: number; timeBasis?: "device-local"; deviceLocalTime?: string; recorderName?: string };
type Segment = { url: string; start: number; duration: number };
const localTime = (stamp: number) => { const date = new Date(stamp); return new Date(stamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };

export function CameraPlaybackPanel({ camera, isFa, initialSource = "" }: { camera: CameraDevice; isFa: boolean; initialSource?: string }) {
  const { user } = useAuth(), t = (fa: string, en: string) => isFa ? fa : en;
  const [inventory, setInventory] = useState<Inventory>(), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const deviceClock = inventory?.timeBasis === "device-local";
  const archiveNow = deviceClock && inventory.deviceLocalTime ? Date.parse(inventory.deviceLocalTime.replace(" ","T")+"Z") : Date.now();
  const parseInput = (value: string) => Date.parse(deviceClock ? `${value}Z` : value);
  const toInput = (stamp: number, context = inventory) => context?.timeBasis === "device-local" ? new Date(stamp).toISOString().slice(0,19) : localTime(stamp);
  const [token, setToken] = useState(""), [start, setStart] = useState(localTime(Date.now() - 360000)), [end, setEnd] = useState(localTime(Date.now() - 60000));
  const [busy, setBusy] = useState(false), [clip, setClip] = useState<Segment>(), [rate, setRate] = useState(1), [position, setPosition] = useState(0), [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<{ start: number; end: number }>();
  const controller = useRef<AbortController | null>(null), blob = useRef(""), alive = useRef(true), video = useRef<HTMLVideoElement>(null), screen = useRef<HTMLDivElement>(null);
  const pending = useRef({ offset: 0, autoplay: false }), scrubbing = useRef(false), fullscreen = useCameraFullscreen(screen);
  const time = (stamp: number | string | null | undefined) => stamp === undefined || stamp === null ? t("نامشخص", "Unknown") : new Date(stamp).toLocaleString(isFa ? "fa-IR" : "en-US", deviceClock ? { timeZone: "UTC" } : undefined);
  const reset = () => { controller.current?.abort(); setBusy(false); video.current?.pause(); setPlaying(false); setClip(undefined); setRange(undefined); setError(""); if (blob.current) URL.revokeObjectURL(blob.current); blob.current = ""; };
  const selectRecording = (item?: Recording, context = inventory) => {
    reset(); setToken(item?.token ?? ""); const now=context?.timeBasis === "device-local" && context.deviceLocalTime ? Date.parse(context.deviceLocalTime.replace(" ","T")+"Z") : Date.now();
    const until = Math.min(item?.until ? Date.parse(item.until) : now - 60000, now);
    setEnd(toInput(Math.floor(until / 1000) * 1000,context)); setStart(toInput(Math.max(item?.from ? Date.parse(item.from) : 0, Math.floor(until / 1000) * 1000 - 300000),context));
  };
  const load = () => {
    reset(); setInventory(undefined); setToken(""); const request = new AbortController(); controller.current = request; setLoading(true);
    void cameraJson<Inventory>(`/${encodeURIComponent(camera.id)}/recordings`, { signal: request.signal }).then(data => {
      if (request.signal.aborted || !alive.current) return;
      setInventory(data); const candidate = initialSource ? data.recordings.find(item => item.source === initialSource) : data.recordings[0]; selectRecording(candidate,data);
    }).catch(failure => { if (!request.signal.aborted && alive.current) setError(failure instanceof Error ? failure.message : "CAMERA_REPLAY_FAILED"); }).finally(() => { if (alive.current) setLoading(false); });
  };
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; controller.current?.abort(); if (blob.current) URL.revokeObjectURL(blob.current); }; }, [camera.id, initialSource]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = inventory?.recordings.find(item => item.token === token);
  const fetchAt = async (target: number, autoplay: boolean, exporting = false) => {
    if (busy || !selected) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request; setBusy(true); setError(""); if (!exporting) video.current?.pause();
    try {
      const chosen = reviewRange(new Date(parseInput(start)).toISOString(), new Date(parseInput(end)).toISOString(),archiveNow), segment = reviewSegment(chosen, target, inventory?.maxClipSeconds ?? 60);
      if (selected.from && segment.start < Date.parse(selected.from) || selected.until && segment.start + segment.duration * 1000 > Date.parse(selected.until)) throw new Error("CAMERA_RECORDING_OUTSIDE_RANGE");
      const parameters = { recordingToken: token, start: new Date(segment.start).toISOString(), duration: segment.duration };
      const query = new URLSearchParams({ ...parameters, duration: String(segment.duration) });
      const response = await apiRequest(`/cameras/${encodeURIComponent(camera.id)}/playback${exporting ? "/export" : `?${query}`}`, { signal: request.signal, ...(exporting ? { method: "POST", body: JSON.stringify(parameters) } : {}) });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error?.code ?? "CAMERA_REPLAY_FAILED"); }
      if (!response.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("CAMERA_REPLAY_FAILED");
      const bytes = await response.blob(); if (bytes.size > 12 * 1024 * 1024) throw new Error("CAMERA_REPLAY_SIZE_LIMIT");
      if (!alive.current || request.signal.aborted) return;
      if (exporting) { const url = URL.createObjectURL(bytes), anchor = document.createElement("a"); anchor.href = url; anchor.download = `recording-${segment.start}.mp4`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
      else {
        video.current?.pause(); if (blob.current) URL.revokeObjectURL(blob.current); blob.current = URL.createObjectURL(bytes);
        pending.current = { offset: segment.offset, autoplay }; setClip({ url: blob.current, start: segment.start, duration: segment.duration }); setRange(chosen); setPosition(segment.start + segment.offset * 1000);
      }
    } catch (failure) { if (alive.current && !request.signal.aborted) { setError(failure instanceof Error ? failure.message : "CAMERA_REPLAY_FAILED"); video.current?.pause(); setPlaying(false); } }
    finally { if (alive.current && !request.signal.aborted) setBusy(false); }
  };
  const seek = (target: number) => {
    if (!range || !clip || busy) return;
    const at = Math.max(range.start, Math.min(range.end - 1, target)), duration = video.current?.duration ?? 0;
    if (video.current && Number.isFinite(duration) && at >= clip.start && at < clip.start + duration * 1000) { video.current.currentTime = (at - clip.start) / 1000; setPosition(at); }
    else void fetchAt(at, playing);
  };
  const toggle = () => { if (!video.current || busy) return; if (video.current.paused) void video.current.play().catch(() => setPlaying(false)); else video.current.pause(); };
  const unavailable = ["CAMERA_REPLAY_UNSUPPORTED", "CAMERA_ONVIF_UNAVAILABLE", "CAMERA_OPERATION_UNSUPPORTED", "CAMERA_XML_INVALID"].includes(error);
  const media = clip && <div className={`camera-replay-screen ${fullscreen.expanded ? "is-expanded" : ""}`} ref={screen} tabIndex={-1} role={fullscreen.expanded ? "dialog" : undefined} aria-modal={fullscreen.expanded || undefined} aria-label={t("پخش آرشیو دوربین", "Camera recording player")}>
    <div className="camera-replay-screen__title"><strong>{camera.name} · {selected?.name}</strong><button className="camera-icon-button" aria-label={fullscreen.expanded ? t("خروج از تمام‌صفحه", "Exit fullscreen") : t("تمام‌صفحه بازپخش", "Replay fullscreen")} onClick={fullscreen.toggle}>{fullscreen.expanded ? <Minimize size={17}/> : <Expand size={17}/>}</button></div>
    <video key={clip.url} ref={video} src={clip.url} controls controlsList="nodownload" playsInline preload="metadata" aria-label={t("کلیپ ضبط‌شده", "Recorded clip")} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onLoadedMetadata={() => { if (!video.current) return; video.current.playbackRate = rate; video.current.currentTime = Math.min(pending.current.offset, Math.max(0, video.current.duration - .1)); if (pending.current.autoplay) void video.current.play().catch(() => setPlaying(false)); }}
      onTimeUpdate={() => { if (!scrubbing.current && video.current) setPosition(Math.min(range?.end ?? Infinity, clip.start + video.current.currentTime * 1000)); }}
      onError={() => { setError("CAMERA_REPLAY_FAILED"); setPlaying(false); }}
      onEnded={() => { setPlaying(false); const next = clip.start + clip.duration * 1000; if (range && next < range.end - 500) { if ((video.current?.duration ?? 0) < clip.duration - 1) { setError("CAMERA_REPLAY_SHORT_SEGMENT"); return; } void fetchAt(next, true); } }}/>
    <div className="camera-replay-transport" dir={isFa ? "rtl" : "ltr"}>
      <div className="camera-replay-transport__buttons" dir="ltr"><button className="camera-icon-button" disabled={busy} aria-label={t("یک دقیقه عقب", "Back one minute")} onClick={() => seek(position - 60000)}><SkipBack size={18}/></button><button className="camera-icon-button" disabled={busy} aria-label={t("ده ثانیه عقب", "Back ten seconds")} onClick={() => seek(position - 10000)}><RotateCcw size={18}/><small>10</small></button><button className="camera-button camera-button--primary" disabled={busy} aria-label={playing ? t("توقف بازپخش", "Pause replay") : t("ادامه بازپخش", "Resume replay")} onClick={toggle}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button><button className="camera-icon-button" disabled={busy} aria-label={t("ده ثانیه جلو", "Forward ten seconds")} onClick={() => seek(position + 10000)}><RotateCw size={18}/><small>10</small></button><button className="camera-icon-button" disabled={busy} aria-label={t("یک دقیقه جلو", "Forward one minute")} onClick={() => seek(position + 60000)}><SkipForward size={18}/></button></div>
      <span className="camera-replay-position"><time>{time(position)}</time><small>{t("زمان درخواستی آرشیو", "Requested archive time")}</small></span>
      <CameraSelect label={t("سرعت بازپخش", "Replay speed")} value={String(rate)} onChange={value => { setRate(Number(value)); if (video.current) video.current.playbackRate = Number(value); }}>{[.25, .5, 1, 1.5, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}</CameraSelect>
    </div>
    {range && <div className="camera-replay-timeline" dir="ltr"><input type="range" min={range.start} max={range.end - 1} step={1000} value={Math.max(range.start, Math.min(range.end - 1, position))} disabled={busy} aria-label={t("نوار زمان بازپخش", "Recording timeline")} aria-valuetext={time(position)} onPointerDown={() => { scrubbing.current = true; }} onChange={e => { scrubbing.current = true; setPosition(Number(e.target.value)); }} onPointerUp={e => { scrubbing.current = false; seek(Number(e.currentTarget.value)); }} onPointerCancel={() => { scrubbing.current = false; }} onKeyUp={e => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) { scrubbing.current = false; seek(Number(e.currentTarget.value)); } }}/><div><time>{time(range.start)}</time><time>{time(range.end)}</time></div><small>{t("نوار زمان، بازهٔ انتخابی است؛ خط پیوسته به معنی ضبط پیوسته نیست. جابه‌جایی به زمان دور، قطعهٔ جدید دریافت می‌کند.", "This is the selected review range, not proof of continuous recording. Distant seeks fetch a new segment.")}</small></div>}
      {busy && <div className="camera-replay-buffering" role="status"><LoaderCircle className="camera-spin" size={17}/>{t("در حال دریافت قطعه…", "Loading segment…")}</div>}
  </div>;
  return <section className="camera-replay" aria-label={t("بازپخش آرشیو", "Recorded playback")}>
    <header className="camera-replay__heading"><span><History size={23}/></span><div><h3>{t("بازپخش دوربین", "Camera playback")}</h3><p>{camera.name} · {deviceClock ? t("زمان‌ها طبق ساعت ضبط‌کننده", "Times use the recorder clock") : t("زمان‌ها به وقت مرورگر شما", "Times use your browser timezone")}</p>{deviceClock && <p>{inventory.recorderName} · {t("کانال از تنظیمات واقعی NVR شناسایی شد", "Channel matched from actual NVR configuration")}</p>}</div><button className="camera-icon-button" disabled={loading || busy} onClick={load} aria-label={t("دریافت دوباره آرشیو", "Refresh recordings")}><RefreshCw size={17}/></button></header>
    {loading ? <p role="status" className="camera-replay__state"><LoaderCircle className="camera-spin"/>{t("بررسی آرشیو دستگاه…", "Checking device archives…")}</p> : unavailable ? <div className="camera-replay__state"><Film size={34}/><h4>{t("این اتصال، بازپخش قابل‌استفاده ارائه نکرد", "Replay is not available on this connection")}</h4><p>{t("پایش هارد یا نمایش زنده، پشتیبانی از بازپخش را ثابت نمی‌کند. ضبط‌کننده باید در همین شرکت ثبت شده و از ONVIF Replay یا مسیر مستقیم AppWeb/TaoShi سازگار پشتیبانی کند. Cloud ID اتصال متفاوتی است و هنوز فعال نیست.", "Register the recorder in this company with compatible ONVIF Replay or direct AppWeb/TaoShi access. Disk or live monitoring alone does not prove replay support. Cloud ID remains separate and unavailable.")}</p></div> : <>
      {inventory?.recordings.length ? <>
        {initialSource && !inventory.recordings.some(item => item.source === initialSource) && <p className="camera-alert" role="status">{t("ارتباط کانال انتخابی با آرشیو تأیید نشد؛ آرشیو صحیح را از فهرست واقعی دستگاه انتخاب کن. برنامه کانال را حدس نمی‌زند.", "The selected live channel could not be matched to an archive. Choose the actual device recording explicitly; channels are never guessed.")}</p>}
        <div className="camera-replay__form"><label>{t("دوربین / آرشیو ضبط‌شده", "Camera / recorded archive")}<CameraSelect label={t("انتخاب آرشیو دوربین", "Choose camera archive")} value={token} disabled={busy} onChange={value => selectRecording(inventory.recordings.find(item => item.token === value))}><option value="" disabled>{t("آرشیو را انتخاب کن", "Choose an archive")}</option>{inventory.recordings.map((item, index) => <option key={item.token} value={item.token}>{item.name || `${t("آرشیو", "Recording")} ${index + 1}`}{item.source ? ` · ${item.source}` : ""}</option>)}</CameraSelect></label>
          <label>{t("از تاریخ و ساعت", "From date & time")}<input type="datetime-local" step="1" value={start} max={toInput(archiveNow)} disabled={busy} onChange={e => { reset(); setStart(e.target.value); }}/></label>
          <label>{t("تا تاریخ و ساعت", "To date & time")}<input type="datetime-local" step="1" value={end} max={toInput(archiveNow)} disabled={busy} onChange={e => { reset(); setEnd(e.target.value); }}/></label></div>
        <div className="camera-replay-presets">{[1, 5, 15, 60].map(minutes => <button className="camera-button" key={minutes} disabled={busy || !selected} onClick={() => { reset(); const until = Math.floor(Math.min(selected?.until ? Date.parse(selected.until) : archiveNow - 1000, archiveNow) / 1000) * 1000; setEnd(toInput(until)); setStart(toInput(Math.max(selected?.from ? Date.parse(selected.from) : 0, until - minutes * 60000))); }}>{minutes} {t("دقیقهٔ آخر آرشیو", "min at archive end")}</button>)}</div>
        <div className="camera-replay__actions"><button className="camera-button camera-button--primary" disabled={busy || !token || !start || !end} onClick={() => void fetchAt(parseInput(start), true)}>{busy ? <LoaderCircle size={17} className="camera-spin"/> : <Play size={17}/>} {busy ? t("آماده‌سازی…", "Preparing…") : t("شروع بازپخش", "Start playback")}</button>{user?.role !== "viewer" && <button className="camera-button" disabled={busy || !token} onClick={() => void fetchAt(clip ? position : parseInput(start), false, true)}><Download size={16}/>{t("دانلود قطعهٔ فعلی", "Download current segment")}</button>}{busy && <button className="camera-button" onClick={() => { controller.current?.abort(); setBusy(false); setPlaying(false); }}><X size={16}/>{t("لغو دریافت", "Cancel loading")}</button>}</div>
        <p className="camera-hint">{deviceClock ? t("برای دریافت مطمئن از این ضبط‌کننده، قطعه‌های حداکثر ۱۵ ثانیه‌ای آماده می‌شوند و سپس قطعهٔ بعدی دریافت می‌شود. دانلود فقط قطعهٔ فعلی است.", "This recorder loads bounded segments of up to 15 seconds, then requests the next segment. Download exports only the current segment.") : t("بازهٔ مرور: حداکثر ۲۴ ساعت. هر بار فقط تا ۶۰ ثانیه و ۱۲ مگابایت دریافت می‌شود؛ دانلود نیز فقط همان قطعه است، نه کل بازه.", "Review up to 24 hours. Only a segment of up to 60 seconds / 12 MiB is loaded at once. Download exports that segment, not the entire review range.")}</p>
        {media ? fullscreen.expanded ? createPortal(media, document.body) : media : <div className="camera-replay-empty"><Film size={32}/><p>{t("دوربین و بازه را انتخاب کن و «شروع بازپخش» را بزن.", "Choose an archive and time range, then start playback.")}</p></div>}
        <details className="camera-disclosure"><summary>{t("بازهٔ موجودی گزارش‌شدهٔ دستگاه", "Device-reported archive bounds")}</summary><p className="camera-hint">{time(selected?.from)} ← {time(selected?.until)} · {t("وجود وقفه در ضبط ممکن است؛ پیوستگی تأیید نشده است.", "Recording may have gaps; continuity is not verified.")}</p></details>
      </> : inventory && <p className="camera-replay__state">{t("دستگاه هیچ آرشیو قابل‌دسترسی گزارش نکرد.", "No accessible recordings were reported.")}</p>}
      {error && <p className="camera-alert" role="alert">{cameraErrorMessage(new Error(error), isFa)}</p>}{inventory?.truncated && <p className="camera-hint">{t("فهرست به ۳۲ آرشیو نخست محدود شده است.", "Showing the first 32 archives.")}</p>}
    </>}
  </section>;
}
