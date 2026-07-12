import type { FastifyPluginAsync } from "fastify";
import { getCapabilitiesForVendor } from "../vendors/capability.registry.js";
import { getPlatformsForVendor } from "../vendors/platform.registry.js";
import { listVendors, refreshDeviceVendorCapabilities, vendorDetail } from "../vendors/capability-discovery.service.js";

export const vendorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/vendors", async () => ({ vendors: listVendors() }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey", async (request, reply) => vendorDetail(request.params.vendorKey) ?? reply.code(404).send({ error: "Vendor not found" }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey/platforms", async (request) => ({ platforms: getPlatformsForVendor(request.params.vendorKey) }));
  app.get<{ Params: { vendorKey: string } }>("/api/vendors/:vendorKey/capabilities", async (request) => ({ capabilities: getCapabilitiesForVendor(request.params.vendorKey) }));
  app.post<{ Params: { deviceId: string } }>("/api/devices/:deviceId/capabilities/refresh", async (request, reply) => (await refreshDeviceVendorCapabilities(request.params.deviceId, true)) ?? reply.code(404).send({ error: "Device not found" }));

  app.get("/api/vendors/cisco/devices", async () => ({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 }, meta: { note: "Cisco device operational inventory is populated after platform detection refresh." }, warnings: [] }));
};
