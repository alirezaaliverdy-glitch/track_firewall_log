import { IncidentStatus } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  getIncident,
  getIncidentEvents,
  listIncidents,
  parseIncidentFilters,
  updateIncidentStatus
} from "../services/incident.service.js";

export const incidentRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, unknown> }>("/api/incidents", async (request) => {
    return listIncidents(parseIncidentFilters(request.query ?? {}));
  });

  app.get<{ Params: { id: string } }>("/api/incidents/:id", async (request, reply) => {
    const incident = await getIncident(request.params.id);

    if (!incident) {
      return reply.code(404).send({ error: "Incident not found" });
    }

    return incident;
  });

  app.get<{ Params: { id: string } }>("/api/incidents/:id/events", async (request, reply) => {
    const events = await getIncidentEvents(request.params.id);

    if (!events) {
      return reply.code(404).send({ error: "Incident not found" });
    }

    return events;
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/api/incidents/:id", async (request, reply) => {
    if (!request.body?.status || !(request.body.status in IncidentStatus)) {
      return reply.code(400).send({
        error: "Invalid incident status",
        allowedStatuses: Object.values(IncidentStatus)
      });
    }

    try {
      return await updateIncidentStatus(request.params.id, request.body.status as IncidentStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update incident";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({
        error: statusCode === 404 ? "Incident not found" : "Failed to update incident",
        detail: message
      });
    }
  });
};
