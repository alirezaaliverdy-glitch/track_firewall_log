import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Eye,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { ActionEmptyState, InfoCallout, RiskChip, StatusChip } from "./ActionCenterUi";
import {
  correctActionFields,
  actionExecutionUiState,
  actionPlanStatusLabel,
  getAction,
  getActionAudit,
  getActions,
  normalizeArray,
  normalizeObject,
  quickExecuteLatestAction,
  type ActionAuditEntry,
  type ActionPlan,
  type QuickExecuteError,
  type StructuredValidationError,
} from "@/lib/actions";
import { actionPlanIdFromLocation, actionPlanPath, subscribeToActionPlanCreated } from "@/lib/actionPlanHandoff";
import { actionResultUrl } from "@/lib/actionResultNavigation";
import { useNavigate } from "react-router-dom";

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const ACTIVE_STATUSES = new Set(["proposed", "needs_input", "validation_failed", "awaiting_approval", "dry_run_ready", "approved", "running", "executing", "failed", "blocked", "rollback_needed"]);
const HISTORY_STATUSES = new Set(["succeeded", "rejected", "rolled_back", "cancelled", "expired"]);
const FAILED_STATUSES = new Set(["failed", "validation_failed", "blocked", "rollback_needed"]);
type ActionTab = "active" | "succeeded" | "failed" | "history" | "all";

const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const technicalText = (value: unknown) => String(value ?? "")
  .replace(/dry[_ -]?run/gi, "command plan")
  .replace(/awaiting approval/gi, "ready");

function badgeClass(value: string) {
  if (value === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (value === "executing") return "border-purple-700 bg-purple-950/50 text-purple-200";
  if (value === "high" || value === "failed" || value === "validation_failed") return "border-red-800 bg-red-950/40 text-red-300";
  if (value === "medium" || value === "awaiting_approval" || value === "dry_run_ready") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (value === "approved" || value === "succeeded") return "border-green-800 bg-green-950/40 text-green-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

function statusLabel(value: string, isFa = false, outcome?: string) {
  if (isFa) {
    if (value === "succeeded" && ["verified_no_change", "already_compliant"].includes(String(outcome))) return "تأییدشده بدون تغییر";
    return ({ proposed: "پیشنهادشده", needs_input: "نیازمند اطلاعات", validation_failed: "نامعتبر", awaiting_approval: "منتظر تأیید", dry_run_ready: "پیش‌نمایش آماده", approved: "تأییدشده", running: "در حال اجرا", executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", blocked: "مسدود", rollback_needed: "نیازمند بازگشت", rolled_back: "بازگردانی‌شده", rejected: "ردشده" } as Record<string, string>)[value] ?? value.replace(/_/g, " ");
  }
  if (value === "succeeded" && ["verified_no_change", "already_compliant"].includes(String(outcome))) return "verified, no change";
  return actionPlanStatusLabel(value);
}

function vendorOf(action: ActionPlan) {
  const parameterVendor = String(normalizeObject(action.parametersJson).vendor ?? "").toLowerCase();
  if (parameterVendor) return parameterVendor === "linux_edge" ? "Linux" : parameterVendor;
  const deviceType = String(action.device?.type ?? "").toLowerCase();
  if (deviceType.includes("fortigate") || action.actionType.startsWith("fortigate_")) return "FortiGate";
  if (deviceType.includes("mikrotik") || action.actionType.startsWith("mikrotik_")) return "MikroTik";
  if (deviceType.includes("linux") || action.actionType.startsWith("linux_")) return "Linux Edge";
  return deviceType || "generic";
}

function commandSummary(action: ActionPlan) {
  const dryRun = normalizeObject(action.dryRunJson);
  const commands = Array.from(new Set([...textArray(dryRun.plannedCommands), ...textArray(dryRun.commands), ...textArray(dryRun.cliOutline)]));
  const result = normalizeObject(action.resultJson);
  const executedCommands = normalizeArray<Record<string, unknown>>(result.commands).map((item) => String(item.template ?? item.command ?? "")).filter(Boolean);
  return (executedCommands.length ? executedCommands : commands).slice(0, 3);
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const objectValue = normalizeObject(value);
  const hasContent = Object.keys(objectValue).length > 0;

  return (
    <div className="rounded border border-zinc-800 bg-black/30">
      <div className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-zinc-300">{title}</div>
      <pre className="max-h-56 overflow-auto p-3 text-left text-xs text-zinc-300">
        {hasContent ? technicalText(JSON.stringify(objectValue, null, 2)) : "{}"}
      </pre>
    </div>
  );
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

const EDITABLE_FIX_FIELDS = new Set(["sourceIp", "sourceCidr", "destinationIp", "destinationCidr", "trustedSource", "trustedSourceCidr", "wanInterface", "lanInterface", "srcInterface", "dstInterface", "srcZone", "dstZone", "serviceName", "services", "username", "port", "newPort", "protocol", "schedule", "nat", "logTraffic", "comment"]);

function structuredFieldErrors(action: ActionPlan): StructuredValidationError[] {
  return normalizeArray<Record<string, unknown>>(normalizeObject(action.validationJson).fieldErrors)
    .map((issue) => ({
      field: String(issue.field ?? "parameters"),
      message: String(issue.message ?? "Invalid value."),
      expectedFormat: String(issue.expectedFormat ?? "valid value"),
      currentValue: issue.currentValue ?? null
    }))
    .filter((issue) => issue.field && issue.field !== "parameters");
}

function fixableFields(action: ActionPlan) {
  const validation = normalizeObject(action.validationJson);
  const fields = [...structuredFieldErrors(action).map((issue) => issue.field), ...textArray(validation.missingFields)];
  return Array.from(new Set(fields.filter((field) => EDITABLE_FIX_FIELDS.has(field) && !(
    validation.executionMode === "quick_controlled" && ["trustedSource", "trustedSourceCidr"].includes(field)
  ))));
}

function initialFixValues(action: ActionPlan) {
  const parameters = normalizeObject(action.parametersJson);
  const suggestions = normalizeObject(normalizeObject(action.validationJson).suggestions);
  return Object.fromEntries(fixableFields(action).map((field) => [field, Array.isArray(parameters[field]) ? parameters[field].join(",") : String(parameters[field] ?? suggestions[field] ?? "")]));
}

function fieldLabel(field: string) {
  if (field === "wanInterface") return "WAN/Gateway Interface";
  if (field === "lanInterface") return "LAN/Internal Interface";
  if (field === "trustedSourceCidr" || field === "trustedSource" || field === "allowedSource") return "شبکه مجاز مدیریتی";
  if (field === "sourceIp" || field === "sourceCidr" || field === "srcIp" || field === "ipAddress") return "آدرس IP یا شبکه";
  if (field === "serviceName" || field === "service") return "نام سرویس";
  if (field === "username") return "نام کاربر";
  if (field === "newPort" || field === "toPort") return "پورت جدید";
  if (field === "port") return "پورت";
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

function fieldExample(field: string) {
  if (field === "wanInterface") return "port2, wan1, wan2";
  if (field === "lanInterface") return "port1, internal, lan";
  if (["sourceIp", "srcIp", "ipAddress"].includes(field)) return "مثال: 203.0.113.10";
  if (["sourceCidr", "trustedSourceCidr", "trustedSource", "allowedSource"].includes(field)) return "مثال: 192.0.2.0/24";
  if (field === "serviceName" || field === "service") return "مثال: nginx یا sshd";
  if (field === "username") return "مثال: tavakoli";
  if (["port", "newPort", "toPort"].includes(field)) return "مثال: 2222";
  return field;
}

function friendlyActionReason(action: ActionPlan) {
  const validation = normalizeObject(action.validationJson);
  if (typeof validation.userMessage === "string") return validation.userMessage;
  const text = textArray(validation.errors).join(" ");
  if (/credential/i.test(text)) return "Device credential is missing.";
  if (/device/i.test(text)) return "Device is missing or unavailable.";
  if (/not supported|not in .*catalog|unsupported/i.test(text)) return "This action is not supported yet.";
  if (/reserved|blocked.*port|newPort/i.test(text)) return "Port is blocked by policy or has an invalid value.";
  return "This action cannot execute with its current values.";
}

function isVerifiedGuidedConnectorPlan(action: ActionPlan) {
  const parameters = normalizeObject(action.parametersJson);
  const metadata = normalizeObject(parameters.metadata);
  return metadata.source === "guided_action_wizard"
    && String(metadata.supportState ?? parameters.supportState) === "verified"
    && String(metadata.executionSupport ?? parameters.executionSupport) === "connector"
    && metadata.executable === true;
}

function VendorPlanView({ dryRunJson }: { dryRunJson: Record<string, unknown> }) {
  const vendorPlan = Object.keys(normalizeObject(dryRunJson)).length > 0
    ? dryRunJson
    : normalizeObject(dryRunJson.vendorCommandPlan);
  const commands = Array.from(new Set([...textArray(vendorPlan.plannedCommands), ...textArray(vendorPlan.commands), ...textArray(vendorPlan.cliOutline)]));
  const apiCalls = normalizeArray<Record<string, unknown>>(vendorPlan.apiCalls);
  const warnings = textArray(vendorPlan.warnings);
  const rollbackSteps = textArray(vendorPlan.rollbackSteps);
  const questions = textArray(vendorPlan.questions);
  const missingFields = textArray(vendorPlan.missingFields);

  return (
    <div className="mb-4 rounded-lg border border-blue-900/50 bg-blue-950/10 p-3 text-left">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-blue-100">Generated Command Plan</h4>
          <p className="mt-1 text-xs text-blue-100/70" dir="rtl">این فقط پیش‌نمایش اجرای دستور است. هنوز روی دستگاه اجرا نشده.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded border px-2 py-0.5 text-xs ${badgeClass(String(vendorPlan.status ?? "planned"))}`}>
            {String(vendorPlan.status ?? "planned")}
          </span>
          <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
            {String(vendorPlan.vendor ?? "generic")}
          </span>
          <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
            {String(vendorPlan.transport ?? "manual")}
          </span>
        </div>
      </div>

      {missingFields.length > 0 && (
        <div className="mb-3 rounded border border-yellow-900/70 bg-yellow-950/20 p-3">
          <p className="text-xs font-semibold text-yellow-100">Needs clarification</p>
          <p className="mt-1 text-xs text-yellow-100/75">Missing: {missingFields.join(", ")}</p>
          <ul className="mt-2 space-y-1 text-xs text-yellow-100/80">
            {questions.map((question) => <li key={question}>- {question}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-3 rounded border border-yellow-900/70 bg-yellow-950/20 p-3">
          <p className="text-xs font-semibold text-yellow-100">Warnings</p>
          <ul className="mt-2 space-y-1 text-xs text-yellow-100/80">
            {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
          </ul>
        </div>
      )}

      {commands.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-semibold text-zinc-300">Template Commands</p>
          <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
            {commands.join("\n")}
          </pre>
        </div>
      )}

      {commands.length === 0 && apiCalls.length === 0 && (
        <p className="rounded border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-500">
          The command plan is generated automatically when you select Execute.
        </p>
      )}

      {apiCalls.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-semibold text-zinc-300">Template API Calls</p>
          <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
            {JSON.stringify(apiCalls, null, 2)}
          </pre>
        </div>
      )}

      {rollbackSteps.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-300">Rollback Steps</p>
          <ul className="space-y-1 text-xs text-zinc-400">
            {rollbackSteps.map((step) => <li key={step}>- {step}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ValidationSummary({ action }: { action: ActionPlan }) {
  const validation = normalizeObject(action.validationJson);
  const errors = textArray(validation.errors);
  const warnings = textArray(validation.warnings);
  const missingFields = textArray(validation.missingFields);
  const policyGuard = normalizeObject(validation.policyGuard);
  const exactReason = String(validation.exactReason ?? validation.policyGuardError ?? validation.compilerError ?? "");
  const fieldErrors = structuredFieldErrors(action);

  if (errors.length === 0 && warnings.length === 0 && !exactReason && Object.keys(policyGuard).length === 0) return null;

  return (
    <div className="mb-4 rounded border border-red-900/60 bg-red-950/10 p-3 text-left">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded border px-2 py-0.5 ${badgeClass(String(validation.valid === false ? "validation_failed" : "ready"))}`}>
          stage: {String(validation.stage ?? "validation").replace("dry_run", "command plan").replace(/_/g, " ")}
        </span>
        <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-zinc-300">
          {String(validation.vendor ?? vendorOf(action))}
        </span>
        <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-zinc-300">
          {String(validation.actionType ?? action.actionType)}
        </span>
      </div>
      {exactReason && <p className="mt-3 text-sm font-semibold text-red-100">{exactReason}</p>}
      {missingFields.length > 0 && <p className="mt-2 text-xs text-yellow-100">Missing: {missingFields.join(", ")}</p>}
      {fieldErrors.length > 0 && (
        <div className="mt-3 space-y-2">
          {fieldErrors.map((issue, index) => (
            <div key={`${issue.field}-${index}`} className="rounded border border-red-900/60 bg-black/20 p-2 text-xs">
              <p className="font-semibold text-red-100">{issue.field}: {issue.message}</p>
              <p className="mt-1 text-zinc-400">Expected: {issue.expectedFormat}</p>
              <p className="mt-1 text-zinc-500">Current: {issue.currentValue === null || issue.currentValue === "" ? "empty" : JSON.stringify(issue.currentValue)}</p>
            </div>
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-100/85">
          {errors.map((error) => <li key={error}>- {error}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-yellow-100/85">
          {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
        </ul>
      )}
      {Object.keys(policyGuard).length > 0 && (
        <pre className="mt-3 max-h-40 overflow-auto rounded border border-zinc-800 bg-black/30 p-2 text-xs text-zinc-300">
          {JSON.stringify(policyGuard, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PlanSummary({ plan }: { plan: ActionPlan }) {
  const params = normalizeObject(plan.parametersJson);
  const port = params.port ?? params.fromPort ?? params.toPort;
  const ip = params.srcIp ?? params.sourceIp ?? params.ip ?? params.address ?? params.mappedIp;
  const sshPortChange = plan.actionType === "mikrotik_change_service_port" && params.service === "ssh";

  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
      <span>{plan.device?.name ?? plan.deviceId ?? "No device selected"}</span>
      {plan.device?.host ? <span className="font-mono">{plan.device.host}</span> : null}
      {ip ? <span className="font-mono">ip: {String(ip)}</span> : null}
      {port ? <span className="font-mono">port: {String(port)}</span> : null}
      {sshPortChange ? <span className="font-mono">new SSH port: {String(params.newPort ?? params.port ?? "missing")}</span> : null}
      {sshPortChange && params.oldPort ? <span className="font-mono">current SSH port: {String(params.oldPort)}</span> : null}
      {sshPortChange ? <span className="font-mono">trusted source: {String(params.trustedSource ?? params.trustedSourceIp ?? params.trustedSourceCidr ?? "missing")}</span> : null}
      {params.executionSupport ? <span>support: {String(params.executionSupport).replace(/_/g, " ")}</span> : null}
    </div>
  );
}

function actionLabel(action: ActionPlan) {
  const params = normalizeObject(action.parametersJson);
  const metadata = normalizeObject(params.metadata);
  if (metadata.source === "guided_action_wizard") {
    return String(metadata.actionType ?? params.blueprintId ?? action.actionType).replace(/_/g, " ");
  }
  if (action.actionType === "custom_vendor_action" || action.actionType === "generic_security_action") {
    return String(params.requestedOperation ?? "Proposed Action");
  }
  if (action.actionType === "mikrotik_change_service_port" && params.service === "ssh") {
    const oldPort = params.oldPort ?? params.currentPort;
    const newPort = params.newPort ?? params.port;
    return oldPort && newPort
      ? `Change MikroTik SSH port from ${String(oldPort)} to ${String(newPort)}`
      : `Change MikroTik SSH port to ${String(newPort ?? "new port")}`;
  }
  return action.actionType
    .replace(/^(mikrotik|fortigate|linux)_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ProposalDetails({ action }: { action: ActionPlan }) {
  const params = normalizeObject(action.parametersJson);
  const metadata = normalizeObject(params.metadata);
  if (metadata.source === "guided_action_wizard") {
    const missingTemplates = textArray(metadata.missingTemplates ?? params.missingTemplates);
    const preview = normalizeObject(params.structuredPreview ?? normalizeObject(action.dryRunJson).preview);
    const rows = [
      ["وضعیت", metadata.implementationState ?? params.implementationState],
      ["پشتیبانی اجرا", metadata.executionSupport ?? params.executionSupport],
      ["دلیل", metadata.reasonFa ?? params.reasonFa],
      ["قابلیت اجرا", metadata.executable === false || params.executable === false ? "این اکشن هنوز اجرای واقعی کامل ندارد." : "قابل اجرا"],
      ["Blueprint", metadata.blueprintId ?? params.blueprintId],
      ["Connector", metadata.connectorType ?? params.connectorType],
      ["Missing templates", missingTemplates.join(" | ")],
      ["Verification", textArray(params.verificationPlan ?? normalizeObject(action.dryRunJson).verificationPlan).join(" | ")],
      ["Rollback", textArray(params.rollbackPlan ?? normalizeObject(action.dryRunJson).rollbackPlan).join(" | ")]
    ].filter(([, value]) => String(value ?? "").trim());
    return (
      <div className="mb-4 rounded border border-yellow-900/70 bg-yellow-950/15 p-3 text-right" dir="rtl">
        <h4 className="text-sm font-semibold text-yellow-100">این اکشن هنوز اجرای واقعی کامل ندارد.</h4>
        <dl className="mt-2 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={String(label)}>
              <dt className="font-semibold text-zinc-500">{String(label)}</dt>
              <dd className="mt-0.5 break-words">{String(value)}</dd>
            </div>
          ))}
        </dl>
        {Object.keys(preview).length > 0 && (
          <pre className="mt-3 max-h-64 overflow-auto rounded border border-yellow-900/50 bg-black/30 p-2 text-left text-[11px] text-zinc-300" dir="ltr">
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </div>
    );
  }
  if (action.actionType !== "custom_vendor_action" && action.actionType !== "generic_security_action") return null;
  const rows = [
    ["Execution support", params.executionSupport],
    ["Expected impact", params.expectedImpact],
    ["Missing fields", textArray(params.missingFields).join(", ")],
    ["Suggested prechecks", textArray(params.suggestedPrechecks).join(" | ")],
    ["Suggested verification", textArray(params.suggestedVerification).join(" | ")],
    ["Suggested rollback", textArray(params.suggestedRollback).join(" | ")]
  ].filter(([, value]) => String(value ?? "").trim());
  return (
    <div className="mb-4 rounded border border-yellow-900/70 bg-yellow-950/15 p-3 text-left">
      <h4 className="text-sm font-semibold text-yellow-100">Proposed Action</h4>
      <dl className="mt-2 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={String(label)}>
            <dt className="font-semibold text-zinc-500">{String(label)}</dt>
            <dd className="mt-0.5">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function sourceLabel(source: string, action?: ActionPlan) {
  if (normalizeObject(normalizeObject(action?.parametersJson).metadata).source === "command_catalog") return "کاتالوگ دستور";
  if (source === "ai") return "AI Assistant";
  if (source === "detection") return "Detection";
  if (source === "user") return "Manual";
  return source;
}

function actionMatchesFilter(action: ActionPlan, filter: string) {
  if (filter === "all") return true;
  const actionType = action.actionType.toLowerCase();
  const deviceType = String(action.device?.type ?? "").toLowerCase();
  if (filter === "fortigate") return actionType.includes("fortigate") || deviceType.includes("fortigate");
  if (filter === "mikrotik") return actionType.includes("mikrotik") || deviceType.includes("mikrotik");
  if (filter === "linux") return deviceType.includes("linux");
  if (filter === "firewall") return actionType.includes("firewall") || actionType.includes("filter") || actionType.includes("address_list") || actionType.includes("block");
  if (filter === "nat") return actionType.includes("nat");
  if (filter === "management") return actionType.includes("service") || actionType.includes("interface") || actionType.includes("route") || actionType.includes("reboot");
  if (filter === "critical") return action.riskLevel === "critical";
  return true;
}

function tabForPlan(action: ActionPlan): ActionTab {
  if (action.status === "succeeded") return "succeeded";
  if (FAILED_STATUSES.has(action.status)) return "failed";
  if (HISTORY_STATUSES.has(action.status)) return "history";
  return "active";
}

function revisionOf(action: ActionPlan) {
  const metadata = normalizeObject(normalizeObject(action.parametersJson).metadata);
  const approval = normalizeObject(action.approvalJson);
  const revision = Number(metadata.planRevision ?? approval.planRevision ?? metadata.revision ?? approval.revision);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

type SelectedActionError = { code: string; message: string; actionPlanId: string };
type ActionUiError = { code: string; retryable: boolean; recovery: string | null; currentRevision: number | null; approvedRevision: number | null; changedFields: string[] };

export default function ActionCenterPanel({ initialActionPlanId }: { initialActionPlanId?: string }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isFa = i18n.language?.startsWith("fa") ?? false;
  const copy = isFa ? {
    eyebrow: "عملیات پاسخ", title: "مرکز اقدام", subtitle: "اقدام‌های امنیتی کنترل‌شده را بازبینی و اجرا کنید.", refresh: "تازه‌سازی", refreshing: "در حال تازه‌سازی...", clear: "پاک‌کردن نما", lastRefresh: "آخرین تازه‌سازی", plans: "برنامه‌های اقدام", activeReview: "در انتظار بازبینی", latest: "آخرین وضعیت", mode: "حالت اجرا", controlled: "قالب‌های کنترل‌شده", scope: "دامنه", topic: "موضوع", action: "اقدام", status: "وضعیت", risk: "ریسک", source: "منبع", created: "ایجاد", updated: "به‌روزرسانی", details: "جزئیات", close: "بستن", revision: "نسخه", vendor: "وندور", target: "دستگاه مقصد", connector: "کانکتور", template: "قالب", parameters: "پارامترها", verification: "راستی‌آزمایی", audit: "خط زمانی ممیزی", execute: "تأیید و اجرا", return: "بازگشت به مرکز اقدام", none: "هیچ", platform: "پلتفرم"
  } : {
    eyebrow: "Response operations", title: "Action Center", subtitle: "Review and execute controlled security actions.", refresh: "Refresh", refreshing: "Refreshing...", clear: "Clear view", lastRefresh: "Last refreshed", plans: "Action plans", activeReview: "Active review", latest: "Latest status", mode: "Execution mode", controlled: "Controlled templates", scope: "Scope", topic: "Topic", action: "Action", status: "Status", risk: "Risk", source: "Source", created: "Created", updated: "Updated", details: "Details", close: "Close", revision: "Revision", vendor: "Vendor", target: "Target device", connector: "Connector", template: "Template", parameters: "Parameters", verification: "Verification", audit: "Audit timeline", execute: "Confirm & Execute", return: "Return to Action Center", none: "none", platform: "Platform"
  };
  copy.plans = t("actionCenter.summary.plans");
  copy.activeReview = t("actionCenter.summary.activeReview");
  copy.latest = t("actionCenter.summary.latestStatus");
  copy.mode = t("actionCenter.summary.executionMode");
  const [actions, setActions] = useState<ActionPlan[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionPlan | null>(null);
  const [auditEntries, setAuditEntries] = useState<ActionAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<SelectedActionError | null>(null);
  const [actionError, setActionError] = useState<ActionUiError | null>(null);
  const [fieldFixes, setFieldFixes] = useState<Record<string, string>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<ActionTab>(() => {
    const showHistory = window.localStorage.getItem("showHistoryOnStartup") === "true";
    return showHistory ? "history" : "active";
  });
  const [hiddenCompletedIds, setHiddenCompletedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("hiddenCompletedActionPlanIds") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const refreshActions = useCallback((selectedId?: string) => {
    setLoading(true);
    setMessage(null);
    setActions([]);
    setSelectedAction(null);
    setAuditEntries([]);
    setSelectedError(null);
    setActionError(null);
    setLastRefreshedAt(null);
    return getActions()
      .then(async (nextActions) => {
        const normalizedActions = normalizeArray<ActionPlan>(nextActions);
        setActions(normalizedActions);
        setLastRefreshedAt(new Date().toISOString());
        if (selectedId) {
          try {
            const plan = await getAction(selectedId);
            const audit = await getActionAudit(selectedId);
            setActions((current) => current.some((action) => action.id === plan.id) ? current : [plan, ...current]);
            setSelectedAction(plan);
            setFieldFixes(initialFixValues(plan));
            setAuditEntries(normalizeArray<ActionAuditEntry>(audit));
            setFilter("all");
            setTab(tabForPlan(plan));
            window.setTimeout(() => {
              const row = document.getElementById(`action-row-${plan.id}`);
              row?.scrollIntoView({ behavior: "smooth", block: "center" });
              row?.focus({ preventScroll: true });
            }, 20);
          } catch {
            setSelectedError({
              code: "ACTION_PLAN_NOT_FOUND",
              message: "The requested ActionPlan does not exist or is no longer available.",
              actionPlanId: selectedId,
            });
          }
        }
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load action plans."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refreshActions(initialActionPlanId ?? actionPlanIdFromLocation());
  }, [initialActionPlanId, refreshActions]);

  useEffect(() => {
    return subscribeToActionPlanCreated((id) => {
      navigate(actionPlanPath(id));
      void refreshActions(id);
    });
  }, [navigate, refreshActions]);

  const safeActions = useMemo(() => normalizeArray<ActionPlan>(actions), [actions]);
  const hiddenSet = useMemo(() => new Set(hiddenCompletedIds), [hiddenCompletedIds]);
  const tabActions = useMemo(() => safeActions.filter((action) => {
    if (tab !== "history" && hiddenSet.has(action.id)) return false;
    if (tab === "active") return ACTIVE_STATUSES.has(action.status);
    if (tab === "succeeded") return action.status === "succeeded";
    if (tab === "history") return HISTORY_STATUSES.has(action.status) || !ACTIVE_STATUSES.has(action.status);
    if (tab === "failed") return FAILED_STATUSES.has(action.status);
    return true;
  }), [hiddenSet, safeActions, tab]);
  const visibleActions = useMemo(() => tabActions.filter((action) => actionMatchesFilter(action, filter)), [tabActions, filter]);
  const safeAudit = useMemo(() => normalizeArray<ActionAuditEntry>(auditEntries), [auditEntries]);
  const executionUi = selectedAction ? actionExecutionUiState(selectedAction) : { canExecute: false, reason: null };

  const reloadSelected = (id: string) => {
    return Promise.all([getAction(id), getActionAudit(id)]).then(([plan, audit]) => {
      setSelectedAction(plan);
      setAuditEntries(normalizeArray<ActionAuditEntry>(audit));
      setActions((current) => {
        const exists = current.some((action) => action.id === plan.id);
        return exists ? current.map((action) => action.id === plan.id ? plan : action) : [plan, ...current];
      });
      return plan;
    });
  };

  const showActionError = (error: unknown, fallback: string) => {
    const apiError = error as QuickExecuteError;
    setMessage(error instanceof Error ? error.message : fallback);
    setActionError(apiError.code ? {
      code: apiError.code,
      retryable: apiError.retryable === true,
      recovery: apiError.recovery ?? null,
      currentRevision: apiError.currentRevision ?? null,
      approvedRevision: apiError.approvedRevision ?? null,
      changedFields: apiError.changedFields ?? [],
    } : null);
  };

  const openAction = (action: ActionPlan) => {
    navigate(actionPlanPath(action.id));
    setDetailsLoading(true);
    setMessage(null);
    setActionError(null);
    setSelectedAction(null);
    setAuditEntries([]);
    reloadSelected(action.id)
      .then((plan) => setFieldFixes(initialFixValues(plan)))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Failed to load action details."))
      .finally(() => setDetailsLoading(false));
  };

  const closeSelectedAction = () => {
    setSelectedAction(null);
    setAuditEntries([]);
    navigate("/actions");
  };

  const runPlanStep = (label: string, operation: (id: string) => Promise<ActionPlan>) => {
    if (!selectedAction) return;
    setWorking(label);
    setMessage(null);
    operation(selectedAction.id)
      .then((plan) => {
        setSelectedAction(plan);
        setFieldFixes(initialFixValues(plan));
        setActions((current) => current.map((action) => action.id === plan.id ? plan : action));
        return getActionAudit(plan.id);
      })
      .then((audit) => setAuditEntries(normalizeArray<ActionAuditEntry>(audit)))
      .then(() => setLastRefreshedAt(new Date().toISOString()))
      .catch((error: unknown) => {
        const withPlan = error as Error & { plan?: ActionPlan };
        if (withPlan.plan) {
          setSelectedAction(withPlan.plan);
          setFieldFixes(initialFixValues(withPlan.plan));
          setActions((current) => current.map((action) => action.id === withPlan.plan?.id ? withPlan.plan : action) as ActionPlan[]);
        }
        setMessage(error instanceof Error ? error.message : `Failed to ${label}.`);
      })
      .finally(() => setWorking(null));
  };

  const executeSelected = () => {
    if (!selectedAction) return;
    setWorking("execute"); setMessage(null); setActionError(null);
    setSelectedAction((current) => current ? { ...current, status: "executing" } : current);
    quickExecuteLatestAction(selectedAction.id, { intent: "execute", reason: "Execute from Action Center" }).then((plan) => {
      const metadata = normalizeObject(normalizeObject(plan.parametersJson).metadata);
      if (plan.status === "succeeded" && normalizeObject(plan.resultJson).executed === true && metadata.connectorInvoked === true) {
        setSelectedAction(plan);
        setActions((current) => current.map((item) => item.id === plan.id ? plan : item));
        void getActionAudit(plan.id).then((audit) => setAuditEntries(normalizeArray<ActionAuditEntry>(audit)));
        navigate(actionResultUrl(plan.id));
      }
      else { setSelectedAction(plan); setMessage(plan.status === "dry_run_ready" || metadata.connectorInvoked !== true ? "این دستور فقط پیش‌نمایش ساخته و هنوز روی دستگاه اجرا نشده است." : String(normalizeObject(plan.resultJson).message ?? "اجرای واقعی دستور کامل نشد.")); }
    }).catch((error: unknown) => { void reloadSelected(selectedAction.id); showActionError(error, isFa ? "اجرای دستور ناموفق بود." : "Action execution failed."); }).finally(() => setWorking(null));
  };

  const executeFromList = (action: ActionPlan) => {
    setSelectedAction(action);
    setMessage(null);
    setActionError(null);
    navigate(actionPlanPath(action.id));
  };

  const saveAndExecuteFixedFields = () => {
    if (!selectedAction) return;
    const fields = Object.fromEntries(Object.entries(fieldFixes).map(([field, rawValue]) => {
      const value = rawValue.trim();
      if (field === "port" || field === "newPort") return [field, /^\d+$/.test(value) ? Number(value) : value];
      if (field === "services") return [field, value.split(",").map((item) => item.trim()).filter(Boolean)];
      if (field === "nat" || field === "logTraffic") return [field, value.toLowerCase() === "true"];
      return [field, value];
    }));
    runPlanStep("save-and-execute", async (id) => {
      const corrected = await correctActionFields(id, fields);
      if (corrected.status === "validation_failed") return corrected;
      return quickExecuteLatestAction(id, { intent: "execute", reason: "Execute from Action Center" });
    });
  };

  const clearActionCenterView = () => {
    const next = Array.from(new Set([
      ...hiddenCompletedIds,
      ...visibleActions.map((action) => action.id)
    ]));
    setHiddenCompletedIds(next);
    setSelectedAction(null);
    setAuditEntries([]);
    setMessage("Action Center is clear. New actions will appear here.");
    window.localStorage.setItem("hiddenCompletedActionPlanIds", JSON.stringify(next));
  };

  const showHiddenCompleted = () => {
    setHiddenCompletedIds([]);
    window.localStorage.removeItem("hiddenCompletedActionPlanIds");
    setMessage("Hidden completed action plans are visible again.");
  };

  const totalOpen = safeActions.filter((action) => ACTIVE_STATUSES.has(action.status)).length;
  const filtersActive = filter !== "all";
  const emptyCopy = safeActions.length === 0
    ? { title: "No action plans yet", description: "Create a request to generate the first controlled action." }
    : filtersActive
      ? { title: "No action plans match the current filters", description: "Adjust or clear filters to view available actions." }
      : hiddenCompletedIds.length > 0 && tab !== "history"
        ? { title: "No records for the selected scope", description: "New actions will appear here when generated." }
        : { title: "No records for the selected scope", description: "New actions will appear here when generated." };

  return (
    <section id="action-center" className="action-center-panel mb-5 scroll-mt-4" dir={isFa ? "rtl" : "ltr"}>
      <div className="action-center-header">
        <div>
          <span className="action-center-eyebrow"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> {copy.eyebrow}</span>
          <h2 className="mt-2 text-left text-xl font-semibold tracking-tight text-slate-50">
            {copy.title}
          </h2>
          <p className="mt-1 text-left text-sm text-slate-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void refreshActions(); }}
          className="action-utility-button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? copy.refreshing : copy.refresh}
        </button>
        <button
          type="button"
          onClick={clearActionCenterView}
          className="action-utility-button"
        >
          {copy.clear}
        </button>
        </div>
      </div>

      <p className="mb-3 text-left text-[11px] text-slate-500">
        {copy.lastRefresh}: {formatDateTime(lastRefreshedAt)}
      </p>

      <InfoCallout isFa={isFa} />

      <div className="action-summary-strip">
        <div>
          <p className="text-xs text-zinc-500">{copy.plans}</p>
          <p className="mt-1 text-xl font-semibold text-blue-100">{safeNumber(safeActions.length).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">{copy.activeReview}</p>
          <p className="mt-1 text-xl font-semibold text-yellow-100">{safeNumber(totalOpen).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">{copy.latest}</p>
          <div className="mt-2">{safeActions[0] ? <StatusChip status={safeActions[0].status} label={statusLabel(safeActions[0].status, isFa, String(normalizeObject(safeActions[0].resultJson).outcome ?? ""))} /> : <span className="text-xs text-slate-500">{copy.none}</span>}</div>
        </div>
        <div>
          <p className="text-xs text-zinc-500">{copy.mode}</p>
          <p className="mt-2 text-xs font-medium text-cyan-200">{copy.controlled}</p>
        </div>
      </div>

      <div className="action-toolbar">
      <div className="action-filter-group">
        <span className="action-filter-label">{copy.scope}</span>
        {(["active", "succeeded", "failed", "history", "all"] as ActionTab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`action-filter-chip capitalize ${tab === item ? "is-active" : ""}`}
          >
            {isFa ? ({ active: "فعال", succeeded: "موفق", failed: "ناموفق", history: "تاریخچه", all: "همه" } as Record<string, string>)[item] : item}
          </button>
        ))}
        {tab === "history" && hiddenCompletedIds.length > 0 && (
          <button
            type="button"
            onClick={showHiddenCompleted}
            className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 hover:text-blue-200"
          >
            Show hidden completed
          </button>
        )}
      </div>

      <div className="action-filter-group">
        <span className="action-filter-label">{copy.topic}</span>
        {["all", "fortigate", "mikrotik", "linux", "firewall", "nat", "management", "critical"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`action-filter-chip ${filter === item ? "is-active" : ""}`}
          >
            {item === "all" ? t("actionCenter.filters.all") : item}
          </button>
        ))}
      </div>
      </div>

      <div className="action-table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/70 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">{copy.action}</th>
                <th className="px-3 py-2 font-medium">{copy.status}</th>
                <th className="px-3 py-2 font-medium">{copy.risk}</th>
                <th className="px-3 py-2 font-medium">{copy.source}</th>
                <th className="px-3 py-2 font-medium">{copy.created}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">Loading action plans...</td>
                </tr>
              ) : visibleActions.length === 0 ? (
                <tr>
                  <td colSpan={6}><ActionEmptyState title={emptyCopy.title} description={emptyCopy.description} action={filtersActive ? <button type="button" className="action-clear-filter" onClick={() => setFilter("all")}>Clear filters</button> : undefined} /></td>
                </tr>
              ) : (
                visibleActions.map((action) => (
                  <tr
                    key={action.id}
                    id={`action-row-${action.id}`}
                    tabIndex={-1}
                    aria-selected={selectedAction?.id === action.id}
                    className={`action-table-row text-zinc-300 ${selectedAction?.id === action.id ? "is-selected" : ""}`}
                  >
                    <td className="min-w-72 px-3 py-2">
                      <p className="font-medium text-zinc-100">{actionLabel(action)}</p>
                      <PlanSummary plan={action} />
                      <p className="mt-1 text-xs text-zinc-500">vendor: {vendorOf(action)}</p>
                      {commandSummary(action).length > 0 ? (
                        <pre className="mt-2 max-h-16 overflow-auto rounded border border-zinc-800 bg-black/30 p-2 text-[11px] text-zinc-400">
                          {commandSummary(action).join("\n")}
                        </pre>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-600">{t("actionCenter.commandGeneratedOnExecute")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={action.status} label={statusLabel(action.status, isFa, String(normalizeObject(action.resultJson).outcome ?? ""))} />
                      {action.status === "succeeded" || action.status === "failed" ? (
                        <p className="mt-1 text-xs text-zinc-500">{formatDateTime(action.updatedAt)}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <RiskChip risk={action.riskLevel} label={isFa ? ({ low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" } as Record<string, string>)[action.riskLevel] : undefined} />
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{sourceLabel(action.source, action)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                      <p>{formatDateTime(action.createdAt)}</p>
                      <p className="mt-1 text-zinc-600">updated {formatDateTime(action.updatedAt)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[230px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                      {actionExecutionUiState(action).canExecute && (
                        <button
                          type="button"
                          aria-label={copy.execute}
                          onClick={() => executeFromList(action)}
                          disabled={Boolean(working)}
                          className="inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded border border-green-800 bg-green-950/30 px-3 text-xs font-semibold text-green-200 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {copy.execute}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openAction(action)}
                        className="inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 transition-colors hover:text-blue-200"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.details}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-left text-sm font-semibold text-zinc-100">{actionLabel(selectedAction)}</h3>
                <p className="mt-0.5 text-left text-xs text-zinc-500">
                  {selectedAction.device?.name ?? selectedAction.deviceId ?? (isFa ? "دستگاهی انتخاب نشده" : "No device selected")} · {selectedAction.id}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {executionUi.canExecute && (
                  <button
                    type="button"
                    aria-label={copy.execute}
                    onClick={executeSelected}
                    disabled={Boolean(working) || detailsLoading}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-green-900/70 px-2.5 text-xs font-medium text-green-300 hover:text-green-200 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {copy.execute}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSelectedAction}
                  className="h-8 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:text-zinc-100"
                >
                  {copy.close}
                </button>
              </div>
            </div>

            <div className="max-h-[76vh] overflow-y-auto p-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.status}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{statusLabel(selectedAction.status, isFa, String(normalizeObject(selectedAction.resultJson).outcome ?? ""))}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.risk}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{selectedAction.riskLevel}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.created}</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedAction.createdAt)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.updated}</p>
                  <p className="mt-1 text-xs text-zinc-300">{formatDateTime(selectedAction.updatedAt)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.vendor}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{vendorOf(selectedAction)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.source}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{sourceLabel(selectedAction.source, selectedAction)}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.revision}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{revisionOf(selectedAction) ?? (isFa ? "بدون نسخه" : "unversioned")}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.platform}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{String(normalizeObject(normalizeObject(selectedAction.parametersJson).metadata).resolvedPlatform ?? selectedAction.device?.type ?? "-")}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.connector}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{String(normalizeObject(normalizeObject(selectedAction.parametersJson).metadata).connectorType ?? "-")}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.template}</p>
                  <p className="mt-1 break-all text-xs font-semibold text-zinc-100">{String(normalizeObject(normalizeObject(selectedAction.parametersJson).metadata).executionTemplateRef ?? "-")}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-black/30 p-3">
                  <p className="text-xs text-zinc-500">{copy.verification}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{normalizeObject(selectedAction.resultJson).connectorInvoked === true ? (isFa ? "کانکتور اجرا و نتیجه ثبت شد" : "Connector invoked and result recorded") : (isFa ? "هنوز تأیید نشده" : "Not yet verified")}</p>
                </div>
              </div>

              {(selectedAction.status === "succeeded" || selectedAction.status === "failed") && (
                <div className={`mb-4 rounded border p-3 text-left ${selectedAction.status === "succeeded" ? "border-green-900/70 bg-green-950/20" : "border-red-900/70 bg-red-950/20"}`}>
                  <p className="text-sm font-semibold text-zinc-100">
                    {isFa ? `اجرا ${selectedAction.status === "succeeded" ? "موفق" : "ناموفق"} در ${formatDateTime(selectedAction.updatedAt)}` : `Execution ${selectedAction.status === "succeeded" ? "succeeded" : "failed"} at ${formatDateTime(selectedAction.updatedAt)}`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-300">{copy.target}: {selectedAction.device?.name ?? selectedAction.deviceId ?? "unknown"} - {copy.vendor}: {vendorOf(selectedAction)}</p>
                  {commandSummary(selectedAction).length > 0 && (
                    <pre className="mt-2 max-h-32 overflow-auto rounded border border-zinc-800 bg-black/30 p-2 text-xs text-zinc-300">
                      {commandSummary(selectedAction).join("\n")}
                    </pre>
                  )}
                  {selectedAction.status === "failed" && (
                    <p className="mt-2 text-xs text-red-200">
                      {String(normalizeObject(selectedAction.resultJson).message ?? normalizeObject(selectedAction.resultJson).error ?? "Execution failed.")}
                    </p>
                  )}
                </div>
              )}

              {selectedAction.status === "validation_failed" && (
                <div className="mb-4 rounded border border-red-900/60 bg-red-950/10 p-3 text-left text-sm font-semibold text-red-100">
                  {friendlyActionReason(selectedAction)}
                </div>
              )}

              {!executionUi.canExecute && executionUi.reason && selectedAction.status !== "validation_failed" && (
                <div className="mb-4 rounded border border-yellow-900/70 bg-yellow-950/20 p-3 text-left text-sm font-semibold text-yellow-100">
                  {executionUi.reason}
                </div>
              )}

              {executionUi.canExecute && isVerifiedGuidedConnectorPlan(selectedAction) && (
                <div className="mb-4 rounded border border-emerald-900/70 bg-emerald-950/20 p-3 text-left text-sm font-semibold text-emerald-100">
                  Ready for real connector execution after Quick Controlled confirmation and PolicyGuard validation.
                </div>
              )}

              {executionUi.canExecute && (
                <div className="mb-4 rounded border border-yellow-900/60 bg-yellow-950/15 p-3 text-left text-xs font-medium text-yellow-100">
                  Backup is disabled for Quick Controlled execution.
                </div>
              )}

              <ProposalDetails action={selectedAction} />

              {fixableFields(selectedAction).length > 0 && !["executing", "succeeded", "rolled_back"].includes(selectedAction.status) && (
                <div className="mb-4 rounded border border-blue-900/70 bg-blue-950/15 p-3 text-left">
                  <h4 className="text-sm font-semibold text-blue-100">Fix Fields</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {fixableFields(selectedAction).map((field) => {
                      const issue = structuredFieldErrors(selectedAction).find((item) => item.field === field);
                      return (
                        <label key={field} className="text-xs text-zinc-300">
                          <span className="font-semibold">{fieldLabel(field)}</span>
                          <input
                            value={fieldFixes[field] ?? ""}
                            onChange={(event) => setFieldFixes((current) => ({ ...current, [field]: event.target.value }))}
                            className="mt-1 h-9 w-full rounded border border-blue-900/60 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-blue-600"
                            placeholder={fieldExample(field)}
                          />
                          {issue && <span className="mt-1 block text-zinc-500">فرمت مورد انتظار: {issue.expectedFormat} — {fieldExample(field)}</span>}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={saveAndExecuteFixedFields}
                    disabled={Boolean(working)}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded border border-blue-800 bg-blue-950/30 px-3 text-xs font-semibold text-blue-200 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Fix Fields &amp; Execute
                  </button>
                </div>
              )}

              <details className="mb-4 rounded border border-zinc-800 bg-black/20 p-3 text-left">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-200">{copy.details}</summary>
                <div className="mt-3">
                  <CatalogExecutionDebug action={selectedAction} />
                  <ValidationSummary action={selectedAction} />
                  <div className="mb-4 grid gap-3 lg:grid-cols-2">
                    <JsonBlock title="Normalized parameters" value={selectedAction.parametersJson} />
                    <JsonBlock title="Validation / debug" value={selectedAction.validationJson} />
                    <JsonBlock title="Connector output" value={selectedAction.resultJson} />
                    <JsonBlock title="Rollback info" value={selectedAction.rollbackJson} />
                  </div>
                  <VendorPlanView dryRunJson={normalizeObject(selectedAction.dryRunJson)} />
                  <h4 className="mb-2 text-left text-sm font-semibold text-zinc-100">{copy.audit}</h4>
                  <div className="rounded border border-zinc-800 bg-black/20">
                {safeAudit.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500">No audit entries found.</p>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {safeAudit.map((entry) => (
                      <div key={entry.id} className="p-3 text-left">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold text-zinc-200">{technicalText(entry.eventType)}</p>
                          <p className="text-[11px] text-zinc-500">{formatDateTime(entry.createdAt)}</p>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{technicalText(entry.message || "No audit message.")}</p>
                        {Object.keys(normalizeObject(entry.metadataJson)).length > 0 && (
                          <pre className="mt-2 max-h-36 overflow-auto rounded border border-zinc-800 bg-black/30 p-2 text-[11px] text-zinc-400">
                            {technicalText(JSON.stringify(normalizeObject(entry.metadataJson), null, 2))}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {selectedError && (
        <div className="mt-3 rounded border border-red-900/70 bg-red-950/20 p-3 text-left" role="alert" aria-live="assertive">
          <p className="text-xs font-semibold text-red-200">{selectedError.code}</p>
          <p className="mt-1 text-sm text-zinc-200">{selectedError.message}</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500">ActionPlan: {selectedError.actionPlanId}</p>
          <button
            type="button"
            className="mt-3 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100"
            onClick={() => {
              setSelectedError(null);
              navigate("/actions");
            }}
          >
            {copy.return}
          </button>
        </div>
      )}

      {actionError && (
        <div className="mt-3 rounded border border-amber-900/70 bg-amber-950/20 p-3 text-left" role="alert" aria-live="assertive">
          <p className="text-xs font-semibold text-amber-200">{actionError.code}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-300">
            <span>{isFa ? "قابل تلاش مجدد" : "Retryable"}: {actionError.retryable ? (isFa ? "بله" : "yes") : (isFa ? "خیر" : "no")}</span>
            {actionError.recovery && <span>{isFa ? "راه بازیابی" : "Recovery"}: {actionError.recovery}</span>}
            {actionError.currentRevision && <span>{isFa ? "نسخه فعلی" : "Current revision"}: {actionError.currentRevision}</span>}
            {actionError.approvedRevision && <span>{isFa ? "نسخه تأییدشده" : "Approved revision"}: {actionError.approvedRevision}</span>}
          </div>
          {actionError.changedFields.length > 0 && <p className="mt-2 text-xs text-zinc-400">{isFa ? "فیلدهای تغییرکرده" : "Changed fields"}: {actionError.changedFields.join(", ")}</p>}
          {selectedAction && actionError.recovery === "CREATE_NEW_REVISION" && (
            <button type="button" className="mt-3 rounded border border-amber-800 px-3 py-1.5 text-xs text-amber-200" onClick={() => { setActionError(null); void reloadSelected(selectedAction.id); }}>
              {isFa ? "بازبینی و ساخت نسخه جدید" : "Review and create a new revision"}
            </button>
          )}
        </div>
      )}

      {message && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-left text-xs text-zinc-400" role="status" aria-live="polite">
          <p>{message}</p>
        </div>
      )}
    </section>
  );
}

function CatalogExecutionDebug({ action }: { action: ActionPlan }) {
  const metadata = normalizeObject(normalizeObject(action.parametersJson).metadata);
  if (metadata.source !== "command_catalog" && metadata.source !== "guided_action_wizard") return null;
  const fields = ["catalogCommandId", "blueprintId", "actionType", "storedActionType", "executionTemplateRef", "executionSupport", "implementationState", "executable", "connectorType", "executed", "connectorInvoked", "lastExecutionStatus", "previewStale", "staleReason"];
  return <div className="mb-4 rounded border border-cyan-950 bg-cyan-950/10 p-3"><h4 className="text-xs font-semibold text-cyan-200">Catalog execution debug</h4><dl className="mt-2 grid gap-2 sm:grid-cols-2">{fields.map((field) => <div key={field}><dt className="text-[11px] text-zinc-500">{field}</dt><dd className="text-xs text-zinc-300">{String(metadata[field] ?? "-")}</dd></div>)}</dl></div>;
}
