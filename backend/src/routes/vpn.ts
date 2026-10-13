import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { listVpn, saveVpn, operateVpn, deleteVpn, testVpn, type VpnActor } from "../vpn/vpn.service.js";
import { VpnError } from "../vpn/vpn-validation.js";

const actor = (request: FastifyRequest): VpnActor => { if (!request.authUser) throw new VpnError("AUTH_REQUIRED", 401); return request.authUser; };
export const vpnRoutes: FastifyPluginAsync = async app => {
  const route = async (request: FastifyRequest, fn: () => Promise<unknown>) => { actor(request); return fn(); };
  app.setErrorHandler((error, _request, reply) => { const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 500; const safe = error instanceof VpnError ? error : new VpnError("VPN_REQUEST_FAILED", Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500); void reply.code(safe.statusCode).send({ error: { code: safe.code } }); });
  app.get("/api/vpn", request => route(request, () => listVpn(actor(request))));
  app.post<{ Body: Record<string, unknown> }>("/api/vpn", (request, reply) => { reply.code(201); return route(request, () => saveVpn(request.body ?? {}, actor(request))); });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/vpn/:id", request => route(request, () => saveVpn(request.body ?? {}, actor(request), request.params.id)));
  app.delete<{ Params: { id: string } }>("/api/vpn/:id", request => route(request, () => deleteVpn(request.params.id, actor(request))));
  for (const operation of ["connect", "disconnect"] as const) app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(`/api/vpn/:id/${operation}`, request => route(request, () => operateVpn(request.params.id, operation, request.body ?? {}, actor(request))));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/vpn/:id/test", request => route(request, () => testVpn(request.params.id, request.body ?? {}, actor(request))));
};
