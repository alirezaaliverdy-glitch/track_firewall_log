import type { FastifyPluginAsync } from "fastify";
import { getProductNavigation, getProductStateContract, getProductVendors, PRODUCT_FEATURES, PRODUCT_INTEGRATIONS, PRODUCT_STATE_CONTRACT_VERSION } from "../product-state/product-state.registry.js";

export const productStateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/product-state", async () => getProductStateContract());
  app.get("/api/product-state/navigation", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, navigation: getProductNavigation() }));
  app.get("/api/product-state/features", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, features: PRODUCT_FEATURES }));
  app.get("/api/product-state/vendors", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, vendors: getProductVendors() }));
  app.get("/api/product-state/integrations", async () => ({ contractVersion: PRODUCT_STATE_CONTRACT_VERSION, integrations: PRODUCT_INTEGRATIONS }));
};
