import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import { getCapabilitiesForVendor } from "../vendors/capability.registry.js";
import { getPlatformsForVendor } from "../vendors/platform.registry.js";
import { listVendors, refreshDeviceVendorCapabilities, VendorCapabilityRefreshError, vendorDetail } from "../vendors/capability-discovery.service.js";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isArchived(capabilities: unknown) {
  const caps = object(capabilities);
  return object(caps.inventory).archived === true || object(caps.inventoryArchive).archived === true;
}

export const vendorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/vendors", async () => ({ vendors: listVendors() }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey", async (request, reply) => vendorDetail(request.params.vendorKey) ?? reply.code(404).send({ error: "Vendor not found" }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey/platforms", async (request) => ({ platforms: getPlatformsForVendor(request.params.vendorKey) }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey/capabilities", async (request) => ({ capabilities: getCapabilitiesForVendor(request.params.vendorKey) }));
  app.post<{ Params: { deviceId: string } }>("/api/devices/:deviceId/capabilities/refresh", async (request, reply) => {
    try {
      return (await refreshDeviceVendorCapabilities(request.params.deviceId, true)) ?? reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Device not found" } });
    } catch (error) {
      if (error instanceof VendorCapabilityRefreshError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  app.get("/api/vendors/cisco/devices", async () => {
    const devices = await prisma.device.findMany({
      where: { vendor: { contains: "cisco", mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { deviceCapabilityCaches: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    const active = devices.filter((device) => !isArchived(device.capabilities));
    return {
      data: active.map((device) => {
        const cache = device.deviceCapabilityCaches[0];
        const detection = object(cache?.detectionJson ?? object(device.capabilities).ciscoDetection);
        const facts = object(cache?.factsJson);
        return {
          id: device.id,
          name: device.name,
          host: device.host,
          port: device.managementPort,
          status: device.status,
          platform: cache?.platformKey ?? detection.platform ?? device.type,
          version: facts.version ?? detection.version ?? null,
          model: facts.model ?? detection.model ?? null,
          hostname: facts.hostname ?? detection.hostname ?? null,
          supported: detection.supported === true || cache?.platformKey === "cisco-ios-xe",
          updatedAt: device.updatedAt,
          route: `/assets/devices/${device.id}`
        };
      }),
      pagination: { page: 1, pageSize: 100, total: active.length, totalPages: active.length ? 1 : 0 },
      meta: { source: "Device", note: "Cisco inventory is based on registered active devices and latest capability detection evidence." },
      warnings: active.length ? [] : ["No active Cisco device is registered yet."]
    };
  });
};
