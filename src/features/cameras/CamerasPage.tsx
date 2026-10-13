import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ChevronLeft, LoaderCircle, Plus, RefreshCw, Search, Server, Settings2, Video } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cameraErrorMessage, listCameras, type CameraDevice, type CameraProfile } from "@/lib/cameras";
import { CameraAddDialog } from "./CameraAddDialog";
import { CameraDetailDialog } from "./CameraDetailDialog";
import { CameraPlayer } from "./CameraPlayer";
import "./CamerasPage.css";

function sources(camera: CameraDevice) {
  const groups = new Map<string, CameraProfile[]>();
  for (const profile of camera.profiles) { const key = profile.sourceToken || profile.token; const current = groups.get(key) ?? []; current.push(profile); groups.set(key, current); }
  return [...groups.entries()].map(([key, profiles]) => ({ key, profiles, label: profiles[0].name }));
}
const initialProfile = (profiles: CameraProfile[]) => [...profiles].filter((profile) => profile.streamAvailable || profile.snapshotAvailable).sort((a, b) => (a.width ?? 9999) * (a.height ?? 9999) - (b.width ?? 9999) * (b.height ?? 9999))[0];

function CameraCard({ camera, isFa, onView, onDetail }: { camera: CameraDevice; isFa: boolean; onView: (source: string) => void; onDetail: () => void }) {
  const channels = sources(camera), [source, setSource] = useState(channels[0]?.key ?? "");
  const selected = channels.find((channel) => channel.key === source) ?? channels[0];
  const profile = selected ? initialProfile(selected.profiles) : undefined;
  const copy = (fa: string, en: string) => isFa ? fa : en;
  return <article className="camera-device-card">
    <header><span className="camera-device-icon">{camera.kind === "nvr" ? <Server size={24} /> : <Camera size={24} />}</span><span className={`camera-status is-${camera.status}`}><i />{copy(camera.status === "verified" ? "متصل" : camera.status === "error" ? "نیاز به بررسی" : "بررسی نشده", camera.status === "verified" ? "Connected" : camera.status === "error" ? "Needs attention" : "Unverified")}</span><button className="camera-icon-button" type="button" onClick={onDetail} aria-label={copy(`تنظیمات ${camera.name}`, `${camera.name} settings`)}><Settings2 size={18} /></button></header>
    <h2>{camera.name}</h2><p dir="ltr" className="camera-device-card__ip">{camera.host}</p>
    <div className="camera-device-card__meta"><span>{camera.infoJson?.Model || camera.connectionMode.toUpperCase()}</span><span>{camera.location || (camera.kind === "nvr" ? `${channels.length} ${copy("کانال", "channels")}` : copy("دوربین", "Camera"))}</span></div>
    {channels.length > 1 ? <select value={selected?.key ?? ""} onChange={(event) => setSource(event.target.value)} aria-label={copy("کانال NVR", "NVR channel")}>{channels.map((channel, index) => <option key={channel.key} value={channel.key}>{index + 1} · {channel.label}</option>)}</select> : null}
    {camera.lastErrorCode ? <p className="camera-device-card__error">{cameraErrorMessage(new Error(camera.lastErrorCode), isFa)}</p> : null}
    <footer><button type="button" className="camera-button camera-button--primary" onClick={() => { if (profile && selected) onView(selected.key); else onDetail(); }}>{profile ? <Video size={17} /> : <Settings2 size={17} />}{profile ? copy("نمایش تصویر", "View video") : copy("تکمیل اتصال", "Set up connection")}</button><button type="button" className="camera-button camera-button--quiet" onClick={onDetail}>{copy("جزئیات", "Details")}<ChevronLeft size={16} /></button></footer>
  </article>;
}

export default function CamerasPage() {
  const { i18n } = useTranslation(), { user } = useAuth();
  const isFa = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa"), copy = (fa: string, en: string) => isFa ? fa : en;
  const [devices, setDevices] = useState<CameraDevice[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [add, setAdd] = useState(false), [detailId, setDetailId] = useState<string | null>(null), [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "camera" | "nvr">("all"), [views, setViews] = useState<Array<{ id: string; source: string }>>([]), [viewNotice, setViewNotice] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setDevices((await listCameras()).cameras); } catch (failure) { setError(cameraErrorMessage(failure, isFa)); } finally { setLoading(false); } }, [isFa]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => devices.filter((camera) => (filter === "all" || camera.kind === filter) && `${camera.name} ${camera.host} ${camera.location} ${camera.infoJson?.Model ?? ""}`.toLowerCase().includes(search.toLowerCase())), [devices, filter, search]);
  const detail = devices.find((camera) => camera.id === detailId);
  const changed = (camera: CameraDevice) => { setDevices((current) => current.map((item) => item.id === camera.id ? camera : item)); };
  const addView = (id: string, source: string) => {
    setViewNotice("");
    if (views.some((view) => view.id === id && view.source === source)) { document.getElementById("camera-live-views")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (views.length >= 4) { setViewNotice(copy("برای بازکردن تصویر دیگر، یکی از چهار تصویر را ببند.", "Close one of the four views before opening another.")); return; }
    setViews((current) => [...current, { id, source }]);
    requestAnimationFrame(() => document.getElementById("camera-live-views")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return <section className="cameras-page">
    <header className="cameras-page__heading"><div><span className="cameras-page__eyebrow"><Camera size={16} />{copy("دوربین و ضبط‌کننده", "Cameras & recorders")}</span><h1>{copy("دوربین‌ها", "Cameras")}</h1><p>{copy("تصویر و وضعیت دستگاه‌ها در یک جا", "Video and device status in one place")}</p></div><div className="camera-heading-actions"><button type="button" className="camera-icon-button" disabled={loading} onClick={() => void load()} aria-label={copy("به‌روزرسانی فهرست", "Refresh list")}><RefreshCw size={19} className={loading ? "camera-spin" : ""} /></button>{user?.role !== "viewer" ? <button type="button" className="camera-button camera-button--primary" onClick={() => setAdd(true)}><Plus size={18} />{copy("افزودن دستگاه", "Add device")}</button> : null}</div></header>
    {error ? <div className="camera-alert" role="alert">{error}<button type="button" className="camera-button" onClick={() => void load()}>{copy("تلاش دوباره", "Retry")}</button></div> : null}
    {views.length ? <section className="camera-live-section" id="camera-live-views" aria-label={copy("تصاویر باز", "Open views")}><header><h2><Video size={19} />{copy("تصاویر", "Live views")}</h2><button className="camera-button camera-button--quiet" type="button" onClick={() => setViews([])}>{copy("بستن همه", "Close all")}</button></header><div className="camera-view-grid">{views.map((view) => { const camera = devices.find((item) => item.id === view.id), channel = camera ? sources(camera).find((item) => item.key === view.source) : null; const profile = channel ? initialProfile(channel.profiles) : null; return camera && channel && profile ? <CameraPlayer key={`${view.id}:${view.source}`} camera={camera} profiles={channel.profiles} initialProfile={profile.token} isFa={isFa} onClose={() => setViews((current) => current.filter((item) => item !== view))} /> : null; })}</div></section> : null}
    {viewNotice ? <p className="camera-alert" role="status">{viewNotice}</p> : null}
    <div className="camera-inventory-toolbar"><div className="camera-filter" aria-label={copy("نوع دستگاه", "Device type")}>{(["all", "camera", "nvr"] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? copy("همه", "All") : value === "camera" ? copy("دوربین", "Cameras") : "NVR"}<span>{(value === "all" ? devices.length : devices.filter((camera) => camera.kind === value).length).toLocaleString(isFa ? "fa-IR" : "en-US")}</span></button>)}</div><label className="camera-search"><Search size={17} /><input aria-label={copy("جست‌وجوی دوربین", "Search cameras")} placeholder={copy("نام، IP یا محل نصب", "Name, IP or location")} value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {loading && !devices.length ? <div className="camera-empty" role="status"><LoaderCircle size={32} className="camera-spin" /><p>{copy("دریافت دستگاه‌ها…", "Loading devices…")}</p></div> : filtered.length ? <div className="camera-device-grid">{filtered.map((camera) => <CameraCard key={camera.id} camera={camera} isFa={isFa} onDetail={() => setDetailId(camera.id)} onView={(source) => addView(camera.id, source)} />)}</div> : <div className="camera-empty"><span className="camera-empty__icon"><Camera size={42} strokeWidth={1.3} /></span><h2>{devices.length ? copy("موردی پیدا نشد", "No matches") : copy("اولین دوربین را اضافه کن", "Add your first camera")}</h2><p>{devices.length ? copy("جست‌وجو یا فیلتر را تغییر بده.", "Change the search or filter.") : copy("شبکه را جست‌وجو کن یا دوربین و NVR را با IP اضافه کن.", "Discover your network or add a camera or NVR by IP.")}</p>{!devices.length && user?.role !== "viewer" ? <button className="camera-button camera-button--primary" type="button" onClick={() => setAdd(true)}><Plus size={17} />{copy("افزودن دستگاه", "Add device")}</button> : null}</div>}
    <details className="camera-disclosure camera-setup-help"><summary>{copy("راهنمای اتصال", "Connection help")}</summary><p>{copy("ONVIF را روی دوربین یا NVR فعال کن و کاربر مجازِ مشاهده بساز. سرور برنامه باید از شبکهٔ محلی یا VPN به دستگاه برسد. دوربین‌های پشت پورت PoE خصوصی NVR ممکن است فقط از کانال‌های خود NVR قابل مشاهده باشند.", "Enable ONVIF and a permitted viewing account on the camera or NVR. The app server needs a LAN or VPN route to it. Cameras on a recorder's private PoE network may only be visible through its NVR channels.")}</p><p>{copy("برای دستگاه‌هایی که ONVIF ندارند، آدرس RTSP را از تنظیمات یا راهنمای سازنده در افزودن دستی وارد کن. تشخیص برند و امکانات به پاسخ واقعی دستگاه بستگی دارد.", "For devices without ONVIF, enter the manufacturer's RTSP URL in manual setup. Identity and available features depend on the device's actual response.")}</p></details>
    {add ? <CameraAddDialog isFa={isFa} onClose={() => setAdd(false)} onSaved={(added) => { setDevices((current) => [...added, ...current.filter((item) => !added.some((camera) => camera.id === item.id))]); }} /> : null}
    {detail ? <CameraDetailDialog key={detail.id} camera={detail} isFa={isFa} role={user?.role ?? "viewer"} canOperate={user?.role === "admin" || Boolean(user?.allowedSections.includes("actions"))} onClose={() => setDetailId(null)} onChanged={changed} onRemoved={(id) => { setDevices((current) => current.filter((item) => item.id !== id)); setViews((current) => current.filter((item) => item.id !== id)); }} /> : null}
  </section>;
}
