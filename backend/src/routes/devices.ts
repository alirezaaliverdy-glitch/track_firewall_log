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
import { configureEsxiSecondaryChannel, configureSnmpv3Channel } from "../services/device-connection-channel.service.js";
import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";
import { netflowDeviceStatus, netflowExporterSettings, netflowReceiverStatus, refreshNetflowExporters, validExporterIp } from "../services/netflow-v5.service.js";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/api/devices/:id/netflow", async (request, reply) => {
    const device = await getDeviceById(request.params.id, request.authUser?.scopeOwnerId);
    if (!device) return reply.code(404).send({ error: "Device not found" });
    const latest = await prisma.metricSample.findFirst({ where: { deviceId: device.id, source: "netflow-v5", metricKey: "flow.bytes" }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
    const receiver = netflowReceiverStatus();
    return { ...netflowExporterSettings(device.capabilities), lastSeenAt: latest?.timestamp ?? null, receiver: { listening: receiver.listening, port: receiver.port, hostBind: receiver.hostBind, lastError: receiver.lastError }, packets: netflowDeviceStatus(device.id) };
  });

  app.put<{ Params: { id: string }; Body: { enabled?: unknown; exporterIp?: unknown } }>("/api/devices/:id/netflow", async (request, reply) => {
    if (request.authUser?.role !== "admin") return reply.code(403).send({ error: "ADMIN_REQUIRED" });
    const ownerId = request.authUser.scopeOwnerId ?? request.authUser.id;
    const device = await getDeviceById(request.params.id, ownerId);
    if (!device) return reply.code(404).send({ error: "Device not found" });
    const enabled = request.body?.enabled === true;
    const exporterIp = request.body?.exporterIp;
    if (typeof request.body?.enabled !== "boolean" || !validExporterIp(exporterIp)) return reply.code(400).send({ error: "VALID_IPV4_EXPORTER_REQUIRED" });
    const competitors = await prisma.device.findMany({ where: { id: { not: device.id }, deletedAt: null, company: { deletedAt: null } }, select: { capabilities: true } });
    if (enabled && competitors.some((candidate) => { const config = netflowExporterSettings(candidate.capabilities); return config.enabled && config.exporterIp === exporterIp; })) return reply.code(409).send({ error: "EXPORTER_IP_ALREADY_ASSIGNED" });
    const capabilities = device.capabilities && typeof device.capabilities === "object" && !Array.isArray(device.capabilities) ? device.capabilities as Record<string, unknown> : {};
    await prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: device.id }, data: { capabilities: { ...capabilities, netflowV5: { enabled, exporterIp } } as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { deviceId: device.id, action: "device.netflow_configured", targetType: "device", targetId: device.id, dryRun: false, approvalStatus: "not_required", metadata: { enabled, exporterIp, actorId: request.authUser!.id } } });
    });
    await refreshNetflowExporters();
    return { enabled, exporterIp, receiver: netflowReceiverStatus() };
  });
  app.get<{ Querystring: { companyId?: string } }>("/api/devices", async (request, reply) => {
    try {
      return {
        devices: await listDevices(request.authUser?.scopeOwnerId, request.query.companyId)
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
      const device = await createDevice(request.body ?? {}, request.authUser?.scopeOwnerId);
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
    const device = await getDeviceById(request.params.id, request.authUser?.scopeOwnerId);

    if (!device) {
      return reply.code(404).send({ error: "Device not found" });
    }

    return device;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/devices/:id", async (request, reply) => {
    try {
      return await updateDevice(request.params.id, request.body ?? {}, request.authUser?.scopeOwnerId);
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
      const result = await testDeviceConnection(request.params.id, request.authUser?.scopeOwnerId);

      if (!result) {
        return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";
      return reply.code(400).send({ error: "Connection test failed", detail: message });
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/devices/:id/observability/snmpv3", async (request, reply) => {
    const device = await getDeviceById(request.params.id, request.authUser?.scopeOwnerId);
    if (!device) return reply.code(404).send({ error: "Device not found" });
    try {
      return await configureSnmpv3Channel(device, request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid SNMPv3 settings" });
    }
  });
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/devices/:id/observability/esxi", async (request, reply) => {
    const device = await getDeviceById(request.params.id, request.authUser?.scopeOwnerId);
    if (!device) return reply.code(404).send({ error: "Device not found" });
    try { return await configureEsxiSecondaryChannel(device, request.body ?? {}); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid ESXi settings" }); }
  });

  app.get<{ Params: { id: string } }>("/api/devices/:id/capabilities", async (request, reply) => {
    if (!await getDeviceById(request.params.id, request.authUser?.scopeOwnerId)) {
      return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
    }
    const capabilities = await getDeviceVendorCapabilities(request.params.id);

    if (!capabilities) {
      return reply.code(404).send({ error: "Device not found", code: "DEVICE_NOT_FOUND" });
    }

    return capabilities;
  });
};
