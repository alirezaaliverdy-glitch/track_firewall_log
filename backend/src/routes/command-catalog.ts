import net from "node:net";
import type { FastifyPluginAsync } from "fastify";
import { missingFieldsMessageFa, resolveAiTemplate } from "../ai/ai-template-resolver.js";
import { COMMAND_CATALOG, COMMAND_CATALOG_VERSION, findCatalogItem, searchCatalog } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { proposeActionPlan } from "../services/action-plan.service.js";
import { catalogGuidedBlueprintId } from "../guided-actions/catalog-guided-blueprint.js";

const bool = (value: unknown) => value === "true" ? true : value === "false" ? false : undefined;
const deviceVendor = (device: { type: string; vendor: string }) => {
  const vendor = device.vendor.toLowerCase();
  if (device.type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (device.type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device.type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (vendor.includes("cisco")) return "cisco";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type;
};
const connectorTypeForVendor = (vendor: string) => vendor === "fortigate" ? "fortigate-ssh" : vendor === "mikrotik" ? "mikrotik-ssh" : vendor === "linux" ? "linux-ssh" : vendor === "cisco" ? "cisco-ios-xe-ssh" : null;
const selectedDeviceSupportsConnector = (device: { protocol?: string | null }, connectorType: string | null) => connectorType?.endsWith("-ssh") ? device.protocol === "ssh" : Boolean(connectorType);
function invalidValue(type: string, value: unknown) {
  if (type === "ip") return typeof value !== "string" || net.isIP(value) === 0;
  if (type === "cidr") { if (typeof value !== "string") return true; const [address, prefix] = value.split("/"); const version = net.isIP(address); const max = version === 4 ? 32 : version === 6 ? 128 : -1; return prefix === undefined || !/^\d+$/.test(prefix) || Number(prefix) > max; }
  if (type === "number") return !Number.isFinite(Number(value));
  return typeof value !== "string" || !value.trim();
}

export const commandCatalogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/commands/catalog", async () => ({ productMode: env.productMode, enabled: env.productMode === "persian_command_catalog", count: COMMAND_CATALOG.length, categories: [...new Set(COMMAND_CATALOG.map((x) => x.category))].sort(), items: COMMAND_CATALOG }));
  app.get<{ Querystring: { q?: string; vendor?: string; deviceId?: string; category?: string; riskLevel?: string; readOnly?: string; executable?: string; includePlanned?: string } }>("/api/commands/catalog/search", async (request, reply) => {
    let vendor = request.query.vendor;
    let device: Awaited<ReturnType<typeof prisma.device.findUnique>> = null;
    if (request.query.deviceId) {
      device = await prisma.device.findUnique({ where: { id: request.query.deviceId } });
      if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
      vendor = deviceVendor(device);
    }
    const items = searchCatalog({ ...request.query, vendor, readOnly: bool(request.query.readOnly), executable: bool(request.query.executable), includePlanned: bool(request.query.includePlanned) }).filter((item) => {
      if (!device || item.implementationState === "manualOnly") return true;
      return item.connectorType === "linux-ssh" || item.connectorType === "mikrotik-ssh" || item.connectorType === "fortigate-ssh" || item.connectorType === "cisco-ios-xe-ssh" ? device.protocol === "ssh" : true;
    });
    return { count: items.length, items };
  });
  app.get<{ Params: { id: string } }>("/api/commands/catalog/:id", async (request, reply) => findCatalogItem(request.params.id) ?? reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." }));
  app.post<{ Params: { id: string }; Body: { deviceId?: string; params?: Record<string, unknown>; requestedBy?: string } }>("/api/commands/catalog/:id/create-action-plan", async (request, reply) => {
    const item = findCatalogItem(request.params.id);
    if (!item) return reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." });
    if (item.supportState === "unsupported") return reply.code(409).send({ error: "COMMAND_NOT_AVAILABLE", code: "COMMAND_NOT_AVAILABLE", messageKey: item.supportReasonKey, messageFa: item.disabledReasonFa, implementationState: item.implementationState, supportState: item.supportState });
    if (item.supportState === "verified" && (!item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef))) return reply.code(409).send({ error: "COMMAND_NOT_EXECUTABLE", code: "COMMAND_NOT_EXECUTABLE", messageKey: "support.reason.missingRequirements", messageFa: "این دستور هنوز template اجرایی ثبت‌شده ندارد." });
    const params = { ...item.defaultParams, ...(request.body?.params ?? {}) };
    const fields = item.requiredParams.filter((field) => params[field.key] === undefined || params[field.key] === "" || invalidValue(field.type, params[field.key]));
    if (fields.length) return reply.code(422).send({ error: "NEEDS_INPUT", needsInput: true, messageFa: missingFieldsMessageFa(fields.map((field) => field.key)), fields, missingFields: fields.map((field) => field.key) });
    if (!request.body?.deviceId) return reply.code(400).send({ error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را انتخاب کنید." });
    const device = await prisma.device.findUnique({ where: { id: request.body.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
    if (deviceVendor(device) !== item.vendor && item.vendor !== "generic") return reply.code(409).send({ error: "VENDOR_MISMATCH", messageFa: "این دستور با وندور دستگاه انتخاب‌شده سازگار نیست." });
    const normalizedParams = { ...params, ...(params.ipAddress ? { srcIp: params.ipAddress, sourceIp: params.ipAddress } : {}), ...(params.allowedSource ? { trustedSourceCidr: params.allowedSource } : {}) };
    const manualOnly = item.supportState === "manual_only";
    const previewOnly = item.supportState === "preview_only";
    const executable = item.supportState === "verified";
    const plan = await proposeActionPlan({ source: "user", requestedBy: request.authUser ? `${request.authUser.username}:${request.authUser.role}` : undefined, deviceId: device.id, vendor: item.vendor, actionType: item.actionType, riskLevel: item.riskLevel, parametersJson: { ...normalizedParams, vendor: item.vendor, executionSupport: executable ? item.executionSupport : manualOnly ? "manual_or_not_implemented" : "preview_only", supportState: item.supportState, supportReasonKey: item.supportReasonKey, executable, requiresExplicitReview: true, expectedImpact: item.descriptionFa, suggestedPrechecks: item.prechecks, suggestedVerification: item.verification, suggestedRollback: item.rollback.available ? item.rollback.steps : [item.rollback.notAvailableReasonFa], metadata: { catalogCommandId: item.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: item.titleFa, vendor: item.vendor, actionType: item.actionType, executionSupport: executable ? item.executionSupport : manualOnly ? "manual" : "preview_only", supportState: item.supportState, supportReasonKey: item.supportReasonKey, implementationState: item.implementationState, executionTemplateRef: executable ? item.executionTemplateRef : null, connectorType: executable ? item.connectorType : null, source: "command_catalog", normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started", executable, previewOnly } } });
    return reply.code(201).send(plan);
  });
  app.post<{ Body: { request?: string; vendor?: string; selectedVendor?: string; currentVendor?: string; selectedConnectorType?: string; selectedDeviceName?: string; deviceId?: string; selectedDeviceId?: string; createActionPlan?: boolean; searchFilters?: Record<string, unknown> } }>("/api/commands/ai-propose", async (request, reply) => {
    const userRequest = request.body?.request?.trim();
    if (!userRequest) return reply.code(400).send({ error: "REQUEST_REQUIRED", messageFa: "درخواست خود را وارد کنید." });

    const selectedDeviceId = request.body.selectedDeviceId ?? request.body.deviceId;
    if (!selectedDeviceId) {
      const noDeviceResolution = resolveAiTemplate({
        userText: userRequest,
        detectedVendor: request.body.vendor,
        currentVendor: request.body.selectedVendor ?? request.body.currentVendor ?? request.body.vendor,
        selectedConnectorType: request.body.selectedConnectorType,
        selectedDeviceName: request.body.selectedDeviceName,
      });
      if (noDeviceResolution.mode === "guided_workflow" && noDeviceResolution.blueprintId) {
        return reply.code(200).send({
          mode: "guided_workflow",
          blueprintId: noDeviceResolution.blueprintId,
          initialValues: noDeviceResolution.initialValues ?? noDeviceResolution.normalizedParams,
          reasonFa: noDeviceResolution.reasonFa,
          messageFa: noDeviceResolution.reasonFa,
          vendor: noDeviceResolution.canonicalVendor === "generic" ? null : noDeviceResolution.canonicalVendor,
          connectorType: noDeviceResolution.connectorType,
          deviceId: null,
          draft: {
            titleFa: "ساخت مرحله‌ای اکشن",
            status: "guided_workflow",
            vendor: noDeviceResolution.canonicalVendor === "generic" ? null : noDeviceResolution.canonicalVendor,
            intent: noDeviceResolution.canonicalActionType,
            userRequest,
            deviceId: null,
            executionSupport: noDeviceResolution.executionSupport,
            autoExecuted: false,
          },
          actionPlan: null,
          resolution: noDeviceResolution,
        });
      }
      if (noDeviceResolution.mode === "clarification") {
        return reply.code(200).send({
          mode: "clarification",
          questionFa: noDeviceResolution.questionFa,
          options: noDeviceResolution.options ?? [],
          messageFa: noDeviceResolution.questionFa,
          actionPlan: null,
          draft: {
            titleFa: "نیاز به انتخاب دستگاه",
            status: "needs_input",
            vendor: noDeviceResolution.canonicalVendor,
            intent: noDeviceResolution.canonicalActionType,
            userRequest,
            deviceId: null,
            executionSupport: noDeviceResolution.executionSupport,
            autoExecuted: false,
          },
          resolution: noDeviceResolution,
        });
      }
      return reply.code(200).send({
        mode: "needs_input",
        missingFields: ["deviceId"],
        messageFa: "اول دستگاه را انتخاب کنید.",
      });
    }

    const device = await prisma.device.findUnique({ where: { id: selectedDeviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });

    const selectedVendor = request.body.selectedVendor ?? request.body.currentVendor ?? request.body.vendor;
    const resolvedVendor = deviceVendor(device);
    const resolution = resolveAiTemplate({
      userText: userRequest,
      selectedDevice: device,
      detectedVendor: resolvedVendor,
      currentVendor: resolvedVendor ?? selectedVendor,
      selectedConnectorType: request.body.selectedConnectorType,
      selectedDeviceName: request.body.selectedDeviceName ?? device.name,
      searchFilters: request.body.searchFilters ?? null,
    });
    const executableItem = resolution.catalogItem?.supportState === "verified" && selectedDeviceSupportsConnector(device, resolution.connectorType) ? resolution.catalogItem : null;
    const draft = {
      titleFa: executableItem?.titleFa ?? "پیشنهاد سفارشی هوش مصنوعی",
      status: "draft",
      vendor: resolution.canonicalVendor,
      selectedVendor: resolution.canonicalVendor,
      selectedConnectorType: connectorTypeForVendor(resolution.canonicalVendor),
      selectedDeviceName: device.name,
      intent: resolution.canonicalActionType,
      userRequest,
      availableCatalogCategories: [...new Set(searchCatalog({ vendor: resolution.canonicalVendor }).map((x) => x.category))],
      deviceId: selectedDeviceId,
      executionSupport: resolution.executionSupport,
      requiresReview: true,
      autoExecuted: false,
    };

    if (resolution.mode === "guided_workflow" && resolution.blueprintId) {
      return reply.code(200).send({
        mode: "guided_workflow",
        blueprintId: resolution.blueprintId,
        initialValues: resolution.initialValues ?? resolution.normalizedParams,
        reasonFa: resolution.reasonFa,
        messageFa: resolution.reasonFa,
        vendor: resolution.canonicalVendor,
        connectorType: resolution.connectorType,
        deviceId: selectedDeviceId,
        draft,
        actionPlan: null,
        resolution,
      });
    }

    if (resolution.mode === "clarification") {
      return reply.code(200).send({
        mode: "clarification",
        questionFa: resolution.questionFa,
        options: resolution.options ?? [],
        messageFa: resolution.questionFa,
        draft,
        actionPlan: null,
        resolution,
      });
    }

    if (request.body.createActionPlan === false) return reply.code(201).send({ mode: "manual_or_not_supported", messageFa: "برای این درخواست هنوز اجرای خودکار آماده نیست.", draft, actionPlan: null, resolution });

    if (executableItem) {
      const normalizedParams = resolution.normalizedParams;
      const requiredParamsSatisfied = resolution.missingFields.length === 0;
      const createMappedPlan = () => proposeActionPlan({ source: "ai", requestedBy: request.authUser ? `${request.authUser.username}:${request.authUser.role}` : undefined, deviceId: selectedDeviceId, vendor: executableItem.vendor, actionType: executableItem.actionType, riskLevel: executableItem.riskLevel, parametersJson: { ...normalizedParams, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", supportState: executableItem.supportState, supportReasonKey: executableItem.supportReasonKey, executable: true, connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams, requiredParamsSatisfied, missingFields: resolution.missingFields, metadata: { catalogCommandId: executableItem.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: executableItem.titleFa, vendor: executableItem.vendor, actionType: executableItem.actionType, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", supportState: executableItem.supportState, supportReasonKey: executableItem.supportReasonKey, executable: true, connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams, requiredParamsSatisfied, missingFields: resolution.missingFields, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } });
      if (resolution.missingFields.length) {
        const declaredFields = executableItem.requiredParams.filter((field) => resolution.missingFields.includes(field.key));
        const blueprintId = catalogGuidedBlueprintId(executableItem.id);
        const actionPlan = await createMappedPlan();
        return reply.code(201).send({
          mode: "guided_workflow",
          actionPlanId: actionPlan.id,
          blueprintId,
          initialValues: resolution.normalizedParams,
          reasonFa: missingFieldsMessageFa(resolution.missingFields),
          messageFa: missingFieldsMessageFa(resolution.missingFields),
          vendor: executableItem.vendor,
          connectorType: resolution.connectorType,
          deviceId: selectedDeviceId,
          templateRef: resolution.executionTemplateRef,
          missingFields: resolution.missingFields,
          fields: declaredFields,
          draft,
          actionPlan,
          resolution,
        });
      }

      const actionPlan = await createMappedPlan();
      return reply.code(201).send({
        mode: "executable_action_plan",
        actionPlanId: actionPlan.id,
        executionSupport: "connector",
        implementationState: "implemented",
        executionTemplateRef: resolution.executionTemplateRef,
        connectorType: resolution.connectorType,
        messageFa: "برنامه اجرای قابل تأیید ساخته شد.",
        draft,
        actionPlan,
        resolution,
      });
    }

    return reply.code(200).send({
      mode: "manual_or_not_supported",
      messageFa: "برای این درخواست هنوز اجرای خودکار آماده نیست.",
      draft,
      actionPlan: null,
      resolution,
    });
  });
};
