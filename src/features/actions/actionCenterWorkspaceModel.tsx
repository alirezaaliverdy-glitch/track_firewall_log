import type { ActionCenterItem, ActionLifecycle } from "@/lib/actionCenter";

export function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return locale === "fa-IR" ? "اطلاعات موجود نیست" : "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (locale === "fa-IR" ? "اطلاعات موجود نیست" : "Not available") : date.toLocaleString(locale);
}

export function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function humanize(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function actionDisplayName(action: ActionCenterItem, isFa: boolean) {
  const metadata = record(action.parametersJson.metadata);
  const catalogTitle = isFa ? metadata.catalogTitleFa : metadata.catalogTitleEn ?? metadata.catalogTitleFa;
  if (typeof catalogTitle === "string" && catalogTitle.trim()) return catalogTitle.trim();
  const requested = metadata.requestedActionType ?? metadata.actionType;
  if ((action.actionType === "custom_vendor_action" || action.actionType === "generic_security_action") && typeof requested === "string" && requested.trim()) {
    return humanize(requested);
  }
  return action.actionType ? humanize(action.actionType) : (isFa ? "اطلاعات موجود نیست" : "Not available");
}

export function fieldValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value === undefined || value === null ? "" : String(value);
}

export function terminalLifecycle(value: ActionLifecycle) {
  return value === "succeeded" || value === "failed" || value === "skipped" || value === "cancelled";
}

const NON_OPERATOR_PARAMETER_FIELDS = new Set([
  "metadata", "actionType", "deviceId", "vendor", "protocol", "executionSupport", "missingFields", "clarificationQuestions",
  "source", "implementationState", "supportState", "supportReasonKey", "executable", "connectorType", "executionTemplateRef", "normalizedParams", "requiredParamsSatisfied",
  "requiresExplicitReview", "expectedImpact", "suggestedPrechecks", "suggestedVerification", "suggestedRollback",
]);

export function reviewParametersFrom(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !NON_OPERATOR_PARAMETER_FIELDS.has(key) && (item === null || ["string", "number", "boolean"].includes(typeof item))).map(([key, item]) => [key, fieldValue(item)]));
}

export function commandLines(preview: Record<string, unknown>) {
  const candidates = [preview.plannedCommands, preview.commands, preview.generatedCommands, preview.command];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map((item) => typeof item === "string" ? item : fieldValue((item as Record<string, unknown>)?.command)).filter(Boolean);
    if (typeof candidate === "string" && candidate.trim()) return [candidate];
  }
  return [];
}

export function AdvancedBlock({ title, value }: { title: string; value: unknown }) {
  return <section className="operator-advanced__block"><h4>{title}</h4><pre>{pretty(value)}</pre></section>;
}

export function resultMessage(item: ActionCenterItem, isFa: boolean) {
  if (item.lifecycleState === "queued") return isFa ? "این عملیات ثبت شده و تا زمان تعیین‌شده در صف اجرا می‌ماند." : "This operation is queued until its scheduled time.";
  if (item.lifecycleState === "succeeded" && item.evidence.connectorInvoked) return isFa ? "اجرای واقعی Connector با موفقیت تکمیل شد." : "The connector completed the operation successfully.";
  if (item.lifecycleState === "failed") {
    const exactError = typeof item.connectorResult.message === "string" ? item.connectorResult.message : null;
    if (exactError) return exactError;
    return item.evidence.integrityError ?? (item.evidence.connectorInvoked
      ? (isFa ? "Connector اجرا شد اما عملیات موفق نبود. جزئیات پیشرفته را بررسی کنید." : "The connector ran, but the operation did not succeed. Review Advanced Details.")
      : (isFa ? "عملیات پیش از فراخوانی Connector متوقف شد." : "The operation stopped before the connector was invoked."));
  }
  if (item.lifecycleState === "ready_for_confirmation") return isFa ? "پیش‌نمایش آماده است و هیچ دستوری روی دستگاه اجرا نشد." : "Preview is ready; no command was executed on the device.";
  return isFa ? "وضعیت عملیات از تاریخچه ActionPlan بازیابی شد." : "Operation state was restored from ActionPlan history.";
}

export function backupRequirement(item: ActionCenterItem, isFa: boolean) {
  const value = item.rollback.required ?? item.commandPreview.requiresBackup ?? item.validationJson.requiresBackup;
  if (value === true) return isFa ? "الزامی" : "Required";
  if (value === false) return isFa ? "لازم نیست" : "Not required";
  return isFa ? "ثبت نشده" : "Not specified";
}
