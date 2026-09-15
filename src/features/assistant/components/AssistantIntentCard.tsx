import { useEffect, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import {
  completeAiActionRequest,
  normalizeArray,
  normalizeObject,
  type AiActionDebug,
  type AiActionIntent,
} from "@/lib/ai";
import { configureInActionCenter, publishActionPlanCreated, reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { listDevices, type Device } from "@/lib/devices";
import { normalizedVendor, riskClass } from "../assistantUiHelpers";

export function IntentCard({
  intent,
  debug,
  createdPlanId,
  onCompleted,
  isFa,
}: {
  intent: AiActionIntent | null;
  debug: AiActionDebug | null;
  createdPlanId: string | null;
  onCompleted: (input: { actionPlanId: string | null; intent: AiActionIntent | null; message: string }) => void;
  isFa: boolean;
}) {
  const [missingValues, setMissingValues] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const params = normalizeObject(intent?.parametersJson);
  const rawMissingFields = debug?.missingFields.length ? debug.missingFields : normalizeArray<unknown>(params.missingFields).map(String);
  const missingFields = rawMissingFields.filter((field) => field !== "deviceId");
  const needsDevice = !debug?.deviceId && !intent?.deviceId && !createdPlanId;
  const clarificationQuestions = normalizeArray<unknown>(params.clarificationQuestions).map(String);
  const canCreatePlan = Boolean(debug?.canCreateActionPlan);
  const riskLevel = intent?.riskLevel ?? "medium";
  const sshPortChange = intent?.intentType === "mikrotik_change_service_port" && params.service === "ssh";
  const intentType = String(intent?.intentType ?? debug?.intentType ?? "");
  const vendor = normalizedVendor(debug?.vendor ?? params.vendor ?? params.targetDeviceHint, intentType);
  const compatibleDevices = devices.filter((device) => {
    if (vendor === "mikrotik") return device.type === "mikrotik";
    if (vendor === "fortigate") return device.type === "fortigate";
    if (vendor === "linux_edge") return device.type === "linux_edge";
    if (intentType.startsWith("mikrotik_")) return device.type === "mikrotik";
    if (intentType.startsWith("fortigate_")) return device.type === "fortigate";
    if (intentType.startsWith("linux_")) return device.type === "linux_edge";
    return true;
  });
  const targetDevice = devices.find((device) => device.id === (intent?.deviceId ?? debug?.deviceId ?? selectedDeviceId));

  useEffect(() => {
    listDevices()
      .then((nextDevices) => setDevices(nextDevices))
      .catch(() => setDevices([]));
  }, [intent?.id]);

  useEffect(() => {
    if (selectedDeviceId || compatibleDevices.length !== 1) return;
    setSelectedDeviceId(compatibleDevices[0].id);
  }, [compatibleDevices, selectedDeviceId]);

  if (!intent && !debug) return null;

  const completeRequest = () => {
    if (!intent?.id) return;
    const fields: Record<string, unknown> = { ...params };
    if (selectedDeviceId) fields.deviceId = selectedDeviceId;
    for (const [key, value] of Object.entries(missingValues)) {
      if (value.trim()) fields[key] = value.trim();
    }
    if (needsDevice && !fields.deviceId) {
      setLocalMessage("Select a device first.");
      return;
    }
    const stillMissing = missingFields.filter((field) => !String(fields[field] ?? "").trim());
    if (stillMissing.length > 0) {
      setLocalMessage(`Fill missing fields: ${stillMissing.join(", ")}`);
      return;
    }
    setSubmitting(true);
    setLocalMessage(null);
    completeAiActionRequest(intent.id, fields)
      .then((result) => {
        onCompleted({
          actionPlanId: result.actionPlanId,
          intent: result.intent,
          message: result.actionPlanId ? "ActionPlan created. Review in Action Center." : result.blockedReason ?? "ActionPlan not created."
        });
        if (result.actionPlanId) {
          publishActionPlanCreated(result.actionPlanId);
        }
      })
      .catch((error: unknown) => setLocalMessage(error instanceof Error ? error.message : "Failed to complete action request."))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-start" dir={isFa ? "rtl" : "ltr"}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><TriangleAlert className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-amber-100">{createdPlanId ? (isFa ? "برنامه عملیات آماده است" : "ActionPlan is ready") : (isFa ? "درخواست عملیات بررسی شد" : "Action request reviewed")}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${riskClass(riskLevel)}`}>{isFa ? `ریسک ${riskLevel}` : `${riskLevel} risk`}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-400">{intent?.explanation || (isFa ? "درخواست برای ساخت یک برنامه قابل بازبینی تحلیل شد." : "The request was analyzed for a reviewable plan.")}</p>
        </div>
      </div>

      <details className="group mt-3 rounded-lg border border-white/5 bg-black/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 marker:hidden">
          <span>{isFa ? "جزئیات فنی برنامه" : "Technical plan details"}</span>
          <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-1 border-t border-white/5 p-3 text-[10px] leading-5 text-slate-500" dir="ltr">
          <p>intent: {debug?.intentType ?? intent?.intentType ?? "none"}</p>
          <p>vendor: {vendor ?? "not selected"}</p>
          <p>device: {debug?.deviceId ?? intent?.deviceId ?? "missing"}</p>
          <p>plan allowed: {String(canCreatePlan)}</p>
          {createdPlanId && <p>actionPlan: {createdPlanId}</p>}
          {sshPortChange && <p>target: {targetDevice?.name ?? intent?.deviceId ?? "select device"} · port: {String(params.newPort ?? "missing")}</p>}
          <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-[10px]">{JSON.stringify(params, null, 2)}</pre>
        </div>
      </details>
      {sshPortChange && (
        <p className="mt-2 rounded border border-red-900/70 bg-red-950/20 p-2 text-xs font-medium text-red-200">
          Lockout warning: the trusted-source firewall rule must be reviewed before the SSH service port changes.
        </p>
      )}
      {!canCreatePlan && (
        <p className="mt-2 rounded-lg bg-amber-400/5 p-2 text-[11px] leading-5 text-amber-200">{debug?.blockedReason ?? debug?.reason ?? (isFa ? "این عملیات هنوز قابل اجرا نیست." : "This operation is not executable yet.")}</p>
      )}
      {(needsDevice || missingFields.length > 0) && (
        <div className="mt-3 rounded-xl border border-amber-400/15 bg-black/15 p-3">
          <p className="text-xs font-bold text-amber-100">{isFa ? "اطلاعات لازم برای ادامه" : "Information required"}</p>
          <p className="mt-1 text-[11px] leading-5 text-amber-100/60">{isFa ? "موارد زیر را تکمیل کنید تا برنامه عملیات ساخته شود:" : "Complete these fields to create the ActionPlan:"} {[...(needsDevice ? [isFa ? "دستگاه" : "device"] : []), ...missingFields].join("، ")}</p>
          <div className="mt-2 grid gap-2">
            {needsDevice && (
              compatibleDevices.length === 0 ? (
                <p className="rounded-lg border border-red-400/15 bg-red-400/5 p-2 text-xs text-red-200">
                  {isFa ? "دستگاه سازگاری ثبت نشده است. ابتدا دستگاه را در بخش ثبت دستگاه اضافه کنید." : "No compatible device found. Add one in Device Registry."}
                </p>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="h-10 rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-slate-100 outline-none focus:border-amber-400/40"
                >
                  <option value="">{isFa ? "انتخاب دستگاه" : "Select device"}</option>
                  {(["mikrotik", "fortigate", "linux_edge"] as const).map((type) => {
                    const group = compatibleDevices.filter((device) => device.type === type);
                    if (group.length === 0) return null;
                    return (
                      <optgroup key={type} label={type === "linux_edge" ? "Linux" : type === "mikrotik" ? "MikroTik" : "FortiGate"}>
                        {group.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name} - {device.host}:{device.managementPort} - {device.vendor}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )
            )}
            {missingFields.map((field) => (
              <input
                key={field}
                value={missingValues[field] ?? ""}
                onChange={(event) => setMissingValues((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={field === "trustedSourceIp" ? "trustedSourceIp or trustedSourceCidr" : field}
                className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-amber-400/40"
              />
            ))}
            <button
              type="button"
              onClick={completeRequest}
              className="h-10 rounded-lg bg-amber-500/15 px-3 text-xs font-bold text-amber-100 ring-1 ring-inset ring-amber-400/25 transition hover:bg-amber-500/20 disabled:opacity-50"
              disabled={submitting || (needsDevice && compatibleDevices.length === 0)}
            >
              {submitting ? (isFa ? "در حال ساخت..." : "Creating...") : (isFa ? "ساخت برنامه اقدام" : "Create ActionPlan")}
            </button>
          </div>
        </div>
      )}
      {clarificationQuestions.length > 0 && (
        <div className="mt-3 rounded border border-blue-900/70 bg-blue-950/20 p-2">
          <p className="text-xs font-semibold text-blue-100">{isFa ? "پرسش‌های تکمیلی" : "Clarification questions"}</p>
          <ul className="mt-1 space-y-1 text-xs text-blue-100/80">
            {clarificationQuestions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}
      {createdPlanId && (
        <div className="mt-3 rounded border border-green-900/70 bg-green-950/20 p-3">
          <p className="text-xs font-medium text-green-200">{isFa ? "برنامه اقدام ساخته شد؛ آن را در مرکز اقدام بازبینی کنید." : "ActionPlan created. Review in Action Center."}</p>
          <button
            type="button"
            onClick={() => missingFields.length > 0 ? configureInActionCenter(createdPlanId) : reviewInActionCenter(createdPlanId)}
            className="mt-2 inline-flex h-8 items-center rounded-md border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 hover:text-green-100"
          >
            {missingFields.length > 0
              ? (isFa ? "تکمیل پارامترها در مرکز عملیات" : "Complete parameters in Action Center")
              : (isFa ? "بازبینی در مرکز عملیات" : "Review in Action Center")}
          </button>
        </div>
      )}
      {localMessage && <p className="mt-2 text-xs text-zinc-300">{localMessage}</p>}
    </div>
  );
}
