import type { FastifyRequest } from "fastify";

const SESSION_COOKIE_NAME = "firewall_session";

export const NATIVE_CLIENT_HEADER = "x-firewall-client";
export const NATIVE_CLIENT_VALUE = "android";
export const NATIVE_APP_ORIGINS = ["https://localhost"] as const;

export type AuthTransport = "cookie" | "bearer";

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function bearerSessionToken(authorization: string | string[] | undefined) {
  const value = firstHeader(authorization)?.trim();
  if (!value) return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return match?.[1];
}

export function sessionCredentialsForRequest(request: FastifyRequest): { token?: string; transport: AuthTransport } {
  const bearer = bearerSessionToken(request.headers.authorization);
  if (bearer) return { token: bearer, transport: "bearer" };
  return { token: request.cookies[SESSION_COOKIE_NAME], transport: "cookie" };
}

export function isTrustedNativeLogin(request: FastifyRequest) {
  const client = firstHeader(request.headers[NATIVE_CLIENT_HEADER]);
  const origin = firstHeader(request.headers.origin);
  return client === NATIVE_CLIENT_VALUE && Boolean(origin && NATIVE_APP_ORIGINS.includes(origin as typeof NATIVE_APP_ORIGINS[number]));
}
