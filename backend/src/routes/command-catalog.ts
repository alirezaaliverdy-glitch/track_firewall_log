import net from "node:net";
import type { FastifyPluginAsync } from "fastify";
import { missingFieldsMessageFa, resolveAiTemplate } from "../ai/ai-template-resolver.js";
import { COMMAND_CATALOG, COMMAND_CATALOG_VERSION, findCatalogItem, searchCatalog } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { proposeActionPlan } from "../services/action-plan.service.js";

const bool = (value: unknown) => value === "true" ? true : value === "false" ? false : undefined;
const deviceVendor = (device: { type: string; vendor: string }) => device.type === "linux_edge" ? "linux" : device.type === "generic_firewall" || device.type === "generic_syslog_source" ? "generic" : device.type;
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
      return item.connectorType === "linux-ssh" || item.connectorType === "mikrotik-ssh" || item.connectorType === "fortigate-ssh" ? device.protocol === "ssh" : true;
    });
    return { count: items.length, items };
  });
  app.get<{ Params: { id: string } }>("/api/commands/catalog/:id", async (request, reply) => findCatalogItem(request.params.id) ?? reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." }));
  app.post<{ Params: { id: string }; Body: { deviceId?: string; params?: Record<string, unknown>; requestedBy?: string } }>("/api/commands/catalog/:id/create-action-plan", async (request, reply) => {
    const item = findCatalogItem(request.params.id);
    if (!item) return reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." });
    if (item.implementationState === "planned" || item.implementationState === "unsupported") return reply.code(409).send({ error: "COMMAND_NOT_AVAILABLE", messageFa: item.disabledReasonFa, implementationState: item.implementationState });
    if (item.implementationState === "implemented" && (!item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef))) return reply.code(409).send({ error: "COMMAND_NOT_EXECUTABLE", messageFa: "این دستور هنوز template اجرایی ثبت‌شده ندارد." });
    const params = { ...item.defaultParams, ...(request.body?.params ?? {}) };
    const fields = item.requiredParams.filter((field) => params[field.key] === undefined || params[field.key] === "" || invalidValue(field.type, params[field.key]));
    if (fields.length) return reply.code(422).send({ error: "NEEDS_INPUT", needsInput: true, messageFa: missingFieldsMessageFa(fields.map((field) => field.key)), fields, missingFields: fields.map((field) => field.key) });
    if (!request.body?.deviceId) return reply.code(400).send({ error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را انتخاب کنید." });
    const device = await prisma.device.findUnique({ where: { id: request.body.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
    if (deviceVendor(device) !== item.vendor && item.vendor !== "generic") return reply.code(409).send({ error: "VENDOR_MISMATCH", messageFa: "این دستور با وندور دستگاه انتخاب‌شده سازگار نیست." });
    const normalizedParams = { ...params, ...(params.ipAddress ? { srcIp: params.ipAddress, sourceIp: params.ipAddress } : {}), ...(params.allowedSource ? { trustedSourceCidr: params.allowedSource } : {}) };
    const manualOnly = item.implementationState === "manualOnly";
    const plan = await proposeActionPlan({ source: "user", requestedBy: request.body.requestedBy, deviceId: device.id, vendor: item.vendor, actionType: item.actionType, riskLevel: item.riskLevel, parametersJson: { ...normalizedParams, vendor: item.vendor, executionSupport: manualOnly ? "manual_or_not_implemented" : item.executionSupport, requiresExplicitReview: true, expectedImpact: item.descriptionFa, suggestedPrechecks: item.prechecks, suggestedVerification: item.verification, suggestedRollback: item.rollback.available ? item.rollback.steps : [item.rollback.notAvailableReasonFa], metadata: { catalogCommandId: item.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: item.titleFa, vendor: item.vendor, actionType: item.actionType, executionSupport: item.executionSupport, implementationState: item.implementationState, executionTemplateRef: item.executionTemplateRef, connectorType: item.connectorType, source: "command_catalog", normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } });
    return reply.code(201).send(plan);
  });
  app.post<{ Body: { request?: string; vendor?: string; selectedVendor?: string; currentVendor?: string; deviceId?: string; selectedDeviceId?: string; createActionPlan?: boolean; searchFilters?: Record<string, unknown> } }>("/api/commands/ai-propose", async (request, reply) => {
    const userRequest = request.body?.request?.trim();
    if (!userRequest) return reply.code(400).send({ error: "REQUEST_REQUIRED", messageFa: "درخواست خود را وارد کنید." });

    const selectedDeviceId = request.body.selectedDeviceId ?? request.body.deviceId;
    if (!selectedDeviceId) {
      return reply.code(200).send({
        mode: "needs_input",
        missingFields: ["deviceId"],
        messageFa: "اول دستگاه را انتخاب کنید.",
      });
    }

    const device = await prisma.device.findUnique({ where: { id: selectedDeviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });

    const selectedVendor = request.body.selectedVendor ?? request.body.currentVendor ?? request.body.vendor;
    const resolution = resolveAiTemplate({
      userText: userRequest,
      selectedDevice: device,
      detectedVendor: request.body.vendor,
      currentVendor: selectedVendor,
      searchFilters: request.body.searchFilters ?? null,
    });
    const executableItem = resolution.implementationState === "implemented" ? resolution.catalogItem : null;
    const draft = {
      titleFa: executableItem?.titleFa ?? "پیشنهاد سفارشی هوش مصنوعی",
      status: "draft",
      vendor: resolution.canonicalVendor,
      intent: resolution.canonicalActionType,
      userRequest,
      availableCatalogCategories: [...new Set(searchCatalog({ vendor: resolution.canonicalVendor }).map((x) => x.category))],
      deviceId: selectedDeviceId,
      executionSupport: resolution.executionSupport,
      requiresReview: true,
      autoExecuted: false,
    };

    if (request.body.createActionPlan === false) return reply.code(201).send({ mode: "manual_proposal", messageFa: "برای این درخواست هنوز اجرای خودکار آماده نیست.", draft, actionPlan: null, resolution });

    if (executableItem) {
      if (resolution.missingFields.length) {
        return reply.code(200).send({ mode: "needs_input", missingFields: resolution.missingFields, messageFa: missingFieldsMessageFa(resolution.missingFields), draft, actionPlan: null, resolution });
      }

      const normalizedParams = resolution.normalizedParams;
      const actionPlan = await proposeActionPlan({ source: "ai", deviceId: selectedDeviceId, vendor: executableItem.vendor, actionType: executableItem.actionType, riskLevel: executableItem.riskLevel, parametersJson: { ...normalizedParams, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams, requiredParamsSatisfied: true, metadata: { catalogCommandId: executableItem.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: executableItem.titleFa, vendor: executableItem.vendor, actionType: executableItem.actionType, source: "ai_mapped_template", implementationState: "implemented", executionSupport: "connector", connectorType: resolution.connectorType, executionTemplateRef: resolution.executionTemplateRef, normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } });
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
      mode: "manual_proposal",
      messageFa: "برای این درخواست هنوز اجرای خودکار آماده نیست.",
      draft,
      actionPlan: null,
      resolution,
    });
  });
};
