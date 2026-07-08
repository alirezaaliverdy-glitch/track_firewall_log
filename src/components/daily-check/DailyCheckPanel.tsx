import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, ShieldCheck } from "lucide-react";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction } from "@/lib/commandCatalog";
import { getDailyCheckProfile, type VendorDailyCheckProfile } from "@/lib/dailyCheck";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";

function vendorOf(device?: Device) {
  if (!device) return "";
  if (device.type === "linux_edge") return "linux";
  return String(device.vendor || device.type || "").toLowerCase().replace(/[_-]/g, "");
}

function supportLabel(profile: VendorDailyCheckProfile | null) {
  if (!profile) return "نامشخص";
  if (profile.implementationState === "implemented") return "اجرای واقعی";
  if (profile.implementationState === "manualOnly") return "چک‌لیست دستی";
  return "در حال توسعه";
}

function commandIdForVendor(vendor: string) {
  if (vendor === "linux") return "linux.daily-check";
  if (vendor === "mikrotik") return "mikrotik.daily-check";
  if (vendor === "fortigate") return "fortigate.daily-check";
  return "";
}

function openActionCenter(actionPlanId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("selected", actionPlanId);
  url.hash = "action-center";
  window.history.pushState({}, "", url);
  publishActionPlanCreated(actionPlanId);
  window.setTimeout(reviewInActionCenter, 50);
}

export default function DailyCheckPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [profile, setProfile] = useState<VendorDailyCheckProfile | null>(null);
  const [detectedVendor, setDetectedVendor] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId), [devices, deviceId]);

  useEffect(() => {
    void listDevices().then((items) => {
      setDevices(items);
      if (items[0]) setDeviceId(items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!deviceId) {
      setProfile(null);
      setDetectedVendor("");
      return;
    }

    setMessage(null);
    void getDailyCheckProfile(deviceId)
      .then((result) => {
        setDetectedVendor(result.detectedVendor);
        setProfile(result.profile);
      })
      .catch((error: unknown) => {
        setProfile(null);
        setDetectedVendor("");
        setMessage(error instanceof Error ? error.message : "دریافت پروفایل چک روزانه انجام نشد.");
      });
  }, [deviceId]);

  async function createPlan() {
    if (!selectedDevice || !profile) return;
    const commandId = commandIdForVendor(profile.vendor || vendorOf(selectedDevice));
    if (!commandId) {
      setMessage("برای این وندور فعلاً ActionPlan اجرایی آماده نشده است.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const plan = await createCatalogAction(commandId, selectedDevice.id, {});
      openActionCenter(plan.id);
      setMessage("برنامه چک روزانه ساخته شد. برای تأیید و اجرا به مرکز عملیات بروید.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت برنامه چک روزانه ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-cyan-900/50 bg-slate-950/75 p-5 text-right" dir="rtl">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-cyan-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-100">چک روزانه</h2>
          <p className="text-sm text-slate-400">چک روزانه بر اساس وندور دستگاه انتخابی و از مسیر ActionPlan کنترل‌شده اجرا می‌شود.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm text-slate-300">
          انتخاب دستگاه
          <select
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} - {vendorOf(device)}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2 text-slate-200">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>وضعیت پشتیبانی</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">وندور: {detectedVendor || "—"}</p>
          <p className="mt-1 text-sm text-slate-300">حالت: {supportLabel(profile)}</p>
          <p className="mt-1 text-xs text-slate-500">کانکتور: {profile?.requiredConnector ?? "بدون کانکتور"}</p>
        </div>

        <button
          disabled={!profile || profile.implementationState !== "implemented" || busy}
          onClick={() => void createPlan()}
          className="self-end rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "در حال آماده‌سازی..." : "اجرای چک روزانه"}
        </button>
      </div>

      {profile && (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profile.sections.map((section) => (
            <article key={section.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">{section.titleFa}</h3>
              <p className="mt-2 text-xs text-slate-500">
                {section.parserRules.length > 0 ? section.parserRules.join("، ") : "چک‌لیست دستی"}
              </p>
              {section.suggestedActions.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-300">
                  {section.suggestedActions.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-start gap-1">
                      <ArrowUpRight className="mt-0.5 h-3 w-3 text-cyan-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
    </section>
  );
}
