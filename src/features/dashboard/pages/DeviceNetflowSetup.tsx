import { useEffect, useState } from "react";
import { getNetflowSettings, saveNetflowSettings, type NetflowSettings } from "@/lib/deviceTraffic";

function vendorHint(vendor: string, isFa: boolean) {
  const name = vendor.toLowerCase();
  if (name.includes("mikro")) return isFa ? "در Traffic Flow، مقصد را IP مستقیم سرور و پورت را 2055 بگذارید؛ نسخهٔ 5 یا 9." : "In Traffic Flow, export version 5 or 9 to the server IP on port 2055.";
  if (name.includes("forti")) return isFa ? "در NetFlow تجهیز، collector و اینترفیس‌ها را تنظیم کنید؛ نسخهٔ 9 پذیرفته می‌شود." : "Configure a NetFlow collector and interfaces; version 9 is accepted.";
  if (name.includes("cisco")) return isFa ? "Flow exporter و monitor را روی اینترفیس‌های موردنظر فعال کنید؛ قالب باید IP و شمارندهٔ بایت داشته باشد." : "Enable a flow exporter and monitor on the intended interfaces; include IPv4 and byte fields.";
  if (name.includes("esxi")) return isFa ? "نرخ اینترفیس ESXi بدون NetFlow نمایش داده می‌شود. این گیرنده فعلاً IPFIX را نمی‌پذیرد." : "ESXi interface rates need no NetFlow. This receiver does not yet accept IPFIX.";
  if (name.includes("linux")) return isFa ? "برای حجم هر IP/پورت به صادرکنندهٔ NetFlow 5 یا 9 روی سرور نیاز است؛ نرخ اینترفیس جداگانه جمع‌آوری می‌شود." : "An external NetFlow 5/9 exporter is needed for per-IP/port volume; interface rates are collected separately.";
  return isFa ? "اگر تجهیز خروجی NetFlow 5 یا 9 دارد، آن را به IP مستقیم سرور روی UDP/2055 بفرستید." : "If the device supports NetFlow 5 or 9, export to the server IP on UDP/2055.";
}

export function DeviceNetflowSetup({ deviceId, host, vendor, isFa }: { deviceId: string; host: string; vendor: string; isFa: boolean }) {
  const [settings, setSettings] = useState<NetflowSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [exporterIp, setExporterIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setSettings(null);
    setMessage("");
    void getNetflowSettings(deviceId).then((result) => {
      if (active) { setSettings(result); setEnabled(result.enabled); setExporterIp(result.exporterIp ?? (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) ? host : "")); }
    }).catch(() => { if (active) setMessage(isFa ? "وضعیت گیرنده دریافت نشد." : "Receiver status unavailable."); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void getNetflowSettings(deviceId).then((result) => { if (active) setSettings(result); }).catch(() => undefined);
    }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [deviceId, host, isFa]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveNetflowSettings(deviceId, enabled, exporterIp.trim());
      const result = await getNetflowSettings(deviceId);
      setSettings(result);
      setMessage(isFa ? "تنظیم ذخیره شد." : "Saved.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "ADMIN_REQUIRED" ? isFa ? "فقط مدیر می‌تواند دریافت را تنظیم کند." : "Only an admin can configure collection."
        : code === "EXPORTER_IP_ALREADY_ASSIGNED" ? isFa ? "این IP به تجهیز دیگری اختصاص دارد." : "This IP belongs to another device."
        : isFa ? "ذخیره نشد؛ IP مبدأ صادرکننده را بررسی کنید." : "Save failed; check the exporter source IP.");
    } finally { setSaving(false); }
  };

  const last = settings?.lastSeenAt ? new Date(settings.lastSeenAt).getTime() : 0;
  const fresh = Boolean(settings?.enabled && settings.receiver.listening && last && Date.now() - last < 10 * 60_000);
  const status = !settings ? isFa ? "در حال بررسی" : "Checking"
    : !settings.enabled ? isFa ? "خاموش" : "Off"
    : !settings.receiver.listening ? isFa ? "گیرنده غیرفعال" : "Receiver offline"
    : fresh ? isFa ? "داده می‌رسد" : "Receiving"
    : last ? isFa ? "داده متوقف شده" : "No recent flow"
    : settings.packets.accepted ? isFa ? "بسته رسید؛ حجم هنوز نه" : "Packets seen; no volume yet"
    : isFa ? "منتظر داده" : "Waiting";
  const suggestedIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ? host : "";
  const dirty = settings && (enabled !== settings.enabled || exporterIp.trim() !== (settings.exporterIp ?? suggestedIp));
  return <details className="device-netflow-setup">
    <summary><span>{isFa ? "تنظیم دریافت جریان" : "Flow collection setup"}</span><em className={fresh ? "is-live" : ""}>{status}</em></summary>
    <div className="device-netflow-setup__body">
      <div className="device-netflow-setup__fields">
        <label className="device-netflow-setup__switch"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{isFa ? "فعال برای این تجهیز" : "Enable for this device"}</label>
        <label className="device-netflow-setup__ip">{isFa ? "IP مبدأ صادرکننده" : "Exporter source IP"}<input dir="ltr" inputMode="decimal" autoComplete="off" value={exporterIp} onChange={(event) => setExporterIp(event.target.value)} placeholder="192.0.2.10" /></label>
        <button type="button" onClick={() => void save()} disabled={saving || !dirty || !exporterIp.trim()}>{saving ? isFa ? "در حال ذخیره…" : "Saving…" : isFa ? "ذخیره" : "Save"}</button>
      </div>
      {message ? <p className="device-netflow-setup__message" role="status">{message}</p> : null}
      {settings?.lastSeenAt ? <p className="device-netflow-setup__meta">{isFa ? "آخرین جریان:" : "Last flow:"} {new Date(settings.lastSeenAt).toLocaleString(isFa ? "fa-IR" : "en-US")} · {settings.lastFormat?.replace("netflow-", "NetFlow ")}</p> : null}
      {settings?.enabled && settings.packets.accepted > 0 && !settings.lastSeenAt ? <p className="device-netflow-setup__warning">{isFa ? "بسته رسیده، اما حجم قابل‌خواندن نیست؛ قالب IPv4 و شمارندهٔ بایت را در خروجی تجهیز بررسی کنید." : "Packets arrived but no readable volume; check IPv4 and byte fields in the exporter template."}</p> : null}
      {settings?.packets.dropped ? <p className="device-netflow-setup__warning">{isFa ? "بسته‌های ردشده:" : "Rejected packets:"} {settings.packets.dropped}</p> : null}
      {settings?.receiver.hostBind === "127.0.0.1" && enabled ? <p className="device-netflow-setup__warning">{isFa ? "گیرنده فعلاً فقط از داخل سرور در دسترس است؛ برای تجهیز راه‌دور NETFLOW_BIND_IP و فایروال UDP/2055 را تنظیم کنید." : "Receiver is localhost-only; configure NETFLOW_BIND_IP and restrict UDP/2055 for remote export."}</p> : null}
      <details className="device-netflow-setup__help"><summary>{isFa ? "راهنمای اتصال " + vendor : vendor + " setup guide"}</summary>
        <p>{vendorHint(vendor, isFa)}</p>
        <p>{isFa ? "IP مبدأ باید همان نشانی باشد که بستهٔ UDP با آن به سرور می‌رسد (ممکن است پشت NAT فرق کند). دسترسی UDP/2055 را فقط برای همین IP باز کنید." : "Use the IPv4 address seen by the server, which may differ behind NAT. Restrict UDP/2055 to that source."}</p>
      </details>
    </div>
  </details>;
}
