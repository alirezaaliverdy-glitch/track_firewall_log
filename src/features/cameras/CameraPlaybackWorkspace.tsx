import { useState } from "react";
import { Camera, Film, Search, Video } from "lucide-react";
import type { CameraDevice } from "@/lib/cameras";
import { CameraPlaybackPanel } from "./CameraPlaybackPanel";
import "./CameraPlaybackPanel.css";

export function CameraPlaybackWorkspace({ devices, selectedId, source, onSelect, fa, loading }: { devices: CameraDevice[]; selectedId: string | null; source: string; onSelect: (id: string, source: string) => void; fa: boolean; loading: boolean }) {
  const [search, setSearch] = useState(""), t = (a: string, b: string) => fa ? a : b;
  const entries = devices.flatMap(device => {
    const channels = [...new Map(device.profiles.map(profile => [profile.sourceToken || profile.token, profile.name])).entries()];
    return channels.length && device.kind === "nvr" ? channels.map(([key, name], index) => ({ device, source: key, name: `${t("دوربین", "Camera")} ${index + 1} · ${name}` })) : [{ device, source: "", name: device.kind === "nvr" ? t("آرشیو کانال‌های ضبط‌کننده", "Recorder channel archives") : device.name }];
  }).filter(entry => `${entry.name} ${entry.device.name} ${entry.device.host} ${entry.device.location}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = devices.find(device => device.id === selectedId);
  return <div className="camera-review-workspace"><aside className="camera-review-list" aria-label={t("انتخاب دوربین برای بازپخش", "Select a camera for playback")}>
    <header><span className="camera-review-step">1</span><div><h2>{t("دوربین را انتخاب کن", "Choose a camera")}</h2><p>{t("در شرکت انتخاب‌شده", "In the selected company")}</p></div></header>
    <label className="camera-review-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("نام دوربین، محل یا IP", "Camera, location or IP")} aria-label={t("جست‌وجوی دوربین بازپخش", "Search playback cameras")}/></label>
    <div className="camera-review-list__items">{entries.map(entry => <button key={`${entry.device.id}:${entry.source}`} className={selectedId === entry.device.id && source === entry.source ? "is-selected" : ""} aria-pressed={selectedId === entry.device.id && source === entry.source} onClick={() => { onSelect(entry.device.id, entry.source); requestAnimationFrame(() => { if (matchMedia("(max-width:1000px)").matches) { const main = document.querySelector<HTMLElement>(".camera-review-main"); main?.scrollIntoView({ block: "start" }); main?.focus({ preventScroll: true }); } }); }}><span><Video size={20}/></span><div><strong>{entry.name}</strong><small>{entry.device.kind === "nvr" ? entry.device.name : entry.device.location || t("دوربین مستقل", "Standalone camera")}</small><bdi>{entry.device.host}</bdi></div><Film size={15}/></button>)}</div>
    {!entries.length && <p className="camera-hint">{loading ? t("در حال دریافت…", "Loading…") : t("دوربینی با این جست‌وجو موجود نیست.", "No matching cameras.")}</p>}
  </aside><section className="camera-review-main" tabIndex={-1} aria-label={t("مرور آرشیو", "Archive review")} style={{ scrollMarginTop: 110 }}><header><span className="camera-review-step">2</span><div><h2>{t("زمان را پیدا کن", "Find the moment")}</h2><p>{t("انتخاب بازه و مرور آرشیو، در همین صفحه", "Select a range and review footage here")}</p></div></header>{selected ? <CameraPlaybackPanel key={`${selected.id}:${source}`} camera={selected} initialSource={source} isFa={fa}/> : <div className="camera-review-welcome"><Camera size={46}/><h3>{t("هر دوربین، یک خط زمان", "A timeline for each camera")}</h3><p>{t("ابتدا دوربین را از فهرست انتخاب کن؛ سپس تاریخ و ساعت شروع و پایان را تعیین کن. پخش فقط از آرشیو واقعی و سازگار دستگاه انجام می‌شود.", "Choose a camera, then set the start and end time. Playback uses actual compatible device archives only.")}</p></div>}</section></div>;
}
