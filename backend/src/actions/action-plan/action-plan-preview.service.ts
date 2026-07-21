import { ActionPlanStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { resolveCatalogAction } from "../../commands/catalog/catalog-action-resolver.js";
import { buildDryRun } from "../../services/dry-run.service.js";
import { preflightActionPlan } from "../../services/action-preflight.service.js";
import { validateActionPlan } from "../../services/policy-guard.service.js";
import {
  ActionExecutionError,
  asObject,
  audit,
  includeRelations,
  mergeCorrectedParameters,
  planRevision,
  prepareActionPlan,
  previewRevisionMetadata,
  resolveActionPlanRuntime,
  stableJson,
  storedNormalizedParameters,
  toJson,
  userValidationMessage,
  validationDetails,
  withExecutionMetadata,
  canonicalParameterValues
} from "./action-plan.shared.js";
export async function validateAndStoreActionPlan(id: string) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);

  const validation = await validateActionPlan(plan);
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: validation.valid ? ActionPlanStatus.awaiting_approval : ActionPlanStatus.validation_failed,
      riskLevel: validation.riskLevel,
      parametersJson: toJson(validation.valid || Object.keys(validation.normalizedParameters).length > 0 ? storedNormalizedParameters(plan, validation.normalizedParameters) : asObject(plan.parametersJson)),
      validationJson: toJson(validationDetails({ plan, validation, stage: "policy_guard" })),
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      rollbackJson: toJson(validation.rollbackJson)
    },
    include: includeRelations()
  });

  await audit(updated, validation.valid ? "action.validated" : "action.validation_failed", validation.valid ? "Action plan passed policy validation." : "Action plan failed policy validation.", validation);
  return updated;
}

export async function correctAndRevalidateActionPlan(id: string, input: Record<string, unknown>) {
  const existing = await prisma.actionPlan.findUnique({ where: { id } });
  if (!existing) return null;
  if (new Set<ActionPlanStatus>([ActionPlanStatus.executing, ActionPlanStatus.succeeded, ActionPlanStatus.rolled_back]).has(existing.status)) {
    throw new ActionExecutionError("ACTION_NOT_EDITABLE", "Completed or executing ActionPlans cannot be edited.");
  }
  const corrections = asObject(input.parametersJson ?? input.fields ?? input);
  const currentParameters = asObject(existing.parametersJson);
  const correctedParameters = mergeCorrectedParameters(existing.actionType, currentParameters, corrections);
  const currentMetadata = asObject(currentParameters.metadata);
  const changedFields = Object.keys(corrections).filter((field) => stableJson(currentParameters[field]) !== stableJson(correctedParameters[field]));
  if (changedFields.length === 0) return dryRunActionPlan(id);
  const currentRevision = planRevision(currentMetadata);
  const revisionHistory = Array.isArray(currentMetadata.revisionHistory) ? currentMetadata.revisionHistory : [];
  const {
    canonicalParameters: _canonicalParameters,
    canonicalParametersHash: _canonicalParametersHash,
    canonicalPayload: _canonicalPayload,
    canonicalPayloadHash: _canonicalPayloadHash,
    previewHash: _previewHash,
    previewFingerprint: _previewFingerprint,
    ...preservedMetadata
  } = currentMetadata;
  const parametersJson = {
    ...correctedParameters,
    metadata: {
      ...preservedMetadata,
      planRevision: currentRevision + 1,
      planState: "draft",
      previewGenerated: false,
      previewStale: false,
      staleReason: null,
      revisionHistory: [...revisionHistory, {
        revision: currentRevision,
        state: currentMetadata.planState ?? "draft",
        canonicalPayloadHash: currentMetadata.canonicalPayloadHash ?? null,
        previewHash: currentMetadata.previewHash ?? null
      }].slice(-20)
    }
  };
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      parametersJson: toJson(parametersJson),
      status: ActionPlanStatus.proposed,
      validationJson: Prisma.JsonNull,
      dryRunJson: Prisma.JsonNull,
      approvalJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      rollbackJson: Prisma.JsonNull
    }
  });
  await audit(updated, "action.parameters_corrected", "Canonical ActionPlan fields were corrected and a new draft revision was created.", { fields: changedFields, previousRevision: currentRevision, currentRevision: currentRevision + 1 });
  const validated = await validateAndStoreActionPlan(id);
  if (validated?.status === ActionPlanStatus.awaiting_approval) return dryRunActionPlan(id);
  return validated;
}

export async function dryRunActionPlan(id: string) {
  let plan = await prisma.actionPlan.findUnique({ where: { id } });
  if (!plan) return null;
  plan = await prepareActionPlan(plan);
  const initialMetadata = asObject(asObject(plan.parametersJson).metadata);
  if (["command_catalog", "command_search_ai_fallback", "ai_mapped_template", "guided_action_wizard"].includes(String(initialMetadata.source)) && initialMetadata.supportState !== "verified") {
    const device = plan.deviceId ? await prisma.device.findUnique({ where: { id: plan.deviceId } }) : null;
    const resolved = resolveCatalogAction(plan, device);
    if (resolved.matched && resolved.valid) {
      plan = await prisma.actionPlan.update({
        where: { id },
        data: { parametersJson: toJson(withExecutionMetadata(plan.parametersJson, { supportState: "verified", supportReasonKey: resolved.item.supportReasonKey, executionTemplateRef: resolved.item.executionTemplateRef, connectorType: resolved.item.connectorType, executable: true })) }
      });
    } else {
    const blocked = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        validationJson: toJson({
          valid: false,
          code: "CATALOG_COMMAND_NOT_VERIFIED",
          messageKey: initialMetadata.supportReasonKey ?? "support.reason.missingRequirements",
          supportState: initialMetadata.supportState ?? "preview_only",
          userMessage: "This ActionPlan is available for review only and cannot generate an executable command preview."
        }),
        dryRunJson: Prisma.JsonNull
      },
      include: includeRelations()
    });
    await audit(blocked, "action.command_plan_blocked", "Command preview refused because support state is not verified.", { code: "CATALOG_COMMAND_NOT_VERIFIED", supportState: initialMetadata.supportState });
    return blocked;
    }
  }

  plan = await resolveActionPlanRuntime(plan);

  let preflight: Awaited<ReturnType<typeof preflightActionPlan>> | null = null;
  if (plan.deviceId) {
    const device = await prisma.device.findUnique({ where: { id: plan.deviceId } });
    if (device) {
      preflight = await preflightActionPlan(plan, device);
      if (preflight.attempted) {
        plan = await prisma.actionPlan.update({
          where: { id },
          data: { parametersJson: toJson(preflight.parameters) }
        });
        await audit(plan, "action.preflight_completed", "Read-only action preflight completed.", {
          missingFields: preflight.missingFields ?? [],
          suggestions: preflight.suggestions ?? {},
          discoveryError: preflight.discoveryError
        });
        if (preflight.autoResolved) {
          await audit(plan, "parameters_auto_resolved", "Management source was resolved automatically for quick execution.", {
            trustedSource: asObject(preflight.parameters).trustedSource,
            resolution: asObject(preflight.parameters).trustedSourceResolution
          });
          await audit(plan, "policy_warning", "Management source was auto-resolved or unrestricted because quick execution mode is enabled.", {
            unrestricted: preflight.unrestricted,
            warnings: preflight.warnings ?? []
          });
        }
      }
    }
  }

  const validation = await validateActionPlan(plan);
  if (validation.normalizedParameters.trustedSourceAutoResolved === true && !preflight?.autoResolved) {
    await audit(plan, "parameters_auto_resolved", "Management source was resolved automatically for quick execution.", {
      trustedSource: validation.normalizedParameters.trustedSource,
      resolution: validation.normalizedParameters.trustedSourceResolution
    });
    await audit(plan, "policy_warning", "Management source was auto-resolved or unrestricted because quick execution mode is enabled.", {
      unrestricted: validation.normalizedParameters.trustedSource === "0.0.0.0/0"
    });
  }
  if (!validation.valid) {
    const details = validationDetails({ plan, validation, stage: "validation" });
    const combinedMissingFields = Array.from(new Set([...(validation.missingFields ?? []), ...(preflight?.missingFields ?? [])]));
    const failed = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        parametersJson: toJson(storedNormalizedParameters(plan, validation.normalizedParameters)),
        validationJson: toJson({
          ...details,
          missingFields: combinedMissingFields,
          suggestions: preflight?.suggestions ?? {},
          userMessage: userValidationMessage(validation.errors, combinedMissingFields)
        }),
        dryRunJson: Prisma.JsonNull,
        approvalJson: Prisma.JsonNull
      },
      include: includeRelations()
    });
    await audit(failed, "action.command_plan_blocked", "Command plan blocked by policy validation.", validation);
    return failed;
  }

  let dryRun: Awaited<ReturnType<typeof buildDryRun>>;
  try {
    const normalizedPlan = await prisma.actionPlan.update({
      where: { id },
      data: {
        riskLevel: validation.riskLevel,
        parametersJson: toJson(storedNormalizedParameters(plan, validation.normalizedParameters))
      }
    });
    dryRun = await buildDryRun(normalizedPlan);
    plan = normalizedPlan;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Command compiler failed.";
    const failed = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.validation_failed,
        validationJson: toJson(validationDetails({ plan, validation, stage: "compiler", compilerError: reason, exactReason: reason })),
        approvalJson: Prisma.JsonNull,
        dryRunJson: toJson({
          status: "unsupported",
          commands: [],
          warnings: [reason],
          unsupportedReason: reason,
          missingFields: [],
          parameters: asObject(plan.parametersJson)
        })
      },
      include: includeRelations()
    });
    await audit(failed, "action.command_plan_failed", "Command plan compiler failed.", { reason, parameters: asObject(plan.parametersJson) });
    return failed;
  }
  const dryRunObject = asObject(dryRun);
  const planStatus = dryRunObject.status === "needs_clarification"
    ? ActionPlanStatus.proposed
    : dryRunObject.status === "unsupported"
      ? ActionPlanStatus.validation_failed
      : ActionPlanStatus.dry_run_ready;
  const normalizedStoredParameters = storedNormalizedParameters(plan, validation.normalizedParameters);
  const finalParameters = withExecutionMetadata(normalizedStoredParameters, {
    normalizedParams: canonicalParameterValues(normalizedStoredParameters)
  });
  const revisionMetadata = previewRevisionMetadata({ ...plan, parametersJson: toJson(finalParameters) as unknown as Prisma.JsonValue }, dryRun);
  const updated = await prisma.actionPlan.update({
    where: { id },
    data: {
      status: planStatus,
      riskLevel: validation.riskLevel,
      validationJson: toJson({
        ...validationDetails({ plan, validation, stage: "command_plan" }),
        plannerStatus: dryRunObject.status,
        needsClarification: dryRunObject.status === "needs_clarification",
        missingFields: dryRunObject.missingFields ?? [],
        questions: dryRunObject.questions ?? [],
        unsupportedReason: dryRunObject.unsupportedReason
      }),
      dryRunJson: toJson(dryRun),
      parametersJson: toJson(withExecutionMetadata(finalParameters, {
        previewGenerated: true,
        executed: false,
        connectorInvoked: false,
        lastExecutionStatus: "preview_ready",
        previewStale: false,
        staleReason: null,
        ...revisionMetadata
      })),
      rollbackJson: toJson(validation.rollbackJson)
    },
    include: includeRelations()
  });

  await audit(
    updated,
    dryRunObject.status === "needs_clarification" ? "action.command_plan_needs_clarification" : dryRunObject.status === "unsupported" ? "action.command_plan_unsupported" : "action.command_plan_ready",
    "Internal command plan generated without executing device changes.",
    dryRun
  );
  await audit(updated, "command_plan_generated", "Internal command plan generated for controlled execution.", dryRun);
  return updated;
}
