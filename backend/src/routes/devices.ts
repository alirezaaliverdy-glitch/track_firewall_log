import type { FastifyPluginAsync } from "fastify";
import {
  createDevice,
  deleteDevice,
  getDeviceById,
  listDevices,
  testDeviceConnection,
  updateDevice
} from "../services/device.service.js";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/devices", async (_request, reply) => {
    try {
      return {
        devices: await listDevices()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list devices";
      return reply.code(500).send({
        error: "Failed to list devices",
        detail: message
      });
    }
  });

  app.post<{ Body: Record<string, unknown> }>("/api/devices", async (request, reply) => {
    try {
      const device = await createDevice(request.body ?? {});
      return reply.code(201).send(device);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid device input";
      return reply.code(400).send({
        error: "Failed to create device",
        detail: message
      });
    }
  });

  app.get<{ Params: { id: string } }>("/api/devices/:id", async (request, reply) => {
    const device = await getDeviceById(request.params.id);

    if (!device) {
      return reply.code(404).send({ error: "Device not found" });
    }

    return device;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/devices/:id", async (request, reply) => {
    try {
      return await updateDevice(request.params.id, request.body ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid device input";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({ error: statusCode === 404 ? "Device not found" : message });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/devices/:id", async (request, reply) => {
    try {
      await deleteDevice(request.params.id);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Device not found" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/devices/:id/test-connection", async (request, reply) => {
    const result = await testDeviceConnection(request.params.id);

    if (!result) {
      return reply.code(404).send({ error: "Device not found" });
    }

    return result;
  });
};
