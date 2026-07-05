import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleX } from "lucide-react";
import { getAction, normalizeObject, type ActionPlan } from "@/lib/actions";
import { actionRawOutput, parseOpenPorts } from "@/lib/actionResult";

const metadataOf = (action: ActionPlan) => normalizeObject(normalizeObject(action.parametersJson).metadata);

export default function ActionResultView({ actionPlanId }: { actionPlanId: string }) {
  const [action, setAction] = useState<ActionPlan | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getAction(actionPlanId).then(setAction).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "نتیجه اجرا بارگذاری نشد.")); }, [actionPlanId]);
  const raw = action ? actionRawOutput(action) : "";
  const ports = useMemo(() => action?.actionType === "linux_read_listening_ports" ? parseOpenPorts(raw) : [], [action?.actionType, raw]);
  if (error) return <main className="mx-auto max-w-5xl p-6 text-red-200" dir="rtl">{error}</main>;
  if (!action) return <main className="mx-auto max-w-5xl p-6 text-slate-300" dir="rtl">در حال بارگذاری نتیجه…</main>;
  const result = normalizeObject(action.resultJson); const metadata = metadataOf(action); const succeeded = action.status === "succeeded" && result.executed === true && metadata.connectorInvoked === true;
  const parsed = normalizeObject(result.parsedResult); const dailySections = Array.isArray(parsed.sections) ? parsed.sections.map(normalizeObject) : [];
  return <main className="mx-auto max-w-5xl p-4 sm:p-8" dir="rtl">
    <section className="rounded-2xl border border-slate-700 bg-slate-950/90 p-5 text-right text-slate-100 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div><p className="text-xs text-cyan-300">مرکز عملیات</p><h1 className="mt-1 text-2xl font-semibold">نتیجه اجرای دستور</h1></div>
        <button onClick={() => { window.history.pushState({}, "", "/#action-center"); window.location.reload(); }} className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-xs"><ArrowRight className="h-4 w-4"/>بازگشت</button>
      </div>
      <div className={`mt-4 rounded-lg border p-4 ${succeeded ? "border-green-800 bg-green-950/25" : "border-red-800 bg-red-950/25"}`}>
        <div className="flex items-center gap-2">{succeeded ? <CheckCircle2 className="text-green-400"/> : <CircleX className="text-red-400"/>}<strong>{succeeded ? "دستور روی دستگاه اجرا شد." : "اجرای دستور ناموفق بود."}</strong></div>
      </div>
      {dailySections.length > 0 && <section className="mt-4 grid gap-3 md:grid-cols-2">{dailySections.map((entry) => <article key={String(entry.key)} className="rounded-lg border border-slate-700 p-4"><h2 className="font-semibold">{String(entry.titleFa)}</h2><p className="mt-1 text-xs text-slate-400">وضعیت: {String(entry.severity)}</p><ul className="mt-2 list-inside list-disc text-xs text-slate-300">{(Array.isArray(entry.items) ? entry.items : []).map((item) => <li key={String(item)}>{String(item)}</li>)}</ul></article>)}</section>}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="نام دستور" value={String(metadata.catalogTitleFa ?? action.actionType)}/><Info label="دستگاه" value={action.device?.name ?? action.deviceId ?? "-"}/><Info label="وندور" value={String(metadata.vendor ?? action.device?.vendor ?? "-")}/><Info label="وضعیت" value={action.status}/><Info label="زمان اجرا" value={new Date(String(result.executionCompletedAt ?? action.updatedAt)).toLocaleString("fa-IR")}/><Info label="اجراکننده" value={String(result.executor ?? metadata.executionTemplateRef ?? "-")}/>
      </dl>
      <section className="mt-5 rounded-lg border border-slate-800 p-4"><h2 className="font-semibold">خلاصه خروجی</h2><p className="mt-2 text-sm text-slate-300">{succeeded ? `${Array.isArray(result.commands) ? result.commands.length : 0} فرمان کنترل‌شده اجرا شد؛ کد خروج ${String(result.exitCode ?? 0)}.` : String(result.message ?? result.stderr ?? "اجرای connector کامل نشد.")}</p></section>
      {ports.length > 0 && <section className="mt-5 overflow-hidden rounded-lg border border-slate-800"><h2 className="p-4 font-semibold">پورت‌های در حال شنود</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-2">پروتکل</th><th className="p-2">آدرس محلی</th><th className="p-2">پورت</th><th className="p-2">سرویس / پردازش</th></tr></thead><tbody>{ports.map((row, index) => <tr key={`${row.localAddress}:${row.port}:${index}`} className="border-t border-slate-800"><td className="p-2">{row.protocol}</td><td className="p-2" dir="ltr">{row.localAddress}</td><td className="p-2">{row.port}</td><td className="p-2" dir="ltr">{row.process}</td></tr>)}</tbody></table></div></section>}
      {Boolean(result.stderr || result.message || result.error) && <section className="mt-5 rounded-lg border border-red-900/70 bg-red-950/15 p-4"><h2 className="font-semibold text-red-200">خطاها</h2><pre className="mt-2 whitespace-pre-wrap text-left text-xs text-red-100" dir="ltr">{String(result.stderr || result.message || result.error)}</pre></section>}
      <details className="mt-5 rounded-lg border border-slate-800 p-4"><summary className="cursor-pointer font-semibold">خروجی خام دستور</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-left text-xs" dir="ltr">{raw || "خروجی متنی ثبت نشده است."}</pre></details>
      <section className="mt-5 rounded-lg border border-cyan-900/60 bg-cyan-950/15 p-4"><h2 className="font-semibold">پیشنهادهای بعدی</h2><p className="mt-2 text-sm text-slate-300">خروجی را بررسی کنید؛ در صورت نیاز یک ActionPlan جداگانه برای اصلاح بسازید.</p></section>
    </section>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-800 bg-black/20 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
