import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  applyAssetImport,
  getAsset,
  getAssetTopology,
  listAssets,
  previewAssetImport,
  syncExistingDevicesToAssets
} from "../assets/asset-intelligence.service.js";
import { mockNetBoxAssets, mockNetBoxHealth } from "../integrations/netbox/mock-adapter.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/assets", async () => listAssets());

  app.get<{ Params: { id: string } }>("/api/assets/:id", async (request, reply) => {
    const asset = await getAsset(request.params.id);
    return asset ? asset : reply.code(404).send({ error: "Asset not found" });
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
