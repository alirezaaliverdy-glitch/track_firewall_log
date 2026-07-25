import type { PublicUser } from "../services/auth.service.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: PublicUser;
  }
}
