import { useState } from "react";
import { Cable, RefreshCw } from "lucide-react";
import { cameraJson, updateCamera, cameraErrorMessage, type CameraDevice, type NvrMonitor } from "@/lib/cameras";
export function NvrConnectionPanel({ camera, fa, onChanged }: { camera: CameraDevice; fa: boolean; onChanged: () => void }) {
  const t = (a: string, b: string) => fa ? a : b;
  const [mode, setMode] = useState(camera.connectionMode === "appweb" ? "appweb" : camera.connectionMode === "dvrip" ? "dvrip" : "onvif"), [port, setPort] = useState(camera.onvifPort), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <details className="nvr-connection camera-disclosure" open={camera.status !== "verified"}><summary><Cable size={18}/>{t("اتصال واقعی و سازگاری NVR", "NVR connection & compatibility")}</summary><p className="camera-hint">{t("اگر پنل دستگاه AppWeb2.0 است، AppWeb را با پورت وب انتخاب کن؛ XMEye/DVRIP مسیر دیگری است. حساب رمزگذاری‌شده و مسیر شبکهٔ فعلی استفاده می‌شوند. بررسی فقط خواندنی است و تنظیمات دستگاه را تغییر نمی‌دهد.", "For AppWeb2.0 panels choose AppWeb and the web port. XMEye/DVRIP is a separate protocol. Uses the saved encrypted account and network route. Read-only; no device settings change.")}</p>
    <form className="camera-form" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(""); try {
      if (mode !== camera.connectionMode || port !== camera.onvifPort) await updateCamera(camera.id, { connectionMode: mode as "onvif" | "dvrip" | "appweb", onvifPort: port });
      const result = await cameraJson<NvrMonitor>(`/${camera.id}/monitor/refresh`, { method: "POST" });
      onChanged(); if (!result.report?.reachable) setError(cameraErrorMessage(new Error(result.report?.errorCode ?? "CAMERA_CONNECTION_FAILED"), fa));
    } catch (e) { setError(cameraErrorMessage(e, fa)); } finally { setBusy(false); } }}>
      <div className="camera-form-grid"><label>{t("روش دریافت اطلاعات", "Monitoring protocol")}<select disabled={busy} value={mode} onChange={e => { setMode(e.target.value); setPort(e.target.value === "dvrip" ? 34567 : 80); }}><option value="onvif">ONVIF</option><option value="appweb">AppWeb2.0 · HTTP CGI</option><option value="dvrip">Xiongmai / XMEye · DVRIP</option></select></label><label>{mode === "dvrip" ? t("پورت TCP اختصاصی", "Native TCP port") : mode === "appweb" ? t("پورت وب NVR", "NVR web port") : t("پورت ONVIF", "ONVIF port")}<input disabled={busy} type="number" min={1} max={65535} required value={port} onChange={e => setPort(Number(e.target.value))}/></label></div>
      <button disabled={busy} className="camera-button camera-button--primary"><RefreshCw size={16} className={busy ? "camera-spin" : ""}/>{busy ? t("در حال بررسی…", "Checking…") : t("ذخیره مسیر و دریافت اطلاعات", "Save connection & read information")}</button>{error && <p className="camera-alert" role="alert">{error}</p>}
    </form></details>;
}
