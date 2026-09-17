import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { AUTH_COOKIE_NAME, getSessionUser } from "../services/auth.service.js";
import { findMutationPermission, isMutationMethod } from "../security/authorization.js";
import { hasPermission } from "../security/permissions.js";
import { CSRF_HEADER_NAME, validateCsrfToken } from "../security/csrf.js";
import { consumeRouteRateLimit } from "../security/rate-limit.js";

const PUBLIC_PATHS = new Set([
  "/health",
  "/api/health",
  "/api/health/live",
  "/api/health/ready",
  "/api/auth/login",
  "/api/auth/session-status",
  "/api/auth/status",
  "/api/auth/me"
]);

const CSRF_EXEMPT_PATHS = new Set(["/api/auth/login"]);

function forbidden(reasonCode: string, messageFa: string) {
  return {
    error: "forbidden",
    reasonCode,
    messageFa
  };
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAllowedOrigin(origin: string | undefined) {
  return !origin || env.corsOrigins.includes(origin);
}

export async function registerSecurityPlugin(app: FastifyInstance, options: { authRequired: boolean }) {
  app.addHook("preHandler", async (request, reply) => {
    const pathname = request.url.split("?", 1)[0];
    if (!pathname.startsWith("/api/") && pathname !== "/health") return;
    if (!options.authRequired) return;

    if (!PUBLIC_PATHS.has(pathname)) {
      const user = await getSessionUser(request.cookies[AUTH_COOKIE_NAME]);
      if (!user) {
        return reply.code(401).send({
          ok: false,
          error: "unauthorized",
          messageFa: "برای دسترسی باید وارد حساب کاربری شوید."
        });
      }
      request.authUser = user;
    }

    const rateLimit = consumeRouteRateLimit(request, pathname);
    if (rateLimit && !rateLimit.allowed) {
      reply.header("Retry-After", String(rateLimit.retryAfterSeconds));
      return reply.code(429).send({
        error: "too_many_requests",
        reasonCode: rateLimit.reasonCode,
        retryAfter: rateLimit.retryAfterSeconds,
        messageFa: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید."
      });
    }

    if (!isMutationMethod(request.method) || !pathname.startsWith("/api/")) return;
    if (CSRF_EXEMPT_PATHS.has(pathname)) return;

    const origin = headerValue(request.headers.origin);
    if (!isAllowedOrigin(origin)) {
      return reply.code(403).send(forbidden(
        "ORIGIN_NOT_ALLOWED",
        "مبدأ درخواست مجاز نیست."
      ));
    }

    const csrfHeader = headerValue(request.headers[CSRF_HEADER_NAME]);
    if (!validateCsrfToken(request.cookies[AUTH_COOKIE_NAME], csrfHeader)) {
      return reply.code(403).send(forbidden(
        "CSRF_VALIDATION_FAILED",
        "اعتبارسنجی امنیتی درخواست ناموفق بود."
      ));
    }

    const permission = findMutationPermission(request.method, pathname);
    if (!permission) {
      return reply.code(403).send(forbidden(
        "MUTATION_PERMISSION_UNDECLARED",
        "مجوز این عملیات در سیاست امنیتی تعریف نشده است."
      ));
    }

    if (request.authUser && !hasPermission(request.authUser.role, permission)) {
      return reply.code(403).send(forbidden(
        "PERMISSION_DENIED",
        "نقش کاربری شما اجازه انجام این عملیات را ندارد."
      ));
    }
  });
}
