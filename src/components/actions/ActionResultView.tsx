import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clipboard,
  Clock3,
  Code2,
  Server,
  SquareTerminal,
} from "lucide-react";
import { getAction, normalizeObject, type ActionPlan } from "@/lib/actions";
import { actionCommandOutputs, type ActionCommandOutput } from "@/lib/actionResult";
import { formatActionResult } from "@/features/actions/actionResultFormatter";
import { useNavigate } from "react-router-dom";

const metadataOf = (action: ActionPlan) => normalizeObject(normalizeObject(action.parametersJson).metadata);

function executionSucceeded(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const metadata = metadataOf(action);
  const connectorInvoked = metadata.connectorInvoked === true || result.connectorInvoked === true;
  return action.status === "succeeded" && result.executed === true && connectorInvoked;
}

function formatDuration(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const duration = Number(result.durationMs ?? result.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return "ثبت نشده";
  if (duration < 1000) return `${duration.toLocaleString("fa-IR")} میلی‌ثانیه`;
  return `${(duration / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ثانیه`;
}

function isTerminalStatus(action: ActionPlan) {
  return ["succeeded", "failed", "rejected", "rolled_back", "expired"].includes(String(action.status));
}

function commandStateLabel(command: ActionCommandOutput) {
  if (command.state === "succeeded") return "موفق";
  if (command.state === "failed") return "ناموفق";
  return "نامشخص";
}

function CommandOutputCard({ command, index }: { command: ActionCommandOutput; index: number }) {
  const [copied, setCopied] = useState(false);
  const copyValue = [command.stdout, command.stderr].filter(Boolean).join("\n");
  const successful = command.state === "succeeded";
  const failed = command.state === "failed";

  async function copyOutput() {
    if (!copyValue || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <header className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <SquareTerminal className="h-4 w-4 text-cyan-400" />
            <span>فرمان {index + 1}</span>
          </div>
          <code className="mt-1 block max-w-full break-all text-left text-sm leading-6 text-slate-100" dir="ltr">{command.label}</code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
            successful
              ? "border-emerald-700/70 bg-emerald-950/50 text-emerald-300"
              : failed
                ? "border-rose-700/70 bg-rose-950/50 text-rose-300"
                : "border-slate-700 bg-slate-900 text-slate-300"
          }`}>
            {successful ? <CheckCircle2 className="h-3.5 w-3.5" /> : failed ? <CircleX className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
            {commandStateLabel(command)}
            {command.exitCode !== null && <span dir="ltr">({command.exitCode})</span>}
          </span>
          {copyValue && (
            <button
              type="button"
              onClick={() => void copyOutput()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-cyan-700 hover:text-cyan-200"
              title="کپی خروجی"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "کپی شد" : "کپی"}
            </button>
          )}
        </div>
      </header>

      <div className="min-w-0 space-y-3 p-4">
        {command.stdout ? (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">خروجی</p>
            <pre className="max-h-[28rem] w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/45 p-4 text-left font-mono text-[13px] leading-6 text-slate-200" dir="ltr">
              {command.stdout}
            </pre>
          </div>
        ) : !command.stderr ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-black/20 px-4 py-3 text-sm text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            این فرمان خروجی متنی تولید نکرد{command.exitCode === 0 ? " و با موفقیت پایان یافت." : "."}
          </div>
        ) : null}

        {command.stderr && (
          <div>
            <p className="mb-2 text-xs font-medium text-rose-300">پیام خطا</p>
            <pre className="max-h-72 w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-left font-mono text-[13px] leading-6 text-rose-100" dir="ltr">
              {command.stderr}
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

export default function ActionResultView({ actionPlanId }: { actionPlanId: string }) {
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getAction(actionPlanId)
      .then(setAction)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "نتیجه اجرا بارگذاری نشد."));
  }, [actionPlanId]);

  useEffect(() => {
    if (!action?.status || ["succeeded", "failed", "rejected", "rolled_back", "expired"].includes(String(action.status))) return;
    const deadline = Date.now() + 120000;
    const interval = window.setInterval(() => {
      if (Date.now() > deadline) {
        window.clearInterval(interval);
        return;
      }
      void getAction(actionPlanId).then((next) => {
        setAction(next);
        if (isTerminalStatus(next)) window.clearInterval(interval);
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "نتیجه اجرا به‌روزرسانی نشد."));
    }, 2000);
    return () => window.clearInterval(interval);
  }, [actionPlanId, action?.status]);

  const formatted = useMemo(() => (action ? formatActionResult(action) : null), [action]);
  const commandOutputs = useMemo(() => (action ? actionCommandOutputs(action) : []), [action]);

  if (error) {
    return <main className="mx-auto max-w-6xl p-6 text-red-200" dir="rtl">{error}</main>;
  }

  if (!action || !formatted) {
    return <main className="mx-auto max-w-6xl p-6 text-slate-300" dir="rtl">در حال بارگذاری نتیجه...</main>;
  }

  const metadata = metadataOf(action);
  const succeeded = executionSucceeded(action);
  const result = normalizeObject(action.resultJson);
  const deviceName = action.device?.name ?? action.deviceId ?? "-";
  const vendor = String(metadata.vendor ?? action.device?.vendor ?? action.device?.type ?? "-");
  const failureMessage = String(result.message ?? result.error ?? result.stderr ?? "اجرای واقعی کانکتور با نتیجه معتبر ثبت نشده است.");

  return (
    <main className="mx-auto box-border min-w-0 max-w-6xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-8" dir="rtl">
      <div className="min-w-0 max-w-full space-y-4 text-right text-slate-100">
        <header className="min-w-0 max-w-full rounded-2xl border border-slate-800 bg-slate-950/85 p-4 shadow-xl sm:p-6">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-cyan-300">مرکز عملیات</p>
              <h1 className="mt-1 text-xl font-semibold sm:text-2xl">نتیجه اجرای دستور</h1>
              <p className="mt-2 text-sm text-slate-400">{formatted.summaryFa}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/actions")}
              className="inline-flex max-w-full w-fit items-center gap-2 whitespace-normal rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-700 hover:text-cyan-200"
            >
              <ArrowRight className="h-4 w-4" />
              بازگشت به مرکز عملیات
            </button>
          </div>
        </header>

        <section className={`rounded-2xl border p-4 sm:p-5 ${
          succeeded ? "border-emerald-800/80 bg-emerald-950/25" : "border-rose-800/80 bg-rose-950/20"
        }`}>
          <div className="flex items-start gap-3">
            {succeeded
              ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
              : <CircleX className="mt-0.5 h-6 w-6 shrink-0 text-rose-400" />}
            <div>
              <h2 className="font-semibold">{succeeded ? "دستور با موفقیت روی دستگاه اجرا شد" : "اجرای دستور کامل نشد"}</h2>
              {!succeeded && <p className="mt-1 text-sm leading-6 text-slate-300">{failureMessage}</p>}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 lg:grid-cols-4">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Server className="h-3.5 w-3.5" />دستگاه</dt>
              <dd className="mt-1 truncate text-sm text-slate-100" title={deviceName}>{deviceName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">وندور</dt>
              <dd className="mt-1 text-sm text-slate-100">{vendor}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />مدت اجرا</dt>
              <dd className="mt-1 text-sm text-slate-100">{formatDuration(action)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Code2 className="h-3.5 w-3.5" />تعداد فرمان</dt>
              <dd className="mt-1 text-sm text-slate-100">{commandOutputs.length.toLocaleString("fa-IR")}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/85 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 font-semibold"><SquareTerminal className="h-5 w-5 text-cyan-400" />خروجی اجرا</h2>
            <p className="mt-1 text-xs text-slate-500">پاسخ واقعی ثبت‌شده از کانکتور دستگاه</p>
          </div>

          {commandOutputs.length > 0 ? (
            <div className="space-y-3">
              {commandOutputs.map((command, index) => (
                <CommandOutputCard key={`${command.label}-${index}`} command={command} index={index} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 bg-black/20 p-5 text-sm text-slate-400">
              کانکتور خروجی متنی یا کد خروج جداگانه‌ای ثبت نکرده است.
            </div>
          )}
        </section>

        {formatted.structuredSections.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-950/85 p-4 sm:p-5">
            <h2 className="font-semibold">خلاصه خوانا</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {formatted.structuredSections.map((section, sectionIndex) => (
                <article key={`${section.title}-${sectionIndex}`} className="rounded-xl border border-slate-800 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-slate-100">{section.title}</h3>
                  <dl className="mt-3 space-y-3 text-sm">
                    {section.rows.map((row, rowIndex) => (
                      <div key={`${section.title}-${row.label}-${rowIndex}`}>
                        <dt className="text-xs text-slate-500">{row.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-slate-200">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {formatted.tables && formatted.tables.length > 0 && (
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/85 p-4 sm:p-5">
            {formatted.tables.map((table) => (
              <div key={table.title} className="overflow-x-auto">
                <h2 className="mb-3 font-semibold">{table.title}</h2>
                <table className="w-full min-w-max text-sm">
                  <thead><tr className="border-b border-slate-700 text-slate-400">{table.columns.map((column) => <th key={column} className="p-2 text-right">{column}</th>)}</tr></thead>
                  <tbody>{table.rows.map((row, index) => <tr key={`${table.title}-${index}`} className="border-b border-slate-800">{table.columns.map((column) => <td key={column} className="p-2 text-slate-200">{String(row[column] ?? "—")}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
          </section>
        )}

        {formatted.findings && formatted.findings.length > 0 && (
          <section className="rounded-2xl border border-amber-900/60 bg-slate-950/85 p-4 sm:p-5">
            <h2 className="font-semibold">یافته‌ها</h2>
            <div className="mt-3 space-y-3">
              {formatted.findings.map((finding, index) => (
                <article key={`${finding.title}-${index}`} className="rounded-xl border border-slate-800 bg-black/20 p-3 text-sm">
                  <div className="flex flex-wrap gap-2"><strong>{finding.title}</strong><span className="text-amber-300">{finding.severity}</span></div>
                  <p className="mt-2 text-slate-300">{finding.whyItMatters}</p>
                  <p className="mt-1 text-xs text-slate-400">شاهد: {finding.evidence}</p>
                  <p className="mt-1 text-cyan-200">اقدام پیشنهادی: {finding.recommendedAction}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {formatted.nextActionsFa.length > 0 && (
          <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/15 p-4 sm:p-5">
            <h2 className="font-semibold">پیشنهاد بعدی</h2>
            <ul className="mt-2 list-disc space-y-1 pr-5 text-sm leading-6 text-slate-300">
              {formatted.nextActionsFa.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        )}

        <details className="group rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
          <summary className="cursor-pointer list-none font-medium text-slate-300">جزئیات فنی اجرا</summary>
          <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-slate-500">شناسه عملیات</dt><dd className="mt-1 break-all text-left font-mono text-xs" dir="ltr">{action.id}</dd></div>
            <div><dt className="text-xs text-slate-500">نوع عملیات</dt><dd className="mt-1 break-all text-left font-mono text-xs" dir="ltr">{action.actionType}</dd></div>
            <div><dt className="text-xs text-slate-500">اجراکننده</dt><dd className="mt-1 text-sm">{String(result.executor ?? metadata.executionTemplateRef ?? "-")}</dd></div>
            <div><dt className="text-xs text-slate-500">وضعیت ذخیره‌شده</dt><dd className="mt-1 text-sm">{String(action.status)}</dd></div>
          </dl>
        </details>
      </div>
    </main>
  );
}
