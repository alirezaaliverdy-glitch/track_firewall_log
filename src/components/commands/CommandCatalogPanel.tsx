import { useEffect, useMemo, useState } from "react";
import { Bot, Search, ShieldCheck } from "lucide-react";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction, proposeWithAi, searchCommands, type CatalogItem } from "@/lib/commandCatalog";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";

const VENDORS = ["linux", "mikrotik", "fortigate", "cisco", "pfsense", "generic"];

function vendorOf(device?: Device) {
  if (!device) return "";
  if (device.type === "linux_edge") return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type ?? "";
}

function requiredParamsComplete(item: CatalogItem, values: Record<string, string>) {
  return item.requiredParams.every((field) => String(values[field.key] ?? item.defaultParams[field.key] ?? "").trim());
}

function goToActionCenter(actionPlanId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("selected", actionPlanId);
  url.hash = "action-center";
  window.history.pushState({}, "", url);
  publishActionPlanCreated(actionPlanId);
  window.setTimeout(reviewInActionCenter, 50);
}

export default function CommandCatalogPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [executable, setExecutable] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [params, setParams] = useState<Record<string, Record<string, string>>>({});
  const [message, setMessage] = useState("");
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId), [devices, deviceId]);

  useEffect(() => {
    void listDevices()
      .then(setDevices)
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "دریافت دستگاه‌ها انجام نشد."));
  }, []);

  useEffect(() => {
    if (selectedDevice) setVendor(vendorOf(selectedDevice));
  }, [selectedDevice]);

  useEffect(() => {
    setLoading(true);
    const handle = window.setTimeout(() => {
      void searchCommands({
        q: query,
        deviceId,
        vendor: deviceId ? "" : vendor,
        category,
        riskLevel,
        readOnly: readOnly ? "true" : "",
        executable: executable ? "true" : "",
      })
        .then((result) => setItems(result.items))
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "جست‌وجوی دستورها انجام نشد."))
        .finally(() => setLoading(false));
    }, 180);

    return () => window.clearTimeout(handle);
  }, [query, deviceId, vendor, category, riskLevel, readOnly, executable]);

  const categories = [...new Set(items.map((item) => item.category))];

  async function create(item: CatalogItem) {
    if (!deviceId) {
      setMessage("ابتدا دستگاه هدف را انتخاب کنید.");
      return;
    }

    if (!requiredParamsComplete(item, params[item.id] ?? {})) {
      setMessage("اطلاعات الزامی این دستور را کامل کنید.");
      return;
    }

    try {
      const plan = await createCatalogAction(item.id, deviceId, params[item.id] ?? {});
      if (item.implementationState === "manualOnly") {
        setMessage("برنامه بررسی دستی ساخته شد.");
      } else {
        setMessage("برنامه اجرای قابل بازبینی ساخته شد.");
      }
      const url = new URL(window.location.href);
      url.searchParams.set("selected", plan.id);
      url.hash = "action-center";
      window.history.pushState({}, "", url);
      publishActionPlanCreated(plan.id);
      window.setTimeout(reviewInActionCenter, 50);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت برنامه ناموفق بود.");
    }
  }

  async function askAi() {
    if (!aiText.trim()) return;
    try {
      const result = await proposeWithAi(aiText, vendor || "generic", deviceId || undefined);
      if (result.mode === "executable_action_plan") {
        setMessage(result.messageFa);
        goToActionCenter(result.actionPlanId);
        return;
      }
      if (result.mode === "needs_input") {
        setMessage(result.messageFa);
        return;
      }
      if (result.actionPlanId) goToActionCenter(result.actionPlanId);
      setMessage(result.messageFa ?? "پیشنهاد غیرخودکار برای بررسی ساخته شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت پیشنهاد هوش مصنوعی ناموفق بود.");
    }
  }

  return (
    <section dir="rtl" className="mb-5 rounded-2xl border border-cyan-900/60 bg-slate-950/80 p-5 text-right text-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="text-cyan-400" />
        <div>
          <h2 className="text-xl font-bold">دستورات آماده</h2>
          <p className="text-sm text-slate-400">مسیر اصلی محصول: انتخاب دستگاه، ساخت ActionPlan، بازبینی و اجرای کنترل‌شده.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2"
        >
          <option value="">انتخاب دستگاه</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی دستور فارسی"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-2 pr-8"
          />
        </div>

        <select
          value={vendor}
          disabled={Boolean(deviceId)}
          onChange={(event) => setVendor(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2 disabled:opacity-60"
        >
          <option value="">همه وندورها</option>
          {VENDORS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          value={riskLevel}
          onChange={(event) => setRiskLevel(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2"
        >
          <option value="">همه ریسک‌ها</option>
          <option value="low">کم</option>
          <option value="medium">متوسط</option>
          <option value="high">زیاد</option>
          <option value="critical">بحرانی</option>
        </select>
      </div>

      <div className="my-3 flex flex-wrap gap-4 text-sm">
        <label>
          <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /> فقط خواندنی
        </label>
        <label>
          <input type="checkbox" checked={executable} onChange={(event) => setExecutable(event.target.checked)} /> فقط قابل اجرا
        </label>
        {categories.length > 0 && (
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="bg-slate-900">
            <option value="">همه دسته‌ها</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </div>

      {message && <p className="mb-3 rounded-lg bg-cyan-950/50 p-3 text-sm text-cyan-200">{message}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const values = params[item.id] ?? {};
          const ready = requiredParamsComplete(item, values);

          return (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-bold">{item.titleFa}</h3>
                <span className={`text-xs ${item.implementationState === "implemented" ? "text-emerald-400" : "text-amber-400"}`}>
                  {item.uiHints.badgeFa}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-400">{item.descriptionFa}</p>

              {item.requiredParams.map((field) => (
                <label key={field.key} className="mt-2 block text-xs text-slate-300">
                  {field.labelFa}
                  <input
                    placeholder={field.placeholderFa}
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setParams((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"
                  />
                  <span className="mt-1 block text-slate-500">{field.helpFa}</span>
                </label>
              ))}

              <button onClick={() => void create(item)} className="mt-3 rounded-lg bg-cyan-700 px-3 py-2 text-sm hover:bg-cyan-600">
                {item.implementationState === "manualOnly" ? "ساخت برنامه بررسی دستی" : ready ? "ساخت برنامه اجرا" : "تکمیل اطلاعات"}
              </button>
            </article>
          );
        })}
      </div>

      {!loading && items.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-700 p-4">
          <p>دستور مستقیمی پیدا نشد. می‌توانید از AI برای ساخت برنامه قابل اجرا یا پیشنهاد دستی استفاده کنید.</p>
          <div className="mt-2 flex gap-2">
            <input
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 p-2"
              placeholder="درخواست عملیاتی شما"
            />
            <button onClick={() => void askAi()} className="flex items-center gap-1 rounded bg-violet-700 px-3">
              <Bot className="h-4 w-4" />
              پرسش از AI
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
