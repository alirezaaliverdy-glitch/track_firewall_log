import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  answerGuidedActionStep,
  buildGuidedActionPlan,
  cancelGuidedActionSession,
  getGuidedActionSession,
  startGuidedActionSession,
} from "../guided-actions/session-service.js";

function deviceVendor(device: { type: string; vendor: string }) {
  const vendor = device.vendor.toLowerCase();
  if (device.type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (device.type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device.type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (device.type === "generic_firewall" || device.type === "generic_syslog_source") return "generic";
  return device.type;
}

function sendResult(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, result: { ok: false; code: number; error: string; messageFa: string } | { ok: true; value: unknown }) {
  if (result.ok) return result.value;
  return reply.code(result.code).send({ error: result.error, messageFa: result.messageFa, ...(result as Record<string, unknown>) });
}

export const actionSessionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { blueprintId?: string; deviceId?: string; vendor?: string; initialRequest?: string; initialValues?: Record<string, unknown> } }>("/api/action-sessions/start", async (request, reply) => {
    if (request.body?.blueprintId && !request.body.deviceId) {
      return sendResult(reply, startGuidedActionSession({
        blueprintId: request.body.blueprintId,
        deviceId: null,
        vendor: null,
        initialRequest: request.body.initialRequest,
        initialValues: request.body.initialValues ?? {},
      }));
    }
    if (!request.body?.blueprintId || !request.body.deviceId || !request.body.vendor) {
      return reply.code(400).send({ error: "MISSING_INPUT", messageFa: "Blueprint، دستگاه و وندور الزامی هستند." });
    }
    const device = await prisma.device.findUnique({ where: { id: request.body.deviceId } });
    if (!device) return reply.code(404).send({ error: "DEVICE_NOT_FOUND", messageFa: "دستگاه انتخاب‌شده پیدا نشد." });
    if (deviceVendor(device) !== request.body.vendor) return reply.code(409).send({ error: "VENDOR_MISMATCH", messageFa: "این Workflow با دستگاه انتخاب‌شده سازگار نیست." });
    return sendResult(reply, startGuidedActionSession({
      blueprintId: request.body.blueprintId,
      deviceId: request.body.deviceId,
      vendor: request.body.vendor,
      initialRequest: request.body.initialRequest,
      initialValues: request.body.initialValues ?? {},
    }));
  });

  app.get<{ Params: { id: string } }>("/api/action-sessions/:id", async (request, reply) => {
    const session = getGuidedActionSession(request.params.id);
    if (!session) return reply.code(404).send({ error: "SESSION_NOT_FOUND", messageFa: "جلسه Workflow پیدا نشد." });
    return session;
  });

  app.post<{ Params: { id: string }; Body: { stepId?: string; values?: Record<string, unknown> } }>("/api/action-sessions/:id/answers", async (request, reply) => {
    if (!request.body?.stepId) return reply.code(400).send({ error: "STEP_REQUIRED", messageFa: "شناسه مرحله الزامی است." });
    return sendResult(reply, await answerGuidedActionStep(request.params.id, { stepId: request.body.stepId, values: request.body.values ?? {} }));
  });

  app.post<{ Params: { id: string }; Body: { requestedBy?: string } }>("/api/action-sessions/:id/build-plan", async (request, reply) => {
    return sendResult(reply, await buildGuidedActionPlan(request.params.id, request.body?.requestedBy));
  });

  app.post<{ Params: { id: string } }>("/api/action-sessions/:id/cancel", async (request, reply) => {
    const session = cancelGuidedActionSession(request.params.id);
    if (!session) return reply.code(404).send({ error: "SESSION_NOT_FOUND", messageFa: "جلسه Workflow پیدا نشد." });
    return session;
  });
};
