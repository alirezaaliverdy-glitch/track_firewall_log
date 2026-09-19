import type { PublicUser } from "../services/auth.service.js";
import type { AuthTransport } from "../security/session-transport.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: PublicUser;
    authSessionToken?: string;
    authTransport?: AuthTransport;
  }
}
