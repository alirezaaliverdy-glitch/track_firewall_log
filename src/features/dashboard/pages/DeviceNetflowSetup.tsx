import { useEffect, useState } from "react";
import { getNetflowSettings, saveNetflowSettings, type NetflowSettings } from "@/lib/deviceTraffic";

export function DeviceNetflowSetup({ deviceId, host, isFa }: { deviceId: string; host: string; isFa: boolean }) {
  const [settings, setSettings] = useState<NetflowSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [exporterIp, setExporterIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setSettings(null);
    setMessage("");
    void getNetflowSettings(deviceId).then((result) => { if (active) { setSettings(result); setEnabled(result.enabled); setExporterIp(result.exporterIp ?? host); } }).catch(() => { if (active) setMessage(isFa ? "وضعیت گیرنده در دسترس نیست." : "Receiver status unavailable."); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void getNetflowSettings(deviceId).then((result) => { if (active) setSettings(result); }).catch(() => undefined); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [deviceId, host, isFa]);
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveNetflowSettings(deviceId, enabled, exporterIp.trim());
      const result = await getNetflowSettings(deviceId);
      setSettings(result);
      setMessage(isFa ? "تنظیم ذخیره شد." : "Settings saved.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "ADMIN_REQUIRED" ? isFa ? "فقط مدیر می‌تواند گیرنده را تنظیم کند." : "Only an admin can configure this receiver." : code === "EXPORTER_IP_ALREADY_ASSIGNED" ? isFa ? "این IP به تجهیز دیگری اختصاص یافته است." : "This IP belongs to another device." : isFa ? "ذخیره نشد؛ IP صادرکننده را بررسی کنید." : "Save failed; check exporter IP.");
    } finally { setSaving(false); }
  };
  return <details className="device-netflow-setup"><summary>{isFa ? "دریافت مستقیم NetFlow v5" : "Direct NetFlow v5 collection"}<span className={settings?.enabled && settings.lastSeenAt ? "is-live" : ""}>{settings?.enabled ? settings.lastSeenAt ? isFa ? "داده دریافت شده" : "Receiving" : isFa ? "منتظر جریان" : "Waiting for flows" : isFa ? "خاموش" : "Off"}</span></summary>
    <div className="device-netflow-setup__body">
      <p>{isFa ? "IP واقعی صادرکننده را ثبت کنید؛ سپس در تجهیز، NetFlow نسخهٔ ۵ را به IP مستقیم سرور روی UDP/2055 بفرستید. دامنهٔ پشت CDN مقصد UDP نیست." : "Register the exporter's real source IP, then send NetFlow v5 to the server's direct IP on UDP/2055. A CDN hostname is not a UDP target."}</p>
      <label className="device-netflow-setup__switch"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{isFa ? "دریافت برای این تجهیز" : "Enable for this device"}</label>
      <label className="device-netflow-setup__ip">{isFa ? "IP مبدأ صادرکننده" : "Exporter source IP"}<input dir="ltr" inputMode="decimal" value={exporterIp} onChange={(event) => setExporterIp(event.target.value)} placeholder="192.0.2.10" /></label>
      <div className="device-netflow-setup__footer"><button type="button" onClick={() => void save()} disabled={saving || !exporterIp.trim()}>{saving ? isFa ? "در حال ذخیره…" : "Saving…" : isFa ? "ذخیره" : "Save"}</button><span>{settings?.receiver.listening ? isFa ? "گیرنده فعال" : "Receiver active" : isFa ? "گیرنده غیرفعال" : "Receiver offline"}</span>{settings?.lastSeenAt ? <span>{isFa ? "آخرین داده:" : "Last flow:"} {new Date(settings.lastSeenAt).toLocaleString(isFa ? "fa-IR" : "en-US")}</span> : null}{settings?.packets.dropped ? <span className="device-netflow-setup__warning">{isFa ? "بستهٔ ردشده:" : "Dropped packets:"} {settings.packets.dropped}</span> : null}</div>
      {settings?.receiver.hostBind === "127.0.0.1" ? <p className="device-netflow-setup__warning">{isFa ? "پورت فعلاً فقط روی خود سرور باز است؛ برای تجهیز راه‌دور، NETFLOW_BIND_IP را روی IP سرور بگذارید و UDP/2055 را فقط از IP صادرکننده مجاز کنید." : "Host port is loopback-only. For remote exporters bind NETFLOW_BIND_IP to the server IP and allow UDP/2055 only from the exporter."}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <small>{isFa ? "NetFlow v5 به‌صورت push است. فقط صادرکنندهٔ ثبت‌شده پذیرفته می‌شود؛ برای دسترسی بیرونی باید NETFLOW_BIND_IP و فایروال سرور را محدود به IP تجهیز تنظیم کنید. IP فرستنده به‌تنهایی احراز هویت رمزنگاری‌شده نیست." : "NetFlow v5 is push-based. Only the registered exporter is accepted. Restrict host UDP access to that IP; source IP is not cryptographic authentication."}</small>
    </div>
  </details>;
}
