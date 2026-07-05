import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink } from "lucide-react";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction, searchCommands, type CatalogItem } from "@/lib/commandCatalog";

const vendorOf = (device?: Device) => device?.type === "linux_edge" ? "linux" : String(device?.vendor || device?.type || "").toLowerCase().replace(/[_-]/g, "");

export default function DailyCheckPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [commands, setCommands] = useState<CatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const device = useMemo(() => devices.find((item) => item.id === deviceId), [devices, deviceId]);
  const command = commands.find((item) => item.vendor === vendorOf(device));

  useEffect(() => { void listDevices().then((items) => { setDevices(items); if (items[0]) setDeviceId(items[0].id); }); }, []);
  useEffect(() => { void searchCommands({ q: "چک روزانه" }).then((result) => setCommands(result.items)); }, []);

  const createPlan = async () => {
    if (!device || !command) return;
    setBusy(true); setMessage(null);
    try {
      const plan = await createCatalogAction(command.id, device.id, {});
      const url = `/?selected=${encodeURIComponent(plan.id)}#action-center`;
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new CustomEvent("action-plan-created", { detail: { actionPlanId: plan.id } }));
      document.querySelector("#action-center")?.scrollIntoView({ behavior: "smooth" });
      setMessage("برنامه چک روزانه آماده است؛ در مرکز عملیات آن را تأیید و اجرا کنید.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ساخت چک روزانه ناموفق بود."); }
    finally { setBusy(false); }
  };

  return <section className="mb-4 rounded-2xl border border-cyan-900/50 bg-slate-950/75 p-5 text-right" dir="rtl">
    <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-400"/><h2 className="text-lg font-semibold text-slate-100">چک روزانه</h2></div>
    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <label className="text-sm text-slate-300">انتخاب دستگاه
        <select className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
          {devices.map((item) => <option key={item.id} value={item.id}>{item.name} — {vendorOf(item)}</option>)}
        </select>
      </label>
      <button disabled={!command || command.implementationState !== "implemented" || busy} onClick={() => void createPlan()} className="self-end rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "در حال آماده‌سازی…" : "اجرای چک روزانه"}</button>
    </div>
    <p className="mt-3 text-xs text-slate-400">وندور تشخیص‌داده‌شده: {vendorOf(device) || "—"} · وضعیت: {command?.implementationState === "implemented" ? "قابل اجرا با کانکتور" : "دستی/در حال توسعه"}</p>
    {message && <p className="mt-3 flex items-center gap-1 text-sm text-cyan-200"><ExternalLink className="h-4 w-4"/>{message}</p>}
  </section>;
}
