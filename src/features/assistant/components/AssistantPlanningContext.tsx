import type { AiActionDebug } from "@/lib/ai";
import type { Device } from "@/lib/devices";
import { reviewInActionCenter } from "@/lib/actionPlanHandoff";
import { CheckCircle2, ChevronDown, CircleDot, Server } from "lucide-react";
import { vendorOfDevice } from "../assistantUiHelpers";
import type { AssistantExecutionState, AssistantPlanningMode, GuidedStartState } from "../types";

export function PlanningContextPanel({
  mode,
  selectedDevice,
  createdPlanId,
  executionState,
  guidedStart,
  actionDebug,
  isFa,
}: {
  mode: AssistantPlanningMode;
  selectedDevice: Device | null;
  createdPlanId: string | null;
  executionState: AssistantExecutionState | null;
  guidedStart: GuidedStartState | null;
  actionDebug: AiActionDebug | null;
  isFa: boolean;
}) {
  const modeLabels: Record<AssistantPlanningMode, string> = isFa ? {
    chat: "گفت‌وگو",
    direct_action: "اقدام مستقیم",
    guided_workflow: "Workflow مرحله‌ای",
  } : {
    chat: "Chat",
    direct_action: "Direct Action",
    guided_workflow: "Guided Workflow",
  };
  const modeText = modeLabels[mode];
  const deviceText = selectedDevice
    ? `${selectedDevice.name} · ${vendorOfDevice(selectedDevice)} · ${selectedDevice.host}:${selectedDevice.managementPort}`
    : (isFa ? "هیچ دستگاهی انتخاب نشده است" : "No device selected");
  const stateText = executionState
    ? executionState.executable
      ? (isFa ? "قابل اجرا پس از بازبینی" : "Executable after review")
      : executionState.missing.length > 0
        ? (isFa ? "نیازمند تکمیل اطلاعات" : "Needs input")
        : executionState.manualOnly
          ? (isFa ? "فقط بررسی دستی" : "Review only")
          : (isFa ? "مسدود یا پشتیبانی‌نشده" : "Blocked or unsupported")
    : (isFa ? "در انتظار درخواست" : "Waiting for a request");
  const missingText = executionState?.missing.length ? executionState.missing.join(", ") : (isFa ? "ندارد" : "None");

  return (
    <div className="mb-4 rounded-xl border border-white/5 bg-black/15 p-3" dir={isFa ? "rtl" : "ltr"} aria-label={isFa ? "زمینه برنامه‌ریزی دستیار" : "Assistant planning context"}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-bold text-cyan-100">
            <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
            {modeText}
          </span>
          <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <Server className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="truncate">{deviceText}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${executionState?.executable ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : executionState?.missing.length ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {stateText}
          </span>
          {createdPlanId && (
            <button type="button" onClick={() => reviewInActionCenter(createdPlanId)} className="inline-flex min-h-9 items-center justify-center rounded-lg bg-cyan-600 px-3 text-xs font-bold text-white transition hover:bg-cyan-500">
              {isFa ? "بازبینی در مرکز عملیات" : "Review in Action Center"}
            </button>
          )}
        </div>
      </div>

      {(executionState?.nextStep || executionState?.missing.length) && (
        <p className="mt-3 border-t border-white/5 pt-3 text-xs leading-6 text-slate-400">
          {executionState?.nextStep}{executionState?.missing.length ? ` · ${isFa ? "اطلاعات لازم" : "Required"}: ${missingText}` : ""}
        </p>
      )}

      {(actionDebug?.blockedReason || guidedStart) && (
        <details className="group mt-2 text-[11px] text-slate-500">
          <summary className="flex cursor-pointer list-none items-center gap-1 marker:hidden">{isFa ? "جزئیات برنامه‌ریزی" : "Planning details"}<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
          <p className="mt-2 rounded-lg bg-black/20 p-2">{actionDebug?.blockedReason ?? (isFa ? "شروع گردش‌کار دستی آماده است." : "Manual workflow start is ready.")}</p>
        </details>
      )}
    </div>
  );
}
