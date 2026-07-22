import {
  actionPlanStatusLabel,
  normalizeArray,
  normalizeObject,
  type ActionPlan,
  type StructuredValidationError,
} from "@/lib/actions";

export const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const ACTIVE_STATUSES = new Set(["proposed", "needs_input", "validation_failed", "awaiting_approval", "dry_run_ready", "approved", "running", "executing", "failed", "blocked", "rollback_needed"]);
export const HISTORY_STATUSES = new Set(["succeeded", "rejected", "rolled_back", "cancelled", "expired"]);
export const FAILED_STATUSES = new Set(["failed", "validation_failed", "blocked", "rollback_needed"]);
export type ActionTab = "active" | "succeeded" | "failed" | "history" | "all";

export const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

export const technicalText = (value: unknown) => String(value ?? "")
  .replace(/dry[_ -]?run/gi, "command plan")
  .replace(/awaiting approval/gi, "ready");

export function badgeClass(value: string) {
  if (value === "critical") return "border-red-700 bg-red-950/60 text-red-200";
  if (value === "executing") return "border-purple-700 bg-purple-950/50 text-purple-200";
  if (value === "high" || value === "failed" || value === "validation_failed") return "border-red-800 bg-red-950/40 text-red-300";
  if (value === "medium" || value === "awaiting_approval" || value === "dry_run_ready") return "border-yellow-800 bg-yellow-950/40 text-yellow-300";
  if (value === "approved" || value === "succeeded") return "border-green-800 bg-green-950/40 text-green-300";
  return "border-blue-800 bg-blue-950/40 text-blue-200";
}

export function statusLabel(value: string, isFa = false, outcome?: string) {
  if (isFa) {
    if (value === "succeeded" && ["verified_no_change", "already_compliant"].includes(String(outcome))) return "تأییدشده بدون تغییر";
    return ({ proposed: "پیشنهادشده", needs_input: "نیازمند اطلاعات", validation_failed: "نامعتبر", awaiting_approval: "منتظر تأیید", dry_run_ready: "پیش‌نمایش آماده", approved: "تأییدشده", running: "در حال اجرا", executing: "در حال اجرا", succeeded: "موفق", failed: "ناموفق", blocked: "مسدود", rollback_needed: "نیازمند بازگشت", rolled_back: "بازگردانی‌شده", rejected: "ردشده" } as Record<string, string>)[value] ?? value.replace(/_/g, " ");
  }
  if (value === "succeeded" && ["verified_no_change", "already_compliant"].includes(String(outcome))) return "verified, no change";
  return actionPlanStatusLabel(value);
}

export function vendorOf(action: ActionPlan) {
  const parameterVendor = String(normalizeObject(action.parametersJson).vendor ?? "").toLowerCase();
  if (parameterVendor) return parameterVendor === "linux_edge" ? "Linux" : parameterVendor;
  const deviceType = String(action.device?.type ?? "").toLowerCase();
  if (deviceType.includes("fortigate") || action.actionType.startsWith("fortigate_")) return "FortiGate";
  if (deviceType.includes("mikrotik") || action.actionType.startsWith("mikrotik_")) return "MikroTik";
  if (deviceType.includes("linux") || action.actionType.startsWith("linux_")) return "Linux Edge";
  return deviceType || "generic";
}

export function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function commandSummary(action: ActionPlan) {
  const dryRun = normalizeObject(action.dryRunJson);
  const commands = Array.from(new Set([...textArray(dryRun.plannedCommands), ...textArray(dryRun.commands), ...textArray(dryRun.cliOutline)]));
  const result = normalizeObject(action.resultJson);
  const executedCommands = normalizeArray<Record<string, unknown>>(result.commands).map((item) => String(item.template ?? item.command ?? "")).filter(Boolean);
  return (executedCommands.length ? executedCommands : commands).slice(0, 3);
}

export function JsonBlock({ title, value }: { title: string; value: unknown }) {
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

const EDITABLE_FIX_FIELDS = new Set(["sourceIp", "sourceCidr", "destinationIp", "destinationCidr", "trustedSource", "trustedSourceCidr", "wanInterface", "lanInterface", "srcInterface", "dstInterface", "srcZone", "dstZone", "serviceName", "services", "username", "port", "newPort", "protocol", "schedule", "nat", "logTraffic", "comment"]);

export function structuredFieldErrors(action: ActionPlan): StructuredValidationError[] {
  return normalizeArray<Record<string, unknown>>(normalizeObject(action.validationJson).fieldErrors)
    .map((issue) => ({
      field: String(issue.field ?? "parameters"),
      message: String(issue.message ?? "Invalid value."),
      expectedFormat: String(issue.expectedFormat ?? "valid value"),
      currentValue: issue.currentValue ?? null
    }))
    .filter((issue) => issue.field && issue.field !== "parameters");
}

export function fixableFields(action: ActionPlan) {
  const validation = normalizeObject(action.validationJson);
  const fields = [...structuredFieldErrors(action).map((issue) => issue.field), ...textArray(validation.missingFields)];
  return Array.from(new Set(fields.filter((field) => EDITABLE_FIX_FIELDS.has(field) && !(
    validation.executionMode === "quick_controlled" && ["trustedSource", "trustedSourceCidr"].includes(field)
  ))));
}

export function initialFixValues(action: ActionPlan) {
  const parameters = normalizeObject(action.parametersJson);
  const suggestions = normalizeObject(normalizeObject(action.validationJson).suggestions);
  return Object.fromEntries(fixableFields(action).map((field) => [field, Array.isArray(parameters[field]) ? parameters[field].join(",") : String(parameters[field] ?? suggestions[field] ?? "")]));
}

export function fieldLabel(field: string) {
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

export function fieldExample(field: string) {
  if (field === "wanInterface") return "port2, wan1, wan2";
  if (field === "lanInterface") return "port1, internal, lan";
  if (["sourceIp", "srcIp", "ipAddress"].includes(field)) return "مثال: 203.0.113.10";
  if (["sourceCidr", "trustedSourceCidr", "trustedSource", "allowedSource"].includes(field)) return "مثال: 192.0.2.0/24";
  if (field === "serviceName" || field === "service") return "مثال: nginx یا sshd";
  if (field === "username") return "مثال: tavakoli";
  if (["port", "newPort", "toPort"].includes(field)) return "مثال: 2222";
  return field;
}

export function friendlyActionReason(action: ActionPlan) {
  const validation = normalizeObject(action.validationJson);
  if (typeof validation.userMessage === "string") return validation.userMessage;
  const text = textArray(validation.errors).join(" ");
  if (/credential/i.test(text)) return "Device credential is missing.";
  if (/device/i.test(text)) return "Device is missing or unavailable.";
  if (/not supported|not in .*catalog|unsupported/i.test(text)) return "This action is not supported yet.";
  if (/reserved|blocked.*port|newPort/i.test(text)) return "Port is blocked by policy or has an invalid value.";
  return "This action cannot execute with its current values.";
}

export function isVerifiedGuidedConnectorPlan(action: ActionPlan) {
  const parameters = normalizeObject(action.parametersJson);
  const metadata = normalizeObject(parameters.metadata);
  return metadata.source === "guided_action_wizard"
    && String(metadata.supportState ?? parameters.supportState) === "verified"
    && String(metadata.executionSupport ?? parameters.executionSupport) === "connector"
    && metadata.executable === true;
}

export function VendorPlanView({ dryRunJson }: { dryRunJson: Record<string, unknown> }) {
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

export function ValidationSummary({ action }: { action: ActionPlan }) {
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

export function PlanSummary({ plan }: { plan: ActionPlan }) {
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

export function actionLabel(action: ActionPlan) {
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

export function ProposalDetails({ action }: { action: ActionPlan }) {
  const params = normalizeObject(action.parametersJson);
  const metadata = normalizeObject(params.metadata);
  const structuredPlan = normalizeObject(metadata.aiStructuredPlan ?? params.aiStructuredPlan);
  const structuredSteps = normalizeArray<Record<string, unknown>>(structuredPlan.steps);
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
    ["Step eligibility", structuredPlan.executionEligibility],
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
      {structuredSteps.length > 0 && (
        <div className="mt-4 rounded border border-zinc-800 bg-black/20">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_8rem] gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
            <span>#</span>
            <span>Step</span>
            <span>Status</span>
            <span>Backend</span>
          </div>
          <div className="divide-y divide-zinc-800">
            {structuredSteps.map((step, index) => {
              const missing = textArray(step.missingFields).join(", ");
              const blocked = String(step.blockedReason ?? step.unsupportedCapability ?? "");
              return (
                <div key={String(step.id ?? index)} className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_8rem] gap-2 px-3 py-2 text-xs text-zinc-300">
                  <span className="font-mono text-zinc-500">{String(step.order ?? index + 1)}</span>
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-zinc-100">{String(step.intent ?? step.actionType ?? "step")}</span>
                    <span className="mt-1 block break-words text-zinc-500">{String(step.catalogCommandId ?? step.actionType ?? "unsupported capability")}</span>
                    {missing ? <span className="mt-1 block break-words text-yellow-200">Missing: {missing}</span> : null}
                    {blocked ? <span className="mt-1 block break-words text-red-200">{blocked}</span> : null}
                  </span>
                  <span>{String(step.status ?? "blocked").replace(/_/g, " ")}</span>
                  <span>{step.rawCommandExecution === false ? "registry only" : "blocked"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function sourceLabel(source: string, action?: ActionPlan) {
  if (normalizeObject(normalizeObject(action?.parametersJson).metadata).source === "command_catalog") return "کاتالوگ دستور";
  if (source === "ai") return "AI Assistant";
  if (source === "detection") return "Detection";
  if (source === "user") return "Manual";
  return source;
}

export function actionMatchesFilter(action: ActionPlan, filter: string) {
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

export function tabForPlan(action: ActionPlan): ActionTab {
  if (action.status === "succeeded") return "succeeded";
  if (FAILED_STATUSES.has(action.status)) return "failed";
  if (HISTORY_STATUSES.has(action.status)) return "history";
  return "active";
}

export function revisionOf(action: ActionPlan) {
  const metadata = normalizeObject(normalizeObject(action.parametersJson).metadata);
  const approval = normalizeObject(action.approvalJson);
  const revision = Number(metadata.planRevision ?? approval.planRevision ?? metadata.revision ?? approval.revision);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}
