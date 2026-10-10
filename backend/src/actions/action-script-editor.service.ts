import { ActionType, AiRiskLevel } from "@prisma/client";
import {
  buildCustomCommandPlan,
  customPlanFromParameters,
  customVendorFromDevice,
  validateCustomCommandPlan,
} from "../ai/custom-action-plan.js";
import { dryRunActionPlan } from "./action-plan/action-plan-preview.service.js";
import { getActionPlan, proposeActionPlan } from "./action-plan/action-plan-proposal.service.js";
import { prisma } from "../db/prisma.js";

type ScriptIssue = {
  line: number | null;
  section: "script" | "verification" | "general";
  command: string | null;
  message: string;
  messageFa: string;
};

export class ActionScriptEditorError extends Error {
  code: string;
  statusCode: number;
  issues: ScriptIssue[];
  messageFa: string;

  constructor(code: string, message: string, statusCode = 400, issues: ScriptIssue[] = [], messageFa = "امکان آماده‌سازی این اسکریپت وجود ندارد. ورودی‌ها را بررسی کنید.") {
    super(message);
    this.name = "ActionScriptEditorError";
    this.code = code;
    this.statusCode = statusCode;
    this.issues = issues;
    this.messageFa = messageFa;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function executableLines(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("//"));
}

function revisionOf(parametersJson: unknown) {
  const revision = Number(asObject(asObject(parametersJson).metadata).planRevision ?? 1);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

function previewCommands(dryRunJson: unknown) {
  const dryRun = asObject(dryRunJson);
  const specs = Array.isArray(dryRun.commandSpecs)
    ? dryRun.commandSpecs.map(asObject).filter((item) => typeof item.command === "string")
    : [];
  const execution = specs.filter((item) => item.write !== false).map((item) => String(item.command).trim()).filter(Boolean);
  const verification = specs.filter((item) => item.write === false).map((item) => String(item.command).trim()).filter(Boolean);
  const fallback = textArray(dryRun.plannedCommands).length
    ? textArray(dryRun.plannedCommands)
    : textArray(dryRun.commands);
  return {
    execution: execution.length ? execution : fallback,
    verification,
  };
}

function persianIssue(error: string) {
  if (error.includes("at most 12")) return "حداکثر ۱۲ خط اجرایی مجاز است.";
  if (error.includes("maximum length")) return "طول این خط بیشتر از حد مجاز است.";
  if (error.includes("contain a secret")) return "این خط شبیه اطلاعات محرمانه است؛ رمز یا کلید را داخل اسکریپت ننویسید.";
  if (error.includes("hard-denied as catastrophic")) return "این دستور تخریبی است و اجازه اجرا ندارد.";
  if (error.includes("not allowed for")) return "این خط در فهرست دستورهای مجاز این وندور نیست.";
  if (error.includes("explicit verification")) return "برای اعمال تغییر، حداقل یک دستور بررسی پس از اجرا وارد کنید.";
  if (error.includes("requires at least one")) return "اسکریپت اجرا نباید خالی باشد.";
  if (error.includes("vendor does not match")) return "وندور اسکریپت با تجهیز انتخاب‌شده یکسان نیست.";
  if (error.includes("SSH-backed")) return "این ویرایشگر برای این تجهیز به Connector مبتنی بر SSH نیاز دارد.";
  return "این بخش با سیاست اجرای امن سازگار نیست.";
}

function issuesFor(errors: string[], script: string[], verification: string[]): ScriptIssue[] {
  return errors.map((message) => {
    const command = [...script, ...verification].find((line) => message.includes(line)) ?? null;
    const scriptIndex = command ? script.indexOf(command) : -1;
    const verificationIndex = command ? verification.indexOf(command) : -1;
    return {
      line: scriptIndex >= 0 ? scriptIndex + 1 : verificationIndex >= 0 ? verificationIndex + 1 : null,
      section: scriptIndex >= 0 ? "script" as const : verificationIndex >= 0 ? "verification" as const : "general" as const,
      command,
      message,
      messageFa: persianIssue(message),
    };
  });
}

export async function getEditableActionScript(id: string) {
  const sourcePlan = await getActionPlan(id);
  if (!sourcePlan) return null;
  if (!sourcePlan.device) throw new ActionScriptEditorError("SCRIPT_DEVICE_REQUIRED", "A selected device is required.", 409);
  const vendor = customVendorFromDevice(sourcePlan.device);
  if (!vendor) {
    throw new ActionScriptEditorError(
      "SCRIPT_VENDOR_NOT_SUPPORTED",
      "Advanced script editing is currently available for Linux, MikroTik, FortiGate, and Cisco SSH connectors.",
      409,
      [],
      "ویرایش حرفه‌ای اسکریپت فعلاً برای تجهیزات Linux، MikroTik، FortiGate و Cisco با اتصال SSH فعال است.",
    );
  }

  const customPlan = customPlanFromParameters(sourcePlan.parametersJson);
  let commands = customPlan?.orderedCommands ?? [];
  let verificationCommands = customPlan?.verificationCommands ?? [];
  if (!commands.length) {
    const previewPlan = await dryRunActionPlan(id);
    const extracted = previewCommands(previewPlan?.dryRunJson ?? sourcePlan.dryRunJson);
    commands = extracted.execution;
    verificationCommands = extracted.verification;
  }
  if (!verificationCommands.length && commands.length) verificationCommands = [commands[commands.length - 1]];

  return {
    sourceActionPlanId: sourcePlan.id,
    sourceRevision: revisionOf(sourcePlan.parametersJson),
    actionType: sourcePlan.actionType,
    riskLevel: sourcePlan.riskLevel,
    vendor,
    device: {
      id: sourcePlan.device.id,
      name: sourcePlan.device.name,
      host: sourcePlan.device.host,
      vendor: sourcePlan.device.vendor,
      type: sourcePlan.device.type,
    },
    script: commands.join("\n"),
    verificationScript: verificationCommands.join("\n"),
    limits: { maxExecutionLines: 12, maxLineLength: 320 },
    safety: {
      rawExecution: false,
      requiresPreview: true,
      requiresConfirmation: true,
      messageFa: "متن آزاد است، اما فقط خطوط معتبرِ وندور پس از پیش‌نمایش، تأیید شما، PolicyGuard و Connector اجرا می‌شوند.",
    },
  };
}

export async function createEditedScriptPreview(input: {
  sourceActionPlanId: string;
  sourceRevision?: number;
  script?: string;
  verificationScript?: string;
  requestedBy?: string;
}) {
  const source = await getActionPlan(input.sourceActionPlanId);
  if (!source) return null;
  if (!source.device) throw new ActionScriptEditorError("SCRIPT_DEVICE_REQUIRED", "A selected device is required.", 409);
  const device = await prisma.device.findUnique({ where: { id: source.device.id } });
  if (!device) throw new ActionScriptEditorError("SCRIPT_DEVICE_REQUIRED", "The selected device no longer exists.", 409);
  const currentRevision = revisionOf(source.parametersJson);
  if (input.sourceRevision && input.sourceRevision !== currentRevision) {
    throw new ActionScriptEditorError("SCRIPT_SOURCE_STALE", "The source ActionPlan changed after the editor was opened.", 409);
  }
  const vendor = customVendorFromDevice(source.device);
  if (!vendor) throw new ActionScriptEditorError("SCRIPT_VENDOR_NOT_SUPPORTED", "This vendor does not have a registered SSH script policy.", 409);

  const commands = executableLines(input.script);
  const verificationCommands = executableLines(input.verificationScript);
  const existingCustom = customPlanFromParameters(source.parametersJson);
  const sourceMetadata = asObject(source.parametersJson).metadata;
  const sourceRollback = textArray(asObject(source.rollbackJson).rollbackGuidance);
  const draft = buildCustomCommandPlan({
    message: `Advanced script editor for ${vendor} ActionPlan ${source.id}`,
    device,
    parameters: {
      customCommandPlan: {
        orderedCommands: commands,
        verificationCommands,
        typedParameters: {
          ...(existingCustom?.typedParameters ?? {}),
          operation: `edited_${String(source.actionType).slice(0, 80)}`,
          sourceActionPlanId: source.id,
          sourceRevision: currentRevision,
        },
        missingFields: [],
        riskLevel: source.riskLevel,
        expectedImpact: existingCustom?.expectedImpact ?? `Applies an operator-edited ${vendor} command plan derived from ${source.actionType}.`,
        rollbackGuidance: existingCustom?.rollbackGuidance?.length
          ? existingCustom.rollbackGuidance
          : sourceRollback.length
            ? sourceRollback
            : ["Use the original ActionPlan and device backup/audit evidence to prepare rollback before execution."],
      },
    },
  });
  const validation = validateCustomCommandPlan({ plan: draft, device, actionType: ActionType.custom_vendor_action });
  if (!validation.valid || !validation.normalizedPlan) {
    throw new ActionScriptEditorError(
      "SCRIPT_POLICY_REJECTED",
      "One or more edited lines are not allowed by the registered vendor policy.",
      422,
      issuesFor(validation.errors, commands, verificationCommands),
      "یک یا چند خط با سیاست اجرای امن این وندور سازگار نیست. خط‌های مشخص‌شده را اصلاح کنید.",
    );
  }

  const normalized = validation.normalizedPlan;
  const previewPlan = await proposeActionPlan({
    source: "user",
    requestedBy: input.requestedBy,
    deviceId: source.device.id,
    vendor,
    actionType: ActionType.custom_vendor_action,
    riskLevel: normalized.riskLevel ?? source.riskLevel ?? AiRiskLevel.medium,
    parametersJson: {
      vendor,
      executionSupport: "connector",
      supportState: "verified",
      implementationState: "implemented",
      executable: true,
      customCommandPlan: normalized,
      orderedCommands: normalized.orderedCommands,
      metadata: {
        source: "ai_custom_connector_plan",
        editorSource: "advanced_script_editor",
        sourceActionPlanId: source.id,
        sourceActionType: source.actionType,
        sourceRevision: currentRevision,
        sourceCatalogCommandId: asObject(sourceMetadata).catalogCommandId ?? null,
        implementationState: "implemented",
        executionSupport: "connector",
        supportState: "verified",
        executable: true,
        executionTemplateRef: normalized.executionTemplateRef,
        connectorType: normalized.connectorType,
        previewGenerated: false,
        executed: false,
        connectorInvoked: false,
        lastExecutionStatus: "not_started",
      },
    },
  });
  const preview = await dryRunActionPlan(previewPlan.id);
  if (!preview || preview.status !== "dry_run_ready") {
    throw new ActionScriptEditorError("SCRIPT_PREVIEW_FAILED", "The edited script did not produce an executable preview.", 422);
  }
  return {
    actionPlan: preview,
    validation: {
      valid: true,
      warnings: validation.warnings,
      normalizedLines: normalized.orderedCommands.length,
      verificationLines: normalized.verificationCommands.length,
      rawExecution: false,
    },
  };
}
