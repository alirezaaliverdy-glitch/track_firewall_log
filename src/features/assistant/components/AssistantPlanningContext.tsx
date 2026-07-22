import type { AiActionDebug } from "@/lib/ai";
import type { Device } from "@/lib/devices";
import { reviewInActionCenter } from "@/lib/actionPlanHandoff";
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
    <div className="mb-4 rounded-lg border border-cyan-900/60 bg-cyan-950/15 p-3 text-right" dir={isFa ? "rtl" : "ltr"} aria-label={isFa ? "زمینه برنامه‌ریزی دستیار" : "Assistant planning context"}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold text-cyan-200">{isFa ? "حالت پاسخ" : "Response mode"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-700 bg-cyan-950/50 px-3 py-1 text-xs font-semibold text-cyan-100">{modeText}</span>
            <span className="text-xs text-zinc-400">{isFa ? "بدون اجرای خودکار و بدون تغییر مسیر خودکار" : "No automatic execution or navigation"}</span>
          </div>
        </div>
        <div className="md:text-left">
          <p className="text-xs font-semibold text-cyan-200">{isFa ? "منبع vendor/platform" : "Vendor/platform source"}</p>
          <p className="mt-2 text-xs text-zinc-300">{deviceText}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{isFa ? "دستگاه انتخاب‌شده تنها منبع محدوده اجرا است." : "The selected device is the only execution scope."}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded border border-zinc-800 bg-black/20 p-2">
          <p className="text-[11px] text-zinc-500">{isFa ? "وضعیت قرارداد" : "Contract state"}</p>
          <p className="mt-1 text-xs font-medium text-zinc-200">{stateText}</p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/20 p-2">
          <p className="text-[11px] text-zinc-500">{isFa ? "فیلدهای ناقص" : "Missing fields"}</p>
          <p className="mt-1 text-xs font-medium text-zinc-200">{missingText}</p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/20 p-2">
          <p className="text-[11px] text-zinc-500">{isFa ? "بازبینی" : "Review"}</p>
          <p className="mt-1 text-xs font-medium text-zinc-200">{createdPlanId ? (isFa ? "ActionPlan در مرکز اقدام آماده است" : "ActionPlan is ready in Action Center") : guidedStart ? (isFa ? "شروع دستی workflow آماده است" : "Manual workflow start is available") : actionDebug?.blockedReason ?? (isFa ? "هنوز برنامه‌ای ساخته نشده" : "No plan created yet")}</p>
        </div>
      </div>
      {executionState?.nextStep && <p className="mt-2 text-xs text-zinc-400">{executionState.nextStep}</p>}
      {createdPlanId && <button type="button" onClick={() => reviewInActionCenter(createdPlanId)} className="mt-3 rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">{isFa ? "بازبینی در مرکز اقدام" : "Review in Action Center"}</button>}
    </div>
  );
}
