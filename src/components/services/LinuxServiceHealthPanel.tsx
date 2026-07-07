import { useEffect, useMemo, useState } from "react";
import { ActivitySquare, Search } from "lucide-react";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction } from "@/lib/commandCatalog";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";

const QUICK_SERVICES = ["nginx", "ssh", "docker", "fail2ban", "apache", "postgres", "mysql", "redis"];

function isLinux(device: Device) {
  return device.type === "linux_edge" || String(device.vendor).toLowerCase().includes("linux");
}

function goToActionCenter(actionPlanId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("selected", actionPlanId);
  url.hash = "action-center";
  window.history.pushState({}, "", url);
  publishActionPlanCreated(actionPlanId);
  window.setTimeout(reviewInActionCenter, 50);
}

export default function LinuxServiceHealthPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [serviceName, setServiceName] = useState("nginx");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const linuxDevices = useMemo(() => devices.filter(isLinux), [devices]);

  useEffect(() => {
    void listDevices().then((items) => {
      setDevices(items);
      const firstLinux = items.find(isLinux);
      if (firstLinux) setDeviceId(firstLinux.id);
    });
  }, []);

  async function createPlan(commandId: string, params: Record<string, unknown> = {}) {
    if (!deviceId) {
      setMessage("ابتدا یک دستگاه لینوکسی انتخاب کنید.");
      return;
    }

    setBusy(commandId);
    setMessage(null);
    try {
      const plan = await createCatalogAction(commandId, deviceId, params);
      goToActionCenter(plan.id);
      setMessage("برنامه بررسی سرویس ساخته شد. برای تأیید و اجرا به مرکز عملیات بروید.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت برنامه بررسی سرویس ناموفق بود.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-emerald-900/40 bg-slate-950/75 p-5 text-right" dir="rtl">
      <div className="mb-4 flex items-center gap-2">
        <ActivitySquare className="h-5 w-5 text-emerald-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-100">سرویس‌های لینوکس</h2>
          <p className="text-sm text-slate-400">بررسی سرویس‌ها از مسیر ActionPlan کنترل‌شده انجام می‌شود و اجرای خام ندارد.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="text-sm text-slate-300">
          دستگاه لینوکسی
          <select
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            <option value="">انتخاب دستگاه</option>
            {linuxDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() => void createPlan("linux.services-running")}
          disabled={!deviceId || busy !== null}
          className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "linux.services-running" ? "در حال ساخت..." : "نمایش سرویس‌های فعال"}
        </button>

        <button
          onClick={() => void createPlan("linux.services-failed")}
          disabled={!deviceId || busy !== null}
          className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "linux.services-failed" ? "در حال ساخت..." : "نمایش سرویس‌های خطادار"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <label className="block text-sm text-slate-300">
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500" />
            جست‌وجوی سرویس
          </span>
          <input
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
            placeholder="nginx"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_SERVICES.map((service) => (
            <button
              key={service}
              type="button"
              onClick={() => setServiceName(service)}
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
            >
              {service}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => void createPlan("linux.service-status", { serviceName })}
            disabled={!deviceId || !serviceName.trim() || busy !== null}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            بررسی وضعیت
          </button>
          <button
            onClick={() => void createPlan("linux.services-important")}
            disabled={!deviceId || busy !== null}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            بررسی سرویس‌های مهم
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-xs text-slate-400 md:grid-cols-2 xl:grid-cols-4">
          {QUICK_SERVICES.map((service) => (
            <div key={service} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="font-semibold text-slate-200">{service}</p>
              <p className="mt-1">وضعیت: از طریق ActionPlan بررسی می‌شود</p>
              <p className="mt-1">اقدام سریع: بررسی وضعیت</p>
            </div>
          ))}
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-200">{message}</p>}
    </section>
  );
}
