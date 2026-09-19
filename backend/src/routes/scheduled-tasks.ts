import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  cancelScheduledTask,
  createScheduledTask,
  listScheduledTaskHistory,
  listScheduledTasks,
  runScheduledTaskNow,
  ScheduledTaskError,
  setScheduledTaskPaused,
  updateScheduledTask,
} from "../services/scheduled-task.service.js";

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ScheduledTaskError) {
    return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export const scheduledTaskRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { status?: string; deviceId?: string } }>("/api/scheduled-tasks", async (request) => ({
    tasks: await listScheduledTasks(request.query),
  }));

  app.get<{ Querystring: { limit?: string } }>("/api/scheduled-tasks/history", async (request) => ({
    runs: await listScheduledTaskHistory(Number(request.query.limit ?? 100)),
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/scheduled-tasks", async (request, reply) => {
    try {
      return reply.code(201).send(await createScheduledTask(request.body ?? {}, request.authUser!));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/scheduled-tasks/:id", async (request, reply) => {
    try {
      return await updateScheduledTask(request.params.id, request.body ?? {}, request.authUser!);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/scheduled-tasks/:id/pause", async (request, reply) => {
    try {
      return await setScheduledTaskPaused(request.params.id, true, request.authUser!);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>("/api/scheduled-tasks/:id/resume", async (request, reply) => {
    try {
      return await setScheduledTaskPaused(request.params.id, false, request.authUser!);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { id: string }; Body: { confirmed?: boolean } }>("/api/scheduled-tasks/:id/run-now", async (request, reply) => {
    if (request.body?.confirmed !== true) return reply.code(428).send({ error: { code: "RUN_CONFIRMATION_REQUIRED", message: "تأیید اجرای فوری لازم است." } });
    try {
      return await runScheduledTaskNow(request.params.id, request.authUser!);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post<{ Params: { id: string }; Body: { confirmed?: boolean } }>("/api/scheduled-tasks/:id/cancel", async (request, reply) => {
    if (request.body?.confirmed !== true) return reply.code(428).send({ error: { code: "CANCEL_CONFIRMATION_REQUIRED", message: "تأیید لغو لازم است." } });
    try {
      return await cancelScheduledTask(request.params.id, request.authUser!);
    } catch (error) {
      return sendError(reply, error);
    }
  });
};
