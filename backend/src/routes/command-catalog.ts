import type { FastifyPluginAsync } from "fastify";
import { COMMAND_CATALOG, COMMAND_CATALOG_VERSION, findCatalogItem, searchCatalog } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { proposeActionPlan } from "../services/action-plan.service.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import net from "node:net";
import { parseAiIntent } from "../services/ai-intent.service.js";

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
      return item.connectorType === "linux-ssh" || item.connectorType === "mikrotik-ssh" ? device.protocol === "ssh" : true;
    });
    return { count: items.length, items };
  });
  app.get<{ Params: { id: string } }>("/api/commands/catalog/:id", async (request, reply) => findCatalogItem(request.params.id) ?? reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." }));
  app.post<{ Params: { id: string }; Body: { deviceId?: string; params?: Record<string, unknown>; requestedBy?: string } }>("/api/commands/catalog/:id/create-action-plan", async (request, reply) => {
    const item = findCatalogItem(request.params.id);
    if (!item) return reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." });
    if (item.implementationState === "planned" || item.implementationState === "unsupported") return reply.code(409).send({ error: "COMMAND_NOT_AVAILABLE", messageFa: item.disabledReasonFa, implementationState: item.implementationState });
    if (item.implementationState === "implemented" && (!item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef))) return reply.code(409).send({ error: "COMMAND_NOT_EXECUTABLE", messageFa: "این دستور هنوز برای اجرای خودکار پشتیبانی نمی‌شود." });
    const params = { ...item.defaultParams, ...(request.body?.params ?? {}) };
    const fields = item.requiredParams.filter((field) => params[field.key] === undefined || params[field.key] === "" || invalidValue(field.type, params[field.key]));
    if (fields.length) return reply.code(422).send({ error: "NEEDS_INPUT", needsInput: true, messageFa: "اطلاعات لازم را کامل کنید؛ هنوز برنامه‌ای ساخته نشده است.", fields, missingFields: fields.map((field) => field.key) });
    if (!request.body?.deviceId) return reply.code(400).send({ error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را انتخاب کنید." });
    const device = await prisma.device.findUnique({ where: { id: request.body.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
    if (deviceVendor(device) !== item.vendor && item.vendor !== "generic") return reply.code(409).send({ error: "VENDOR_MISMATCH", messageFa: "این دستور برای وندور دستگاه انتخاب‌شده قابل استفاده نیست." });
    const normalizedParams = { ...params, ...(params.ipAddress ? { srcIp: params.ipAddress, sourceIp: params.ipAddress } : {}), ...(params.allowedSource ? { trustedSourceCidr: params.allowedSource } : {}) };
    const manualOnly = item.implementationState === "manualOnly";
    const executionSupport = item.executionSupport;
    const plan = await proposeActionPlan({ source: "user", requestedBy: request.body.requestedBy, deviceId: device.id, vendor: item.vendor, actionType: item.actionType, riskLevel: item.riskLevel, parametersJson: { ...normalizedParams, vendor: item.vendor, executionSupport: manualOnly ? "manual_or_not_implemented" : executionSupport, requiresExplicitReview: true, expectedImpact: item.descriptionFa, suggestedPrechecks: item.prechecks, suggestedVerification: item.verification, suggestedRollback: item.rollback.available ? item.rollback.steps : [item.rollback.notAvailableReasonFa], metadata: { catalogCommandId: item.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: item.titleFa, vendor: item.vendor, actionType: item.actionType, executionSupport, implementationState: item.implementationState, executionTemplateRef: item.executionTemplateRef, connectorType: item.connectorType, source: "command_catalog", normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, lastExecutionStatus: "not_started" } } });
    return reply.code(201).send(plan);
  });
  app.post<{ Body: { request?: string; vendor?: string; deviceId?: string; createActionPlan?: boolean } }>("/api/commands/ai-propose", async (request, reply) => {
    const userRequest = request.body?.request?.trim();
    if (!userRequest) return reply.code(400).send({ error: "REQUEST_REQUIRED", messageFa: "درخواست خود را وارد کنید." });
    const parsed = parseAiIntent(userRequest);
    const requestedVendor = request.body.vendor === "linux_edge" || request.body.vendor === "linux-server" ? "linux" : request.body.vendor;
    const executableItem = parsed ? COMMAND_CATALOG.find((item) => item.implementationState === "implemented" && item.executionSupport === "connector" && (!requestedVendor || item.vendor === requestedVendor) && (item.actionType === parsed.intentType || (requestedVendor === "linux" && parsed.intentType === "open_port" && item.actionType === "linux_open_port"))) : undefined;
    const parsedMissing = Array.isArray(parsed?.parameters.missingFields) ? parsed.parameters.missingFields.map(String) : [];
    const draft = { titleFa: executableItem?.titleFa ?? "پیشنهاد سفارشی هوش مصنوعی", status: "draft", vendor: executableItem?.vendor ?? request.body.vendor ?? "generic", intent: executableItem?.actionType ?? "generic_security_action", userRequest, availableCatalogCategories: [...new Set(searchCatalog({ vendor: request.body.vendor }).map((x) => x.category))], deviceId: request.body.deviceId ?? null, executionSupport: executableItem ? "connector" : "manual_or_not_implemented", requiresReview: true, autoExecuted: false };
    if (request.body.createActionPlan === false) return reply.code(201).send({ draft, actionPlan: null });
    if (executableItem) {
      if (parsedMissing.length) return reply.code(422).send({ error: "NEEDS_INPUT", needsInput: true, messageFa: parsedMissing.length === 1 && parsedMissing[0] === "username" ? "نام کاربر لینوکس چیست؟" : "پارامترهای لازم را کامل کنید.", missingFields: parsedMissing });
      if (!request.body.deviceId) return reply.code(400).send({ error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را انتخاب کنید." });
      const normalizedParams = { ...executableItem.defaultParams, ...parsed!.parameters };
      const actionPlan = await proposeActionPlan({ source: "ai", deviceId: request.body.deviceId, vendor: executableItem.vendor, actionType: executableItem.actionType, riskLevel: executableItem.riskLevel, parametersJson: { ...normalizedParams, executionSupport: "connector", metadata: { catalogCommandId: executableItem.id, catalogVersion: COMMAND_CATALOG_VERSION, catalogTitleFa: executableItem.titleFa, vendor: executableItem.vendor, actionType: executableItem.actionType, executionSupport: "connector", implementationState: "implemented", executionTemplateRef: executableItem.executionTemplateRef, connectorType: executableItem.connectorType, source: "command_catalog_ai_fallback", normalizedParams, requiredParamsSatisfied: true, previewGenerated: false, executed: false, connectorInvoked: false, lastExecutionStatus: "not_started" } } });
      return reply.code(201).send({ draft, actionPlan });
    }
    const actionPlan = await proposeActionPlan({ source: "ai", deviceId: request.body.deviceId, vendor: request.body.vendor ?? "generic", actionType: "generic_security_action", riskLevel: "medium", parametersJson: { request: userRequest, vendor: request.body.vendor ?? "generic", executionSupport: "manual_or_not_implemented", requiresExplicitReview: true, metadata: { origin: "command_catalog_ai_fallback", draft } } });
    return reply.code(201).send({ draft, actionPlan });
  });
};
