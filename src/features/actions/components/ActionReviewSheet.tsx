import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ActionCenterItem, ActionLifecycle } from "@/lib/actionCenter";
import {
  backupRequirement,
  commandLines,
  formatDate,
  humanize,
  record,
  reviewParametersFrom,
  terminalLifecycle,
} from "../actionCenterWorkspaceModel";

const INLINE_PARAMETER_EXCLUDE = new Set([
  "source", "vendor", "deviceId", "protocol", "actionType", "executable", "supportState", "connectorType",
  "executionSupport", "supportReasonKey", "implementationState", "executionTemplateRef", "requiredParamsSatisfied"
]);

export function InlineActionReviewPanel({
  item,
  actionName,
  isFa,
  locale,
  lifecycleLabel,
  busy,
  canReview,
  disabledReason,
  onPreview,
  onReview,
  onRetry,
  onClose
}: {
  item: ActionCenterItem;
  actionName: string;
  isFa: boolean;
  locale: string;
  lifecycleLabel: (value: ActionLifecycle) => string;
  busy: boolean;
  canReview: boolean;
  disabledReason: string | null;
  onPreview: () => void;
  onReview: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const parameters = reviewParametersFrom(item.parametersJson);
  const parameterLabels = Object.keys(parameters).filter((key) => !INLINE_PARAMETER_EXCLUDE.has(key));
  const previewCommands = commandLines(item.commandPreview);
  const canExecute = item.controls.canConfirm || item.controls.canExecute;
  const detailPath = terminalLifecycle(item.lifecycleState) ? `/actions/${encodeURIComponent(item.id)}/result` : `/actions/${encodeURIComponent(item.id)}`;
  const deviceLabel = item.device?.name ?? item.deviceId ?? (isFa ? "بدون دستگاه" : "No device");
  const vendorLabel = [item.device?.vendor, item.device?.type || item.device?.protocol].filter(Boolean).join(" / ") || (isFa ? "نامشخص" : "Unknown");
  const approvalState = String(record(item.approval).status ?? item.status ?? item.lifecycleState);

  return (
    <section className="inline-action-review" aria-label={isFa ? "بررسی درون‌صفحه اکشن" : "Inline action review"}>
      <header>
        <div>
          <p className="operator-eyebrow">{isFa ? "بررسی و اجرای درون‌صفحه" : "Inline review and execution"}</p>
          <h2>{actionName}</h2>
          <span>{isFa ? "همه کنترل‌ها از مسیر Action Center، PolicyGuard و Connector ثبت‌شده عبور می‌کنند." : "All controls continue through Action Center, PolicyGuard, and the registered connector."}</span>
        </div>
        <StatusBadge value={lifecycleLabel(item.lifecycleState)} tone={item.lifecycleState === "succeeded" ? "good" : item.lifecycleState === "failed" ? "danger" : "warning"} />
      </header>

      <div className="inline-action-review__grid">
        <div><span>{isFa ? "دستگاه" : "Device"}</span><strong>{deviceLabel}</strong><small>{vendorLabel}</small></div>
        <div><span>{isFa ? "ریسک" : "Risk"}</span><strong>{item.riskLevel}</strong><small>{isFa ? "پشتیبان" : "Backup"}: {backupRequirement(item, isFa)}</small></div>
        <div><span>{isFa ? "تأیید" : "Approval"}</span><strong>{approvalState}</strong><small>{isFa ? "به‌روزرسانی" : "Updated"}: {formatDate(item.updatedAt, locale)}</small></div>
        <div><span>{isFa ? "اثبات اجرا" : "Execution proof"}</span><strong>{item.evidence.connectorInvoked ? (isFa ? "Connector ثبت شد" : "Connector recorded") : (isFa ? "هنوز اجرا نشده" : "Not executed yet")}</strong><small>{item.support.executable ? item.support.execution : String(item.support.reason ?? item.support.state)}</small></div>
      </div>

      <div className="inline-action-review__summary">
        <div>
          <strong>{isFa ? "پیش‌نمایش" : "Preview"}</strong>
          <p>{previewCommands.length > 0 ? (isFa ? `${previewCommands.length} فرمان آماده بررسی صریح است.` : `${previewCommands.length} generated command${previewCommands.length === 1 ? "" : "s"} ready for explicit review.`) : (isFa ? "ابتدا پیش‌نمایش بسازید؛ هیچ Connector اجرا نمی‌شود." : "Generate a preview first; no connector is invoked.")}</p>
        </div>
        <div>
          <strong>{isFa ? "پارامترها" : "Parameters"}</strong>
          <p>{parameterLabels.length > 0 ? parameterLabels.map(humanize).join(", ") : (isFa ? "پارامتر عملیاتی قابل نمایش وجود ندارد." : "No operator-facing parameters.")}</p>
        </div>
      </div>

      {!item.support.executable && <div className="inline-action-review__guard" role="alert">
        <strong>{isFa ? "اجرای مستقیم غیرفعال است" : "Direct execution disabled"}</strong>
        <p>{String(item.support.reason ?? (isFa ? "این اکشن فقط برای بررسی نگه داشته شده است." : "This action is retained for review only."))}</p>
      </div>}
      {canExecute && !canReview && disabledReason && <div className="inline-action-review__guard" role="alert">
        <strong>{isFa ? "مجوز اجرا کافی نیست" : "Execution permission required"}</strong>
        <p>{disabledReason}</p>
      </div>}

      <footer className="operator-result__actions">
        {item.controls.canPreview && <button className="primary-button operator-execute" type="button" disabled={busy} onClick={onPreview}>{busy ? (isFa ? "در حال اجرا..." : "Running...") : (isFa ? "ساخت پیش‌نمایش" : "Generate Preview")}</button>}
        {item.controls.canEditParameters && <Link className="secondary-button" to={`/actions/${encodeURIComponent(item.id)}/configure`}>{isFa ? "تنظیم پارامترها" : "Configure parameters"}</Link>}
        {canExecute && <button className="primary-button operator-execute" type="button" disabled={busy || !canReview} title={disabledReason ?? undefined} onClick={onReview}>{busy ? (isFa ? "در حال اجرا..." : "Running...") : item.lifecycleState === "ready_for_confirmation" ? (isFa ? "تأیید و اجرا" : "Confirm and Execute") : (isFa ? "بازبینی اجرا" : "Review execution")}</button>}
        {item.lifecycleState === "failed" && <button className="primary-button" type="button" disabled={busy} onClick={onRetry}>{isFa ? "تلاش دوباره" : "Retry"}</button>}
        {item.lifecycleState === "succeeded" && <button className="primary-button" type="button" disabled={busy} onClick={onRetry}>{isFa ? "اجرای دوباره" : "Run again"}</button>}
        {item.controls.relatedDevicePath && <Link className="secondary-link" to={item.controls.relatedDevicePath}>{isFa ? "فضای کاری دستگاه" : "Device workspace"}</Link>}
        <Link className="secondary-link" to={detailPath}>{isFa ? "جزئیات کامل" : "Full details"}</Link>
        <button className="text-button" type="button" disabled={busy} onClick={onClose}>{isFa ? "بستن بررسی" : "Close review"}</button>
      </footer>
    </section>
  );
}
