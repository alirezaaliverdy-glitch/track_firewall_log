import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { answerGuidedSession, buildGuidedPlan, cancelGuidedSession, getGuidedSession, startGuidedSession, type GuidedSession } from "@/lib/guidedActions";
import type { GuidedActionField } from "@/lib/commandCatalog";
import { publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { listDevices, type Device } from "@/lib/devices";

function valueToString(value: unknown) {
  if (Array.isArray(value)) return value.join(",");
  return value === undefined || value === null ? "" : String(value);
}

function parseValue(field: GuidedActionField, raw: string, checked: boolean) {
  if (field.type === "checkbox") return checked;
  if (field.type === "number") return raw === "" ? "" : Number(raw);
  if (field.type === "multiSelect" || field.type === "cidrList" || field.type === "ipList") return raw.split(",").map((item) => item.trim()).filter(Boolean);
  return raw;
}

function activeFields(fields: GuidedActionField[], values: Record<string, unknown>) {
  return fields.filter((field) => !field.dependsOn || Object.entries(field.dependsOn).every(([key, value]) => values[key] === value));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function fortigateInterfaceOptions(device: Device | undefined) {
  const capabilities = object(device?.capabilities);
  const fortigateStatus = object(capabilities.fortigateStatus);
  const statusDiscovery = object(fortigateStatus.fortigate);
  const directDiscovery = object(capabilities.fortigate);
  return Array.from(new Set([
    ...arrayOfStrings(statusDiscovery.interfaces),
    ...arrayOfStrings(directDiscovery.interfaces),
  ])).sort((a, b) => a.localeCompare(b));
}

function isPreviewOnly(session: GuidedSession | null) {
  const params = object(session?.actionPlan?.parametersJson);
  const metadata = object(params.metadata);
  return params.executable === false || metadata.executable === false || params.executionSupport === "planned_or_partial" || metadata.executionSupport === "planned_or_partial";
}

function goToActionCenter(actionPlanId: string) {
  const url = new URL(window.location.href);
  url.pathname = "/actions";
  url.search = "";
  url.searchParams.set("selected", actionPlanId);
  url.hash = "action-center";
  window.history.pushState({}, "", url);
  publishActionPlanCreated(actionPlanId);
  window.setTimeout(reviewInActionCenter, 50);
}

export default function GuidedActionWizard(props: {
  sessionId?: string;
  blueprintId?: string;
  deviceId?: string;
  vendor?: string;
  initialRequest?: string;
  initialValues?: Record<string, unknown>;
  onClose: () => void;
}) {
  const [session, setSession] = useState<GuidedSession | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(props.initialValues ?? {});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    void listDevices().then(setDevices).catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    setBusy(true);
    const load = props.sessionId
      ? getGuidedSession(props.sessionId)
      : props.blueprintId
        ? startGuidedSession({
          blueprintId: props.blueprintId,
          deviceId: props.deviceId ?? null,
          vendor: props.vendor ?? null,
          initialRequest: props.initialRequest ?? "",
          initialValues: props.initialValues ?? {},
        })
        : Promise.reject(new Error("اطلاعات شروع Workflow کامل نیست."));
    load
      .then((next) => {
        setSession(next);
        setValues(next.answers);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "شروع Workflow ناموفق بود."))
      .finally(() => setBusy(false));
  }, [props.sessionId, props.blueprintId, props.deviceId, props.vendor, props.initialRequest]);

  const currentStep = session?.currentStep ?? null;
  const stepValues = useMemo(() => ({ ...session?.answers, ...values }), [session?.answers, values]);
  const previewOnly = isPreviewOnly(session);
  const selectedDeviceId = session?.deviceId ?? props.deviceId ?? (typeof stepValues.deviceId === "string" ? stepValues.deviceId : null);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
  const interfaceOptions = useMemo(() => fortigateInterfaceOptions(selectedDevice), [selectedDevice]);

  async function saveStep() {
    if (!session || !currentStep) return;
    setBusy(true);
    try {
      const fields = activeFields(currentStep.fields, stepValues);
      const payload = Object.fromEntries(fields.map((field) => [field.key, stepValues[field.key]]));
      const next = await answerGuidedSession(session.sessionId, { stepId: currentStep.id, values: payload });
      setSession(next);
      setValues(next.answers);
      setMessage(next.status === "ready_to_build" ? "اطلاعات کامل است؛ پیش‌نمایش اکشن را بساز." : "مرحله ذخیره شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "اعتبارسنجی مرحله ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function buildPlan() {
    if (!session) return;
    setBusy(true);
    try {
      const next = await buildGuidedPlan(session.sessionId);
      setSession(next);
      if (next.actionPlanId) {
        setMessage(isPreviewOnly(next)
          ? "پیش‌نمایش ساختار اکشن ساخته شد، اما اجرای واقعی این سناریو هنوز کامل نشده است."
          : "پیش‌نمایش اکشن ساخته شد.");
        goToActionCenter(next.actionPlanId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ساخت پیش‌نمایش اکشن ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (session) await cancelGuidedSession(session.sessionId).catch(() => undefined);
    props.onClose();
  }

  return (
    <section dir="rtl" className="mb-5 rounded-xl border border-cyan-800 bg-slate-950 p-5 text-right text-slate-100">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-cyan-300">ساخت مرحله‌ای اکشن</p>
          <h2 className="text-lg font-bold">{session?.blueprint.titleFa ?? "Workflow"}</h2>
          <p className="mt-1 text-sm text-slate-400">{session?.blueprint.descriptionFa}</p>
          {session && (
            <p className="mt-2 text-xs text-slate-500">
              Vendor: {session.blueprint.vendor} | Device: {session.deviceId ?? props.deviceId ?? ""} | State: {session.blueprint.implementationState}
            </p>
          )}
        </div>
        <button onClick={() => void cancel()} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-900" title="لغو">
          <X className="h-4 w-4" />
        </button>
      </div>

      {message && <p className="mb-3 rounded-lg bg-cyan-950/50 p-3 text-sm text-cyan-200">{message}</p>}
      {busy && <p className="text-sm text-slate-400">در حال پردازش...</p>}

      {currentStep && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{currentStep.titleFa}</h3>
          {currentStep.descriptionFa && <p className="text-sm text-slate-400">{currentStep.descriptionFa}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {activeFields(currentStep.fields, stepValues).map((field) => {
              const raw = valueToString(stepValues[field.key]);
              return (
                <label key={field.key} className="block text-sm text-slate-200">
                  {field.labelFa}
                  {field.type === "deviceObjectSelect" ? (
                    <select
                      value={raw}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                    >
                      <option value="">انتخاب دستگاه</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name} - {device.type} - {device.host}:{device.managementPort}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "select" ? (
                    <select
                      value={raw}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                    >
                      <option value="">انتخاب کن</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.labelFa}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(stepValues[field.key])}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))}
                      className="mt-3 h-4 w-4"
                    />
                  ) : field.type === "interfaceSelect" ? (
                    <>
                      <input
                        list={interfaceOptions.length ? `fortigate-interfaces-${field.key}` : undefined}
                        type="text"
                        value={raw}
                        placeholder={field.placeholderFa}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                      />
                      {interfaceOptions.length ? (
                        <datalist id={`fortigate-interfaces-${field.key}`}>
                          {interfaceOptions.map((name) => <option key={name} value={name} />)}
                        </datalist>
                      ) : null}
                    </>
                  ) : (
                    <input
                      type={field.secret ? "password" : field.type === "number" ? "number" : "text"}
                      value={raw}
                      placeholder={field.placeholderFa}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: parseValue(field, event.target.value, event.target.checked) }))}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2"
                    />
                  )}
                  {field.options?.length ? <span className="mt-1 block text-xs text-slate-500">مقادیر مجاز: {field.options.map((option) => option.labelFa).join("، ")}</span> : null}
                  {field.helpFa && <span className="mt-1 block text-xs text-slate-500">{field.helpFa}</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {session?.status === "ready_to_build" && <p className="text-sm text-emerald-300">همه فیلدهای لازم جمع‌آوری شد.</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-sm opacity-50">
          <ArrowRight className="h-4 w-4" />
          مرحله قبل
        </button>
        <button onClick={() => void saveStep()} disabled={!currentStep || busy} className="inline-flex items-center gap-1 rounded bg-cyan-700 px-3 py-2 text-sm disabled:opacity-50">
          ذخیره و ادامه
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button onClick={() => void saveStep()} disabled={!currentStep || busy} className="rounded border border-cyan-700 px-3 py-2 text-sm disabled:opacity-50">
          مرحله بعد
        </button>
        <button onClick={() => void buildPlan()} disabled={!session || session.status !== "ready_to_build" || busy} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-3 py-2 text-sm disabled:opacity-50">
          <Check className="h-4 w-4" />
          ساخت پیش‌نمایش اکشن
        </button>
        <button onClick={() => session?.actionPlanId && goToActionCenter(session.actionPlanId)} disabled={!session?.actionPlanId} className="rounded border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">
          {previewOnly ? "مشاهده پیش‌نمایش" : "رفتن به Action Center"}
        </button>
        <button onClick={() => void cancel()} className="rounded border border-slate-700 px-3 py-2 text-sm">
          لغو
        </button>
      </div>
    </section>
  );
}
