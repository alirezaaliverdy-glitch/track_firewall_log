import { HardDriveDownload, Server, ShieldCheck, SlidersHorizontal, Terminal, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ActionCenterItem } from "@/lib/actionCenter";
import { backupRequirement, commandLines, humanize, record } from "../actionCenterWorkspaceModel";

type ExecutionPermission = { allowed: boolean; reason: string | null };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function riskPresentation(value: string, isFa: boolean) {
  const key = value.toLowerCase();
  const labels: Record<string, [string, string]> = {
    low: ["کم‌ریسک", "Low risk"],
    medium: ["ریسک متوسط", "Medium risk"],
    high: ["پرریسک", "High risk"],
    critical: ["بحرانی", "Critical"],
  };
  return { key: labels[key] ? key : "unknown", label: labels[key]?.[isFa ? 0 : 1] ?? (isFa ? "نامشخص" : "Unknown") };
}

function expectedImpact(item: ActionCenterItem, isFa: boolean) {
  const metadata = record(item.parametersJson.metadata);
  return text(item.parametersJson.expectedImpact)
    ?? text(metadata.expectedImpact)
    ?? text(item.commandPreview.expectedImpact)
    ?? text(item.validationJson.expectedImpact)
    ?? (isFa ? "این عملیات فقط روی دستگاه انتخاب‌شده و از طریق Connector ثبت‌شده اجرا می‌شود." : "This operation runs only on the selected device through the registered connector.");
}

export function ExecutionReviewDialog({
  item,
  actionName,
  parameters,
  permission,
  busy,
  isFa,
  onParameterChange,
  onCancel,
  onConfirm,
}: {
  item: ActionCenterItem;
  actionName: string;
  parameters: Record<string, string>;
  permission: ExecutionPermission;
  busy: boolean;
  isFa: boolean;
  onParameterChange: (key: string, value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => commandLines(item.commandPreview), [item.commandPreview]);
  const risk = riskPresentation(item.riskLevel, isFa);
  const deviceName = item.device?.name ?? item.deviceId ?? (isFa ? "دستگاه مشخص نشده" : "No device selected");
  const deviceDetails = [item.device?.host, item.device?.vendor].filter(Boolean).join(" · ");
  const parameterEntries = Object.entries(parameters);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onCancel]);

  return (
    <section className="action-review-dialog execution-review" role="dialog" aria-modal="true" aria-labelledby="execution-review-title" aria-describedby="execution-review-description" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div className="action-review-dialog__card execution-review__card" ref={dialogRef} tabIndex={-1}>
        <header className="execution-review__header">
          <div className="execution-review__heading">
            <span className="execution-review__icon"><ShieldCheck aria-hidden="true" /></span>
            <div>
              <p>{isFa ? "تأیید نهایی عملیات" : "Final execution review"}</p>
              <h2 id="execution-review-title">{actionName}</h2>
              <span id="execution-review-description">{isFa ? "خلاصه را بررسی کنید؛ با تأیید شما اجرای واقعی آغاز می‌شود." : "Review the summary. Real execution starts only after your confirmation."}</span>
            </div>
          </div>
          <button className="execution-review__close" type="button" disabled={busy} onClick={onCancel} aria-label={isFa ? "بستن" : "Close"}><X aria-hidden="true" /></button>
        </header>

        <main className="execution-review__body">
          <section className="execution-review__summary" aria-label={isFa ? "خلاصه عملیات" : "Operation summary"}>
            <article><span><Server aria-hidden="true" /></span><div><small>{isFa ? "دستگاه هدف" : "Target device"}</small><strong>{deviceName}</strong>{deviceDetails ? <p dir="ltr">{deviceDetails}</p> : null}</div></article>
            <article className={`is-risk-${risk.key}`}><span><TriangleAlert aria-hidden="true" /></span><div><small>{isFa ? "سطح اثر" : "Impact level"}</small><strong>{risk.label}</strong><p>{isFa ? "بر اساس کاتالوگ عملیات" : "From the operation catalog"}</p></div></article>
            <article><span><HardDriveDownload aria-hidden="true" /></span><div><small>{isFa ? "نیاز به پشتیبان" : "Backup"}</small><strong>{backupRequirement(item, isFa)}</strong><p>{isFa ? "پیش از اجرای Connector" : "Before connector execution"}</p></div></article>
          </section>

          <section className="execution-review__impact">
            <span><ShieldCheck aria-hidden="true" /></span>
            <div><strong>{isFa ? "چه اتفاقی می‌افتد؟" : "What will happen?"}</strong><p>{expectedImpact(item, isFa)}</p></div>
          </section>

          {parameterEntries.length > 0 ? <section className="execution-review__parameters">
            <header><SlidersHorizontal aria-hidden="true" /><div><h3>{isFa ? "تنظیمات عملیات" : "Operation settings"}</h3><p>{isFa ? "فقط پارامترهای عملیاتی قابل تغییر نمایش داده شده‌اند." : "Only operator-facing execution parameters are shown."}</p></div></header>
            <div>{parameterEntries.map(([key, value]) => <label key={key}><span>{humanize(key)}</span><input value={value} disabled={busy || !item.controls.canEditParameters} onChange={(event) => onParameterChange(key, event.target.value)} /></label>)}</div>
          </section> : null}

          <details className="execution-review__commands">
            <summary><span><Terminal aria-hidden="true" />{isFa ? "فرمان‌های قابل اجرا" : "Commands to execute"}</span><b>{commands.length.toLocaleString(isFa ? "fa-IR" : "en-US")}</b></summary>
            {commands.length > 0 ? <ol className="command-review-list">{commands.map((command, index) => <li key={`${command}-${index}`}><code dir="ltr">{command}</code></li>)}</ol> : <p>{isFa ? "فرمانی در پیش‌نمایش ثبت نشده است؛ اجرا تا ساخت پیش‌نمایش معتبر امکان‌پذیر نیست." : "No command is present in the preview; execution requires a valid preview."}</p>}
          </details>

          <details className="execution-review__technical">
            <summary>{isFa ? "جزئیات فنی" : "Technical details"}</summary>
            <dl><div><dt>ActionPlan</dt><dd dir="ltr">{item.id}</dd></div><div><dt>Connector</dt><dd>{item.support.execution}</dd></div><div><dt>{isFa ? "وضعیت پشتیبانی" : "Support state"}</dt><dd>{item.support.state}</dd></div></dl>
          </details>

          {!permission.allowed && permission.reason ? <div className="execution-review__blocked" role="alert"><TriangleAlert aria-hidden="true" /><span>{permission.reason}</span></div> : null}
        </main>

        <footer className="execution-review__footer">
          <p><ShieldCheck aria-hidden="true" />{isFa ? "پس از تأیید، PolicyGuard بررسی و Connector واقعی اجرا می‌شود." : "After confirmation, PolicyGuard checks and the real connector runs."}</p>
          <div><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{isFa ? "انصراف" : "Cancel"}</button><button className="primary-button execution-review__confirm" type="button" disabled={busy || !permission.allowed || commands.length === 0} title={permission.reason ?? undefined} onClick={onConfirm}>{busy ? (isFa ? "در حال اجرا..." : "Executing...") : (isFa ? "تأیید و اجرای عملیات" : "Confirm and execute")}</button></div>
        </footer>
      </div>
    </section>
  );
}
