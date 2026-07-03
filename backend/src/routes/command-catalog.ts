import type { FastifyPluginAsync } from "fastify";
import { COMMAND_CATALOG, findCatalogItem, searchCatalog } from "../commands/catalog/index.js";
import { proposeActionPlan } from "../services/action-plan.service.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

const bool = (value: unknown) => value === "true" ? true : value === "false" ? false : undefined;

export const commandCatalogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/commands/catalog", async () => ({ productMode: env.productMode, enabled: env.productMode === "persian_command_catalog", count: COMMAND_CATALOG.length, categories: [...new Set(COMMAND_CATALOG.map((x) => x.category))].sort(), items: COMMAND_CATALOG }));
  app.get<{ Querystring: { q?: string; vendor?: string; category?: string; riskLevel?: string; readOnly?: string; executable?: string } }>("/api/commands/catalog/search", async (request) => {
    const items = searchCatalog({ ...request.query, readOnly: bool(request.query.readOnly), executable: bool(request.query.executable) });
    return { count: items.length, items };
  });
  app.get<{ Params: { id: string } }>("/api/commands/catalog/:id", async (request, reply) => findCatalogItem(request.params.id) ?? reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." }));
  app.post<{ Params: { id: string }; Body: { deviceId?: string; params?: Record<string, unknown>; requestedBy?: string } }>("/api/commands/catalog/:id/create-action-plan", async (request, reply) => {
    const item = findCatalogItem(request.params.id);
    if (!item) return reply.code(404).send({ error: "COMMAND_NOT_FOUND", messageFa: "دستور آماده پیدا نشد." });
    const params = request.body?.params ?? {};
    const missingFields = item.requiredParams.filter((field) => params[field.key] === undefined || params[field.key] === "").map((field) => field.key);
    if (missingFields.length) return reply.code(400).send({ error: "MISSING_REQUIRED_PARAMS", messageFa: "ورودی‌های الزامی کامل نیستند.", missingFields });
    if (!request.body?.deviceId) return reply.code(400).send({ error: "DEVICE_REQUIRED", messageFa: "ابتدا دستگاه هدف را انتخاب کنید." });
    const device = await prisma.device.findUnique({ where: { id: request.body.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
    const plan = await proposeActionPlan({ source: "user", requestedBy: request.body.requestedBy, deviceId: device.id, vendor: item.vendor, actionType: item.intent, riskLevel: item.riskLevel, parametersJson: { ...params, vendor: item.vendor, executionSupport: item.uiHints.executable ? "catalog_executable" : "manual_or_not_implemented", expectedImpact: item.descriptionFa, suggestedPrechecks: item.prechecks, suggestedVerification: item.verification, suggestedRollback: item.rollback, metadata: { catalogCommandId: item.id, catalogTitleFa: item.titleFa } } });
    return reply.code(201).send(plan);
  });
  app.post<{ Body: { request?: string; vendor?: string; deviceId?: string; createActionPlan?: boolean } }>("/api/commands/ai-propose", async (request, reply) => {
    const userRequest = request.body?.request?.trim();
    if (!userRequest) return reply.code(400).send({ error: "REQUEST_REQUIRED", messageFa: "درخواست خود را وارد کنید." });
    const draft = { titleFa: "پیشنهاد سفارشی هوش مصنوعی", status: "draft", vendor: request.body.vendor ?? "generic", intent: "generic_security_action", userRequest, availableCatalogCategories: [...new Set(searchCatalog({ vendor: request.body.vendor }).map((x) => x.category))], deviceId: request.body.deviceId ?? null, executionSupport: "manual_or_not_implemented", requiresReview: true, autoExecuted: false };
    if (request.body.createActionPlan === false) return reply.code(201).send({ draft, actionPlan: null });
    const actionPlan = await proposeActionPlan({ source: "ai", deviceId: request.body.deviceId, vendor: request.body.vendor ?? "generic", actionType: "generic_security_action", riskLevel: "medium", parametersJson: { request: userRequest, vendor: request.body.vendor ?? "generic", executionSupport: "manual_or_not_implemented", requiresExplicitReview: true, metadata: { origin: "command_catalog_ai_fallback", draft } } });
    return reply.code(201).send({ draft, actionPlan });
  });
};
