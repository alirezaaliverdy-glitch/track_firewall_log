import type { FastifyPluginAsync } from "fastify";
import {
  createDevice,
  DuplicateDeviceError,
  deleteDevice,
  getDeviceById,
  listDevices,
  testDeviceConnection,
  updateDevice
} from "../services/device.service.js";
import { getDeviceVendorCapabilities } from "../vendors/capability-discovery.service.js";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { companyId?: string } }>("/api/devices", async (request, reply) => {
    try {
      return {
        devices: await listDevices(request.authUser?.id, request.query.companyId)
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
      const device = await createDevice(request.body ?? {}, request.authUser?.id);
      return reply.code(201).send(device);
    } catch (error) {
      if (error instanceof DuplicateDeviceError) {
        return reply.code(409).send({ error: { code: "DUPLICATE_DEVICE", message: error.message, deviceId: error.deviceId, route: `/assets/devices/${error.deviceId}` } });
      }
      const message = error instanceof Error ? error.message : "Invalid device input";
      return reply.code(400).send({
        error: "Failed to create device",
        detail: message
      });
    }
  });
  app.get<{ Params: { id: string } }>("/api/devices/:id", async (request, reply) => {
    const device = await getDeviceById(request.params.id, request.authUser?.id);

    if (!device) {
      return reply.code(404).send({ error: "Device not found" });
    }

    return device;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/devices/:id", async (request, reply) => {
    try {
      return await updateDevice(request.params.id, request.body ?? {}, request.authUser?.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid device input";
      const statusCode = message.includes("Record to update not found") ? 404 : 400;
      return reply.code(statusCode).send({ error: statusCode === 404 ? "Device not found" : message });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/devices/:id", async (request, reply) => {
    try {
      const result = await deleteDevice(request.params.id, request.authUser?.id);
      return result ?? reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Device not found." } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Device removal failed.";
      return reply.code(409).send({ error: { code: "DEVICE_REMOVAL_FAILED", message } });
    }
  });
  app.post<{ Params: { id: string } }>("/api/devices/:id/test-connection", async (request, reply) => {
    try {
      const result = await testDeviceConnection(request.params.id, request.authUser?.id);

      if (!result) {
        return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      return reply.code(400).send({ error: "Connection test failed", detail: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/devices/:id/capabilities", async (request, reply) => {
    if (!await getDeviceById(request.params.id, request.authUser?.id)) {
      return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
    }
    const capabilities = await getDeviceVendorCapabilities(request.params.id);

    if (!capabilities) {
      return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
    }

    return capabilities;
  });
};
