import type { FastifyPluginAsync } from "fastify";
import { getProductNavigation, getProductStateContract, getProductVendors, PRODUCT_FEATURES, PRODUCT_INTEGRATIONS } from "../product-state/product-state.registry.js";

export const productStateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/product-state", async () => getProductStateContract());
  app.get("/api/product-state/navigation", async () => ({ contractVersion: "19A.1", navigation: getProductNavigation() }));
  app.get("/api/product-state/features", async () => ({ contractVersion: "19A.1", features: PRODUCT_FEATURES }));
  app.get("/api/product-state/vendors", async () => ({ contractVersion: "19A.1", vendors: getProductVendors() }));
  app.get("/api/product-state/integrations", async () => ({ contractVersion: "19A.1", integrations: PRODUCT_INTEGRATIONS }));
};
