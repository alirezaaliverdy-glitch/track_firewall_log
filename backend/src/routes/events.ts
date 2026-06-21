import type { FastifyPluginAsync } from "fastify";
import {
  getEventBatch,
  getSecurityEvent,
  getSecurityEventsSummary,
  listEventBatches,
  listSecurityEvents,
  parseEventFilters
} from "../services/event.service.js";

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, unknown> }>("/api/events", async (request) => {
    return listSecurityEvents(parseEventFilters(request.query ?? {}));
  });

  app.get<{ Querystring: Record<string, unknown> }>("/api/events/summary", async (request) => {
    return getSecurityEventsSummary(parseEventFilters(request.query ?? {}));
  });

  app.get<{ Params: { id: string } }>("/api/events/:id", async (request, reply) => {
    const event = await getSecurityEvent(request.params.id);

    if (!event) {
      return reply.code(404).send({ error: "Security event not found" });
    }

    return event;
  });

  app.get<{ Querystring: { limit?: string } }>("/api/event-batches", async (request) => {
    const limit = Number.parseInt(String(request.query.limit ?? ""), 10);
    return listEventBatches(Number.isInteger(limit) ? limit : undefined);
  });

  app.get<{ Params: { id: string } }>("/api/event-batches/:id", async (request, reply) => {
    const batch = await getEventBatch(request.params.id);

    if (!batch) {
      return reply.code(404).send({ error: "Event batch not found" });
    }

    return batch;
  });
};
