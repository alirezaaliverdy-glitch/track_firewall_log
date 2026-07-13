import { useEffect, useMemo, useState } from "react";
import { Bot, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listDevices, type Device } from "@/lib/devices";
import { createCatalogAction, proposeWithAi, searchCommands, type CatalogItem } from "@/lib/commandCatalog";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";
import GuidedActionWizard from "@/components/guided-actions/GuidedActionWizard";
import { startGuidedSession } from "@/lib/guidedActions";

const VENDORS = ["fortigate", "mikrotik", "linux", "cisco", "pfsense", "generic"];

function vendorOf(device?: Device) {
  if (!device) return "";
  if (device.type === "linux_edge") return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type ?? "";
}

function connectorTypeOf(vendor: string) {
  if (vendor === "fortigate") return "fortigate-ssh";
  if (vendor === "mikrotik") return "mikrotik-ssh";
  if (vendor === "linux") return "linux-ssh";
  return null;
}

function requiredParamsComplete(item: CatalogItem, values: Record<string, string>) {
  return item.requiredParams.every((field) => String(values[field.key] ?? item.defaultParams[field.key] ?? "").trim());
}

function isParameterized(item: CatalogItem) {
  return item.requiredParams.length > 0 || item.optionalParams.length > 0;
}

function catalogBlueprintId(item: CatalogItem) {
  return `catalog:${item.id}`;
}

function goToActionCenter(actionPlanId: string) {
  publishActionPlanCreated(actionPlanId);
  reviewInActionCenter(actionPlanId);
}

export default function CommandCatalogPanel() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [executable, setExecutable] = useState(false);
  const [supportState, setSupportState] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState("");
  const [aiText, setAiText] = useState("");
  const [guidedWorkflow, setGuidedWorkflow] = useState<null | { blueprintId: string; initialValues: Record<string, unknown>; initialRequest: string; vendor: string | null; deviceId: string | null }>(null);
  const [loading, setLoading] = useState(false);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId), [devices, deviceId]);

  useEffect(() => {
    void listDevices()
      .then((next) => {
        setDevices(next);
        const params = new URLSearchParams(window.location.search);
        const selected = params.get("deviceId") ?? params.get("selectedDeviceId");
        if (selected && next.some((device) => device.id === selected)) setDeviceId(selected);
      })
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
        .then((result) => setItems(supportState ? result.items.filter((item) => item.supportState === supportState) : result.items))
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "جست‌وجوی دستورها انجام نشد."))
        .finally(() => setLoading(false));
    }, 180);

    return () => window.clearTimeout(handle);
  }, [query, deviceId, vendor, category, riskLevel, readOnly, executable, supportState]);

  const categories = [...new Set(items.map((item) => item.category))];

  function setGuidedUrlState(item: CatalogItem) {
    const url = new URL(window.location.href);
    url.searchParams.set("guidedBlueprintId", catalogBlueprintId(item));
    url.searchParams.set("catalogActionId", item.id);
    url.searchParams.set("vendor", item.vendor);
    if (deviceId) url.searchParams.set("deviceId", deviceId);
    window.history.pushState({}, "", url);
  }

  function closeGuidedFlow() {
    setGuidedWorkflow(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("guidedBlueprintId");
    url.searchParams.delete("catalogActionId");
    window.history.pushState({}, "", url);
  }

  function openCatalogGuidedFlow(item: CatalogItem) {
    setGuidedUrlState(item);
    setGuidedWorkflow({
      blueprintId: catalogBlueprintId(item),
      initialValues: {},
      initialRequest: item.titleEn || item.titleFa,
      vendor: item.vendor,
      deviceId: deviceId || null,
    });
  }

  async function create(item: CatalogItem) {
    if (isParameterized(item)) {
      openCatalogGuidedFlow(item);
      return;
    }
    if (!deviceId) {
      setMessage("ابتدا دستگاه هدف را انتخاب کنید.");
      return;
    }

    if (!requiredParamsComplete(item, {})) {
      setMessage("اطلاعات الزامی این دستور را کامل کنید.");
      return;
    }

    try {
      const plan = await createCatalogAction(item.id, deviceId, {});
	      if (item.supportState === "manual_only" || item.supportState === "preview_only") {
	        setMessage(t("common.message.manualCreated"));
	      } else {
	        setMessage(t("common.message.planCreated"));
	      }
      publishActionPlanCreated(plan.id);
      reviewInActionCenter(plan.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت برنامه ناموفق بود.");
    }
  }

  async function askAi() {
    if (!aiText.trim()) return;
    try {
      const selectedVendor = selectedDevice ? vendorOf(selectedDevice) : vendor || "generic";
      const result = await proposeWithAi({
        requestText: aiText,
        vendor: selectedVendor,
        selectedVendor,
        currentVendor: selectedVendor,
        selectedConnectorType: connectorTypeOf(selectedVendor),
        selectedDeviceName: selectedDevice?.name,
        deviceId: deviceId || undefined,
        searchFilters: { q: query, category, riskLevel, readOnly, executable },
      });
      if (result.mode === "executable_action_plan") {
        setMessage(result.messageFa);
        goToActionCenter(result.actionPlanId);
        return;
      }
      if (result.mode === "guided_workflow") {
        setMessage(result.messageFa);
        const start = await startGuidedSession({
          blueprintId: result.blueprintId,
          initialValues: result.initialValues,
          initialRequest: aiText,
          vendor: result.vendor ?? selectedVendor ?? null,
          deviceId: result.deviceId ?? (deviceId || null),
        });
        window.location.assign(`/guided-actions/${encodeURIComponent(start.sessionId)}`);
        return;
      }
      if (result.mode === "clarification") {
        setMessage(`${result.questionFa} ${result.options.map((option) => option.labelFa).join(" / ")}`);
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
    <section className="mb-5 rounded-lg border border-cyan-900/60 bg-slate-950/80 p-5 text-slate-100" data-testid="action-library">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="text-cyan-400" />
        <div>
          <h2 className="text-xl font-bold">{t("actionLibrary.title")}</h2>
          <p className="text-sm text-slate-400">{t("actionLibrary.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2"
        >
          <option value="">{t("actionLibrary.selectDevice")}</option>
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
            placeholder={t("actionLibrary.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-2 pr-8"
          />
        </div>

        <select
          value={vendor}
          disabled={Boolean(deviceId)}
          onChange={(event) => setVendor(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-2 disabled:opacity-60"
        >
          <option value="">{t("actionLibrary.allVendors")}</option>
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
          <option value="">{t("actionLibrary.allRisks")}</option>
          <option value="low">{t("risk.low")}</option>
          <option value="medium">{t("risk.medium")}</option>
          <option value="high">{t("risk.high")}</option>
          <option value="critical">{t("risk.critical")}</option>
        </select>
      </div>

      <div className="my-3 flex flex-wrap gap-4 text-sm">
        <label>
          <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /> {t("actionLibrary.readOnly")}
        </label>
	        <label>
	          <input type="checkbox" checked={executable} onChange={(event) => setExecutable(event.target.checked)} /> {t("actionLibrary.verifiedOnly")}
	        </label>
	        <select value={supportState} onChange={(event) => setSupportState(event.target.value)} className="bg-slate-900" aria-label={t("actionLibrary.supportState")}>
	          <option value="">{t("actionLibrary.allSupportStates")}</option>
	          <option value="verified">{t("support.verified")}</option>
	          <option value="preview_only">{t("support.preview_only")}</option>
	          <option value="manual_only">{t("support.manual_only")}</option>
	          <option value="unsupported">{t("support.unsupported")}</option>
	        </select>
        {categories.length > 0 && (
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="bg-slate-900">
            <option value="">{t("actionLibrary.allCategories")}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </div>

      {message && <p className="mb-3 rounded-lg bg-cyan-950/50 p-3 text-sm text-cyan-200">{message}</p>}

      {guidedWorkflow && (
        <GuidedActionWizard
          blueprintId={guidedWorkflow.blueprintId}
          deviceId={guidedWorkflow.deviceId ?? undefined}
          vendor={guidedWorkflow.vendor ?? undefined}
          initialRequest={guidedWorkflow.initialRequest}
          initialValues={guidedWorkflow.initialValues}
          onClose={closeGuidedFlow}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	        {items.map((item) => {
	          const parameterized = isParameterized(item);

          return (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-bold">{item.titleFa}</h3>
	                <span className={`text-xs ${item.supportState === "verified" ? "text-emerald-400" : "text-amber-400"}`}>
                  {item.uiHints.badgeFa}
                </span>
	              </div>
	              <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-500">
	                <span>{item.vendor}</span>
	                <span>{item.category}</span>
	                <span>{item.riskLevel}</span>
	                <span>{item.supportState}</span>
	              </div>

	              <p className="mt-2 text-sm text-slate-400">{item.descriptionFa}</p>
	              {item.supportState !== "verified" && <p className="mt-2 text-xs text-amber-300">{item.supportReason || t("actionLibrary.executionUnavailable")}</p>}

	              {parameterized && <p className="mt-2 text-xs text-cyan-200">{t("actionLibrary.parameterized")}</p>}

	              <div className="mt-3 flex flex-wrap gap-2">
	                <button onClick={() => void create(item)} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm hover:bg-cyan-600">
	                  {parameterized ? t("actionLibrary.configure") : item.supportState === "manual_only" || item.supportState === "preview_only" ? t("actionLibrary.createManual") : t("actionLibrary.createVerified")}
	                </button>
	              </div>
            </article>
          );
        })}
      </div>

      {!loading && items.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-700 p-4">
          <p>{t("actionLibrary.noResults")}</p>
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
