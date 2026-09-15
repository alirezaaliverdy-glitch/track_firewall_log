import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  applyAssetImport,
  getAsset,
  getAssetTopology,
  listAssets,
  removeAssetFromInventory,
  previewAssetImport,
  syncExistingDevicesToAssets
} from "../assets/asset-intelligence.service.js";
import { mockNetBoxAssets, mockNetBoxHealth } from "../integrations/netbox/mock-adapter.js";
import { clearPortOverride, clearServiceEndpointOverride, discoverDevicePorts, listPortTopology, refreshLinuxServicePorts, savePortOverride, saveServiceEndpointOverride } from "../assets/port-topology.service.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { deviceId?: string } }>("/api/assets/port-topology", async (request) => listPortTopology(request.query.deviceId));

  app.post<{ Body: { deviceId?: unknown } }>("/api/assets/port-topology/discover", async (request, reply) => {
    const deviceId = typeof request.body?.deviceId === "string" ? request.body.deviceId : "";
    if (!deviceId) return reply.code(400).send({ error: "DEVICE_ID_REQUIRED" });
    const result = await discoverDevicePorts(deviceId, request.authUser?.id);
    return result ?? reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
  });

  app.post<{ Body: { deviceId?: unknown } }>("/api/assets/port-topology/listeners/refresh", async (request, reply) => {
    const deviceId = typeof request.body?.deviceId === "string" ? request.body.deviceId : "";
    if (!deviceId) return reply.code(400).send({ error: "DEVICE_ID_REQUIRED" });
    try {
      const result = await refreshLinuxServicePorts(deviceId, request.authUser?.id);
      return result ?? reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "LISTENER_REFRESH_FAILED" });
    }
  });

  app.patch<{ Params: { deviceId: string; portName: string }; Body: Record<string, unknown> }>("/api/assets/port-topology/:deviceId/ports/:portName", async (request, reply) => {
    try {
      const result = await savePortOverride(request.params.deviceId, request.params.portName, request.body ?? {}, request.authUser?.id);
      return result ?? reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_PORT_OVERRIDE" });
    }
  });

  app.delete<{ Params: { deviceId: string; portName: string } }>("/api/assets/port-topology/:deviceId/ports/:portName", async (request, reply) => {
    try {
      const result = await clearPortOverride(request.params.deviceId, request.params.portName, request.authUser?.id);
      return result ?? reply.code(404).send({ error: "PORT_NOT_FOUND" });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_PORT_NAME" });
    }
  });

  app.patch<{ Params: { deviceId: string; endpointKey: string }; Body: Record<string, unknown> }>("/api/assets/port-topology/:deviceId/services/:endpointKey", async (request, reply) => {
    try {
      const result = await saveServiceEndpointOverride(request.params.deviceId, request.params.endpointKey, request.body ?? {}, request.authUser?.id);
      return result ?? reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_SERVICE_ENDPOINT" });
    }
  });

  app.delete<{ Params: { deviceId: string; endpointKey: string } }>("/api/assets/port-topology/:deviceId/services/:endpointKey", async (request, reply) => {
    try {
      const result = await clearServiceEndpointOverride(request.params.deviceId, request.params.endpointKey, request.authUser?.id);
      return result ?? reply.code(404).send({ error: "SERVICE_OVERRIDE_NOT_FOUND" });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_SERVICE_ENDPOINT" });
    }
  });
  app.get<{ Querystring: { view?: string } }>("/api/assets", async (request) => {
    const view = request.query.view === "archived" || request.query.view === "all" ? request.query.view : "active";
    return listAssets(view);
  });

  app.get<{ Params: { id: string } }>("/api/assets/:id", async (request, reply) => {
    const asset = await getAsset(request.params.id);
    return asset ? asset : reply.code(404).send({ error: "Asset not found" });
  });

  app.delete<{ Params: { id: string } }>("/api/assets/:id", async (request, reply) => {
    try {
      const result = await removeAssetFromInventory(request.params.id);
      return result ?? reply.code(404).send({ error: { code: "ASSET_NOT_FOUND", message: "Asset not found." } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asset removal failed.";
      return reply.code(409).send({ error: { code: "ASSET_REMOVAL_FAILED", message } });
    }
  });

  app.get<{ Params: { id: string } }>("/api/assets/:id/topology", async (request, reply) => {
    const topology = await getAssetTopology(request.params.id);
    return topology ? topology : reply.code(404).send({ error: "Asset not found" });
  });

  app.get<{ Params: { id: string } }>("/api/assets/:id/findings", async (request) => ({
    findings: await prisma.finding.findMany({ where: { assetId: request.params.id }, orderBy: { lastSeen: "desc" }, take: 100 })
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/assets/import/preview", async (request, reply) => {
    try { return await previewAssetImport(request.body ?? {}); }
    catch (error) { return reply.code(400).send({ error: "Invalid asset import", detail: error instanceof Error ? error.message : "Invalid payload" }); }
  });

  app.post<{ Body: Record<string, unknown> }>("/api/assets/import/apply", async (request, reply) => {
    try { return await applyAssetImport(request.body ?? {}); }
    catch (error) { return reply.code(400).send({ error: "Asset import failed", detail: error instanceof Error ? error.message : "Invalid payload" }); }
  });

  app.post("/api/assets/sync/devices", async () => syncExistingDevicesToAssets());

  app.get("/api/sites", async () => ({ sites: await prisma.assetSite.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { assets: true } } } }) }));
  app.get("/api/vlans", async () => ({ vlans: await prisma.assetVlan.findMany({ orderBy: [{ siteId: "asc" }, { vlanId: "asc" }] }) }));
  app.get("/api/prefixes", async () => ({ prefixes: await prisma.assetPrefix.findMany({ orderBy: { cidr: "asc" }, include: { site: true, vlan: true } }) }));

  app.get("/api/integrations/netbox/health", async () => mockNetBoxHealth());
  app.get("/api/integrations/netbox/sync-preview", async () => previewAssetImport({ sourceType: "netbox", assets: mockNetBoxAssets() }));
  app.post<{ Body: { idempotencyKey?: string } }>("/api/integrations/netbox/sync", async (request) => applyAssetImport({ sourceType: "netbox", idempotencyKey: request.body?.idempotencyKey ?? "mock-netbox-default", assets: mockNetBoxAssets() }));
};
