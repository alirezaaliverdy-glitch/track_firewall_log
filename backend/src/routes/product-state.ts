import type { FastifyPluginAsync } from "fastify";
import { getProductNavigation, getProductStateContract, getProductVendors, PRODUCT_FEATURES, PRODUCT_INTEGRATIONS, PRODUCT_STATE_CONTRACT_VERSION } from "../product-state/product-state.registry.js";

export const productStateRoutes: FastifyPluginAsync = async (app) => {
  const allowedGroups = (request: { authUser?: { role: string; allowedSections: string[] } }) => request.authUser?.role === "admin" ? undefined : request.authUser?.allowedSections;
  app.get("/api/product-state", async (request) => getProductStateContract(allowedGroups(request)));
  app.get("/api/product-state/navigation", async (request) => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, navigation: getProductNavigation(allowedGroups(request)) }));
  app.get("/api/product-state/features", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, features: PRODUCT_FEATURES }));
  app.get("/api/product-state/vendors", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, vendors: getProductVendors() }));
  app.get("/api/product-state/integrations", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, integrations: PRODUCT_INTEGRATIONS }));
};
