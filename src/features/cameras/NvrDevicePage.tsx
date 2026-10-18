import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, ArrowRight, Camera, Check, CircleHelp, HardDrive, RefreshCw, Server, Settings2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { RouteComponentProps } from "@/routes/appRoutes";
import { cameraErrorMessage, cameraJson, getCamera, type CameraDevice, type NvrMonitor, type NvrSensor } from "@/lib/cameras";
import { CameraDetailDialog } from "./CameraDetailDialog";
import { NvrMonitorPanel } from "./NvrMonitorPanel";
import { NvrConnectionPanel } from "./NvrConnectionPanel";
import { NvrNativePanel } from "./NvrNativePanel";
import "./CamerasPage.css";
import "./NvrDevicePage.css";

function SensorTrend({ sensor, history, fa }: { sensor: NvrSensor; history: NvrMonitor["history"]; fa: boolean }) {
  const values = history.map(item => item.readings?.[sensor.id]);
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length < 2 || sensor.unit === "boolean") return <p className="nvr-sensor__history-note">{fa ? "روند پس از حداقل دو اندازه‌گیری واقعی" : "Trend after two actual measurements"}</p>;
  const low = Math.min(...known), high = Math.max(...known), scale = high - low || 1;
  // Missing readings break the line. No synthetic values or interpolation across gaps.
  return <svg className="nvr-sensor__trend" viewBox="0 0 240 44" role="img" aria-label={fa ? "روند آخرین اندازه‌گیری‌ها، قدیمی به جدید" : "Recent measurements, oldest to newest"}>
    {values.map((value, i) => typeof value === "number" && Number.isFinite(value) ? <g key={i}>{i > 0 && typeof values[i - 1] === "number" && Number.isFinite(values[i - 1]) && <line x1={(i - 1) * 232 / (values.length - 1) + 4} y1={36 - (values[i - 1]! - low) / scale * 28} x2={i * 232 / (values.length - 1) + 4} y2={36 - (value - low) / scale * 28}/>}<circle cx={i * 232 / (values.length - 1) + 4} cy={36 - (value - low) / scale * 28} r="2"/></g> : null)}
  </svg>;
}
function sensorValue(sensor: NvrSensor, fa: boolean) {
  if (sensor.value === null) return "—";
  if (sensor.unit === "boolean") return sensor.value ? (fa ? "تأییدشده" : "Confirmed") : (fa ? "خطا / بی‌پاسخ" : "Error / no response");
  if (sensor.unit === "bytes") return `${(sensor.value / 1024 ** 3).toLocaleString(fa ? "fa-IR" : "en-US", { maximumFractionDigits: 1 })} GiB`;
  return `${sensor.value.toLocaleString(fa ? "fa-IR" : "en-US", { maximumFractionDigits: 1 })}${sensor.unit === "count" ? "" : ` ${sensor.unit}`}`;
}
export default function NvrDevicePage({ params }: RouteComponentProps) {
  const id = (params.deviceId ?? "").slice(4), { i18n } = useTranslation(), { user } = useAuth(), fa = i18n.language.startsWith("fa"), t = (faText: string, en: string) => fa ? faText : en;
  const [camera, setCamera] = useState<CameraDevice>(), [data, setData] = useState<NvrMonitor>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("sensors"), [group, setGroup] = useState("all"), [settings, setSettings] = useState(false), [removed, setRemoved] = useState(false);
  const canManage = Boolean(user && user.role !== "viewer");
  const load = useCallback(async () => {
    try { const [device, monitor] = await Promise.all([getCamera(id), cameraJson<NvrMonitor>(`/${encodeURIComponent(id)}/monitor`)]);
      if (device.camera.kind !== "nvr") throw new Error("CAMERA_NOT_FOUND");
      setCamera(device.camera); setData(monitor); setError("");
    } catch (failure) { setError(cameraErrorMessage(failure, fa)); }
  }, [id, fa]);
  useEffect(() => { setCamera(undefined); setData(undefined); setRemoved(false); void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000); return () => clearInterval(timer); }, [load]);
  const check = async () => { if (busy) return; setBusy(true); try { setData(await cameraJson<NvrMonitor>(`/${encodeURIComponent(id)}/monitor/refresh`, { method: "POST" })); setError(""); } catch (failure) { setError(cameraErrorMessage(failure, fa)); } finally { setBusy(false); } };
  const sensors = data?.sensors ?? [], measured = sensors.filter(sensor => sensor.value !== null && sensor.status !== "stale"), alerts = sensors.filter(sensor => ["critical", "warning"].includes(sensor.status));
  const status = { ok: t("دریافت‌شده", "Measured"), warning: t("هشدار", "Warning"), critical: t("نیازمند رسیدگی", "Needs attention"), unknown: t("داده موجود نیست", "Not available"), stale: t("داده قدیمی", "Stale") };
  return <section className="cameras-page nvr-device-page" dir={fa ? "rtl" : "ltr"}>
    <Link className="nvr-back" to="/assets/devices"><ArrowRight size={16}/>{t("تجهیزات و دارایی‌ها", "Devices & assets")}</Link>
    {error && <div className="camera-alert" role="alert">{error}<button className="camera-button" onClick={() => void load()}>{t("دوباره تلاش کن", "Retry")}</button></div>}
    {removed ? <p role="status">{t("تجهیز حذف شد.", "Device removed.")}</p> : !camera ? <p role="status">{error ? t("اطلاعات تجهیز دریافت نشد؛ دوباره تلاش کن.", "Recorder unavailable. Please retry.") : t("در حال دریافت تجهیز…", "Loading recorder…")}</p> : <>
      <header className="nvr-device-hero"><div className="nvr-device-hero__identity"><span className="nvr-device-icon"><Server size={30}/></span><div><span className="cameras-page__eyebrow">EOSNET / RECORDER</span><h1>{camera.name}</h1><p>{camera.company?.name ?? t("بدون شرکت", "Unassigned")} <span aria-hidden="true">·</span> <bdi>{camera.host}</bdi></p></div></div><div className="nvr-device-actions"><Link className="camera-button" to={`/assets/cameras?company=${encodeURIComponent(camera.companyId ?? "unassigned")}&device=${encodeURIComponent(camera.id)}`}><Camera size={17}/>{t("کانال‌ها و تصویر", "Channels & video")}</Link>{canManage && <button className="camera-button" onClick={() => setSettings(true)}><Settings2 size={17}/>{t("تنظیمات و کنترل", "Settings & controls")}</button>}</div>
        <div className="nvr-device-summary"><div><Activity/><strong dir="ltr">{measured.length.toLocaleString(fa ? "fa-IR" : "en-US")} / {sensors.length.toLocaleString(fa ? "fa-IR" : "en-US")}</strong><span>{t("سنسور با دادهٔ تازه", "Sensors with fresh data")}</span></div><div><CircleHelp/><strong>{sensors.filter(sensor => sensor.status === "unknown" || sensor.status === "stale").length}</strong><span>{t("ناموجود یا نیازمند به‌روزرسانی", "Unavailable or stale")}</span></div><div className={alerts.length ? "has-alert" : ""}><HardDrive/><strong>{alerts.length || "—"}</strong><span>{t("هشدار اندازه‌گیری‌شده", "Measured alerts")}</span></div></div>
      </header>
      <div className="nvr-workspace-toolbar"><div className="nvr-registration-tabs" role="tablist" aria-label={t("فضای کاری NVR", "NVR workspace")}>{[["sensors", t("سنسورها", "Sensors")], ["storage", t("هارد و تنظیم پایش", "Disks & schedule")]].map(([key, label]) => <button key={key} id={`nvr-tab-${key}`} aria-controls={`nvr-panel-${key}`} role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>{canManage && <button className="camera-button camera-button--primary" disabled={busy} onClick={() => void check()}><RefreshCw size={16} className={busy ? "camera-spin" : ""}/>{busy ? t("در حال پایش…", "Checking…") : t("پایش الان", "Check now")}</button>}</div>
      <p className="nvr-workspace-note">{data?.report ? `${t("آخرین اندازه‌گیری", "Last measured")}: ${new Date(data.report.checkedAt).toLocaleString(fa ? "fa-IR" : "en-US")}` : t("هنوز پایش نشده؛ ابتدا مسیر هارد را تنظیم کن و «پایش الان» را بزن.", "Not checked yet. Configure a disk adapter and select Check now.")} · {data?.monitoringEnabled ? t("پایش دوره‌ای فعال", "Scheduled monitoring enabled") : t("پایش دوره‌ای خاموش", "Scheduled monitoring off")}</p>
      {[...new Set([camera.lastErrorCode, data?.report?.errorCode, data?.report?.storage?.errorCode].filter((code): code is string => Boolean(code)))].map(code => <p key={code} className="camera-alert" role="status">{cameraErrorMessage(new Error(code), fa)}</p>)}
      {canManage && <NvrConnectionPanel key={`${camera.id}:${camera.connectionMode}:${camera.onvifPort}`} camera={camera} fa={fa} onChanged={() => void load()}/>}
      {data?.report?.native && <NvrNativePanel native={data.report.native} fa={fa}/>}
      {tab === "sensors" ? <section role="tabpanel" id="nvr-panel-sensors" aria-labelledby="nvr-tab-sensors"><div className="nvr-sensor-filters" aria-label={t("گروه سنسور", "Sensor group")}>{[["all", t("همه", "All")], ["connection", t("اتصال", "Connection")], ["storage", t("هاردها", "Storage")], ["recording", t("ضبط", "Recording")], ["hardware", t("سخت‌افزار", "Hardware")]].map(([key, label]) => <button key={key} className={group === key ? "is-active" : ""} aria-pressed={group === key} onClick={() => setGroup(key)}>{label}</button>)}</div>
        <div className="nvr-sensor-grid">{sensors.filter(sensor => group === "all" || sensor.group === group).map(sensor => <article className={`nvr-sensor is-${sensor.status}`} key={sensor.id}><header><h2>{fa ? sensor.labelFa : sensor.labelEn}</h2><span>{sensor.status === "ok" ? <Check size={12}/> : <CircleHelp size={12}/>} {status[sensor.status]}</span></header><strong className="nvr-sensor__value" dir="auto">{sensorValue(sensor, fa)}</strong><SensorTrend sensor={sensor} history={data?.history ?? []} fa={fa}/><p>{fa ? sensor.noteFa : sensor.noteEn}</p><footer><span>{t("منبع", "Source")}</span><bdi>{sensor.source}</bdi></footer></article>)}</div>
        <p className="camera-hint">{t("سنسور ناموجود، صفر یا سالم فرض نمی‌شود. پشتیبانی CPU، حافظه، SMART و وضعیت ضبط به API، نسخه و مجوز حساب دستگاه بستگی دارد. نمودارها حداکثر ۴۸ اندازه‌گیری واقعی را نشان می‌دهند.", "Missing sensors are not treated as zero or healthy. CPU, memory, SMART and recording support depends on device APIs, firmware and account permissions. Charts contain up to 48 actual measurements.")}</p>
      </section> : <section role="tabpanel" id="nvr-panel-storage" aria-labelledby="nvr-tab-storage"><NvrMonitorPanel camera={camera} isFa={fa} canManage={canManage} onChanged={updated => { setCamera(updated); void load(); }}/></section>}
      {settings && <CameraDetailDialog showMonitor={false} camera={camera} isFa={fa} role={user?.role ?? "viewer"} canOperate={user?.role === "admin" || Boolean(user?.allowedSections.includes("actions"))} onClose={() => { setSettings(false); void load(); }} onChanged={updated => { setCamera(updated); void load(); }} onRemoved={() => { setSettings(false); setRemoved(true); }}/>}</>}
  </section>;
}
