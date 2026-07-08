import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleX } from "lucide-react";
import { getAction, normalizeObject, type ActionPlan } from "@/lib/actions";
import { formatActionResult } from "@/features/actions/actionResultFormatter";

const metadataOf = (action: ActionPlan) => normalizeObject(normalizeObject(action.parametersJson).metadata);

function executionSucceeded(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const metadata = metadataOf(action);
  return action.status === "succeeded" && result.executed === true && metadata.connectorInvoked === true;
}

function formatDuration(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const duration = Number(result.durationMs ?? result.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return "ثبت نشده";
  if (duration < 1000) return `${duration} ms`;
  return `${(duration / 1000).toFixed(2)} ثانیه`;
}

function statusLabel(action: ActionPlan) {
  if (executionSucceeded(action)) return "موفق";
  if (action.status === "running" || action.status === "executing") return "در حال اجرا";
  if (action.status === "dry_run_ready") return "فقط پیش‌نمایش";
  if (action.status === "failed") return "ناموفق";
  return String(action.status);
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-100">{value}</dd>
    </div>
  );
}

export default function ActionResultView({ actionPlanId }: { actionPlanId: string }) {
  const [action, setAction] = useState<ActionPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getAction(actionPlanId)
      .then(setAction)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "نتیجه اجرا بارگذاری نشد."));
  }, [actionPlanId]);

  const formatted = useMemo(() => (action ? formatActionResult(action) : null), [action]);

  if (error) {
    return <main className="mx-auto max-w-5xl p-6 text-red-200" dir="rtl">{error}</main>;
  }

  if (!action || !formatted) {
    return <main className="mx-auto max-w-5xl p-6 text-slate-300" dir="rtl">در حال بارگذاری نتیجه...</main>;
  }

  const metadata = metadataOf(action);
  const succeeded = executionSucceeded(action);
  const result = normalizeObject(action.resultJson);
  const deviceName = action.device?.name ?? action.deviceId ?? "-";
  const vendor = String(metadata.vendor ?? action.device?.vendor ?? action.device?.type ?? "-");
  const parsedResult = normalizeObject(result.parsedResult);
  const dailySections = Array.isArray(parsedResult.sections) ? parsedResult.sections as Array<Record<string, unknown>> : [];
  const countStatus = (status: string) => dailySections.filter((section) => section.status === status).length;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8" dir="rtl">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/90 p-5 text-right text-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs text-cyan-300">مرکز عملیات</p>
            <h1 className="mt-1 text-2xl font-semibold">نتیجه اجرای دستور</h1>
          </div>
          <button
            onClick={() => {
              window.history.pushState({}, "", "/#action-center");
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت به مرکز عملیات
          </button>
        </div>

        <div className={`mt-4 rounded-xl border p-4 ${succeeded ? "border-green-800 bg-green-950/25" : "border-red-800 bg-red-950/20"}`}>
          <div className="flex items-center gap-2">
            {succeeded ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <CircleX className="h-5 w-5 text-red-400" />}
            <strong>{succeeded ? "اجرای واقعی روی دستگاه ثبت شد." : "این اجرا موفق نهایی ثبت نشده است."}</strong>
          </div>
          {!succeeded && (
            <p className="mt-2 text-sm text-slate-300">
              {String(result.message ?? result.error ?? result.stderr ?? "بدون connectorInvoked=true یا خروجی معتبر، نتیجه موفق محسوب نمی‌شود.")}
            </p>
          )}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard label="خلاصه نتیجه" value={formatted.summaryFa} />
          <InfoCard label="وضعیت اجرا" value={statusLabel(action)} />
          <InfoCard label="دستگاه" value={deviceName} />
          <InfoCard label="وندور" value={vendor} />
          <InfoCard label="مدت زمان" value={formatDuration(action)} />
          <InfoCard label="اجراکننده" value={String(result.executor ?? metadata.executionTemplateRef ?? "-")} />
          {vendor.toLowerCase().includes("forti") && <InfoCard label="کانکتور" value="fortigate-ssh" />}
          {vendor.toLowerCase().includes("forti") && <InfoCard label="فراخوانی کانکتور" value={metadata.connectorInvoked === true ? "connectorInvoked=true" : "اجرا نشده"} />}
          {dailySections.length > 0 && <InfoCard label="بحرانی" value={String(countStatus("critical"))} />}
          {dailySections.length > 0 && <InfoCard label="نیازمند بررسی" value={String(countStatus("needs_review"))} />}
          {dailySections.length > 0 && <InfoCard label="ایمن" value={String(countStatus("safe"))} />}
          {dailySections.length > 0 && <InfoCard label="بررسی‌نشده" value={String(countStatus("not_checked"))} />}
        </dl>

        <section className="mt-5 rounded-xl border border-slate-800 p-4">
          <h2 className="font-semibold text-slate-100">خروجی ساختاریافته</h2>
          {formatted.structuredSections.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">برای این نوع نتیجه، خروجی ساختاریافته جداگانه ثبت نشده است.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {formatted.structuredSections.map((section) => (
                <article key={section.title} className="rounded-xl border border-slate-800 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-slate-100">{section.title}</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.label}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <dt className="text-xs text-slate-500">{row.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-slate-200">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        {formatted.tables && formatted.tables.length > 0 && (
          <section className="mt-5 space-y-4 rounded-xl border border-slate-800 p-4">
            {formatted.tables.map((table) => (
              <div key={table.title} className="overflow-x-auto">
                <h2 className="mb-3 font-semibold text-slate-100">{table.title}</h2>
                <table className="w-full min-w-max text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400">{table.columns.map((column) => <th key={column} className="p-2 text-right">{column}</th>)}</tr></thead>
                  <tbody>{table.rows.map((row, index) => <tr key={`${table.title}-${index}`} className="border-b border-slate-800">{table.columns.map((column) => <td key={column} className="p-2 text-slate-200">{String(row[column] ?? "—")}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
          </section>
        )}

        {formatted.findings && formatted.findings.length > 0 && (
          <section className="mt-5 rounded-xl border border-amber-900/60 p-4">
            <h2 className="font-semibold text-slate-100">یافته‌ها</h2>
            <div className="mt-3 space-y-3">{formatted.findings.map((finding, index) => (
              <article key={`${finding.title}-${index}`} className="rounded-lg bg-black/20 p-3 text-sm">
                <div className="flex gap-2"><strong>{finding.title}</strong><span className="text-amber-300">{finding.severity}</span></div>
                <p className="mt-2 text-slate-300">{finding.whyItMatters}</p>
                <p className="mt-1 text-xs text-slate-400">شاهد: {finding.evidence}</p>
                <p className="mt-1 text-cyan-200">اقدام پیشنهادی: {finding.recommendedAction}</p>
              </article>
            ))}</div>
          </section>
        )}

        <section className="mt-5 rounded-xl border border-cyan-900/60 bg-cyan-950/15 p-4">
          <h2 className="font-semibold text-slate-100">پیشنهادهای بعدی</h2>
          {formatted.nextActionsFa.length === 0 ? (
            <p className="mt-2 text-sm text-slate-300">مورد خاصی ثبت نشده است.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-slate-300">
              {formatted.nextActionsFa.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <details className="mt-5 rounded-xl border border-slate-800 p-4">
          <summary className="cursor-pointer font-semibold text-slate-100">خروجی خام</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-left text-xs text-slate-200" dir="ltr">
            {formatted.rawOutput || "خروجی متنی ثبت نشده است."}
          </pre>
        </details>
      </section>
    </main>
  );
}
