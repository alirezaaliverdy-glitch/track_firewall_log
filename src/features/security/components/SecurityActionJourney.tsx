import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { ArrowUpLeft, Check, CircleAlert, ClipboardList, FileCode2, LoaderCircle, ShieldCheck } from "lucide-react";
import { listActionCenter, type ActionCenterItem } from "@/lib/actionCenter";
import { actionDisplayName, commandLines } from "@/features/actions/actionCenterWorkspaceModel";
import "./SecurityActionJourney.css";

const isVerifiedSuccess = (item: ActionCenterItem) => item.lifecycleState === "succeeded" && item.evidence.connectorInvoked;

export function SecurityActionJourney() {
  const { i18n } = useTranslation();
  const isFa = (i18n.resolvedLanguage ?? i18n.language).startsWith("fa");
  const [item, setItem] = useState<ActionCenterItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void listActionCenter({ limit: 12 }).then((result) => {
        if (!active) return;
        setItem(result.items.find((candidate) => !["succeeded", "failed", "skipped", "cancelled"].includes(candidate.lifecycleState)) ?? result.items[0] ?? null);
        setError(false);
      }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const commands = item ? commandLines(item.commandPreview) : [];
  const verified = item ? isVerifiedSuccess(item) : false;
  const failed = item?.lifecycleState === "failed";
  const running = item?.lifecycleState === "confirmed" || item?.lifecycleState === "executing";
  const ready = item?.lifecycleState === "ready_for_confirmation";
  const stage = verified ? 4 : running || (failed && item?.evidence.connectorInvoked) ? 3 : ready || (failed && commands.length > 0) ? 2 : item ? 1 : 0;
  const labels = isFa ? ["برنامه اقدام", "پیش‌نمایش", "تأیید و اجرا", "نتیجه"] : ["Action plan", "Preview", "Confirm & execute", "Result"];

  return <section className="security-action-journey" aria-labelledby="security-action-journey-title">
    <header className="security-action-journey__heading">
      <div><span className="security-action-journey__eyebrow">{isFa ? "مسیر اقدام" : "Action workflow"}</span><h2 id="security-action-journey-title">{isFa ? "از بررسی تا نتیجهٔ واقعی" : "From review to verified result"}</h2></div>
      <Link to="/actions">{isFa ? "همهٔ اقدامات" : "All actions"}<ArrowUpLeft size={16} /></Link>
    </header>

    <ol className="security-action-journey__steps" aria-label={isFa ? "مراحل اقدام" : "Action stages"}>
      {labels.map((label, index) => <li key={label} className={stage > index ? "is-complete" : stage === index ? "is-current" : ""} aria-current={stage === index ? "step" : undefined}><span>{stage > index ? <Check size={15} /> : index + 1}</span><strong>{label}</strong></li>)}
    </ol>

    {loading && !item ? <div className="security-action-journey__empty" role="status"><LoaderCircle size={19} className="security-action-journey__spin" />{isFa ? "در حال دریافت برنامه‌های اقدام…" : "Loading action plans…"}</div> : error && !item ? <div className="security-action-journey__empty" role="alert"><CircleAlert size={19} />{isFa ? "برنامه‌ها در دسترس نیستند؛ وضعیت اجرا نامشخص است." : "Action plans are unavailable; execution state is unknown."}</div> : !item ? <div className="security-action-journey__empty"><ClipboardList size={23} /><div><strong>{isFa ? "هنوز برنامهٔ اقدامی ثبت نشده" : "No action plan yet"}</strong><p>{isFa ? "یک یافته را بررسی کنید یا از مرکز عملیات اقدام بسازید." : "Review a finding or create an action in Action Center."}</p></div><Link to="/security/findings">{isFa ? "بررسی یافته‌ها" : "Review findings"}<ArrowUpLeft size={15} /></Link></div> : <>
      {error ? <div className="security-action-journey__notice" role="status">{isFa ? "به‌روزرسانی ناموفق بود؛ وضعیت نمایش‌داده‌شده ممکن است قدیمی باشد." : "Refresh failed; the displayed status may be stale."}</div> : null}
      <div className="security-action-journey__grid">
        <article className="security-action-journey__card">
          <div className="security-action-journey__card-title"><ClipboardList size={19} /><h3>{isFa ? "برنامه اقدام" : "Action plan"}</h3></div>
          <strong className="security-action-journey__action-name">{actionDisplayName(item, isFa)}</strong>
          <p>{item.device?.name ? `${item.device.name} · ${item.device.vendor}` : (isFa ? "تجهیز هنوز انتخاب نشده" : "No device selected")}</p>
          <span className={`security-action-journey__status ${failed ? "is-failed" : verified ? "is-success" : ""}`}>{failed ? (isFa ? "ناموفق" : "Failed") : verified ? (isFa ? "اجرا و ثبت شد" : "Executed and recorded") : running ? (isFa ? "در حال اجرا" : "Executing") : ready ? (isFa ? "آمادهٔ تأیید" : "Ready for confirmation") : item.lifecycleState === "needs_input" ? (isFa ? "نیازمند تکمیل" : "Needs input") : (isFa ? "پیش‌نویس؛ اجرا نشده" : "Draft; not executed")}</span>
        </article>

        <article className="security-action-journey__card security-action-journey__preview">
          <div className="security-action-journey__card-title"><FileCode2 size={19} /><h3>{isFa ? "پیش‌نمایش دستورات" : "Command preview"}</h3></div>
          {commands.length ? <><span className="security-action-journey__count">{isFa ? `${commands.length.toLocaleString("fa-IR")} دستور ثبت‌شده` : `${commands.length} recorded command${commands.length === 1 ? "" : "s"}`}</span><pre dir="ltr">{commands.join("\n")}</pre></> : <p>{isFa ? "پیش‌نمایشی ثبت نشده؛ دستوری هنوز اجرا نشده است." : "No preview recorded; no command has run."}</p>}
        </article>

        <article className="security-action-journey__card security-action-journey__decision">
          <div className="security-action-journey__card-title"><ShieldCheck size={19} /><h3>{isFa ? "تأیید و وضعیت اجرا" : "Approval & execution"}</h3></div>
          <p>{verified ? (isFa ? "کانکتور واقعی اجرا شده و نتیجه ثبت شده است." : "The real connector ran and the result was recorded.") : failed ? (isFa ? "عملیات ناموفق بود؛ جزئیات خطا را بررسی کنید." : "The action failed; review its error details.") : running ? (isFa ? "عملیات در جریان است؛ نتیجه پس از پاسخ کانکتور مشخص می‌شود." : "Execution is in progress; the connector result is pending.") : ready ? (isFa ? "پیش‌نمایش آماده است. برای اجرا، برنامه را بازبینی و تأیید کنید." : "Preview is ready. Review and confirm before execution.") : (isFa ? "ساخت برنامه یا پیش‌نمایش به معنی اجرا روی تجهیز نیست." : "Creating a plan or preview does not execute on the device.")}</p>
          <Link className="security-action-journey__primary" to={verified || failed ? `/actions/${encodeURIComponent(item.id)}/result` : `/actions/${encodeURIComponent(item.id)}`}>{verified ? (isFa ? "دیدن نتیجه" : "View result") : failed ? (isFa ? "بررسی خطا" : "Review error") : ready ? (isFa ? "بازبینی و تأیید" : "Review & confirm") : (isFa ? "باز کردن برنامه" : "Open plan")}<ArrowUpLeft size={16} /></Link>
        </article>
      </div>
      <footer className={`security-action-journey__result ${failed ? "is-failed" : verified ? "is-success" : ""}`} role="status"><span>{failed ? <CircleAlert size={18} /> : verified ? <Check size={18} /> : running ? <LoaderCircle size={18} className="security-action-journey__spin" /> : <ShieldCheck size={18} />}{verified ? (isFa ? "نتیجهٔ ثبت‌شده" : "Recorded result") : failed ? (isFa ? "نیازمند بررسی" : "Needs review") : running ? (isFa ? "منتظر پاسخ کانکتور" : "Waiting for connector") : (isFa ? "هنوز اجرا نشده" : "Not executed yet")}</span><Link to={verified || failed ? `/actions/${encodeURIComponent(item.id)}/result` : `/actions/${encodeURIComponent(item.id)}`}>{isFa ? "جزئیات عملیات" : "Action details"}<ArrowUpLeft size={15} /></Link></footer>
    </>}
  </section>;
}
