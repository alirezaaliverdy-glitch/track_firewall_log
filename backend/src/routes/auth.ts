import type { FastifyInstance, FastifyRequest } from "fastify";
import { isProduction } from "../config/env.js";
import {
  databaseUnavailableReason,
  isTransientDatabaseStartupError
} from "../db/prisma.js";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  authenticate,
  createSession,
  destroySession,
  getSessionUser
} from "../services/auth.service.js";
import { csrfTokenForSession } from "../security/csrf.js";
import { assertLoginRateLimit, resetLoginRateLimit } from "../security/rate-limit.js";

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const username = request.body?.username ?? "";
    const loginLimit = assertLoginRateLimit(request.ip, username);
    if (!loginLimit.allowed) {
      reply.header("Retry-After", String(loginLimit.retryAfterSeconds));
      return reply.code(429).send({
        ok: false,
        error: "too_many_attempts",
        reasonCode: loginLimit.reasonCode,
        retryAfter: loginLimit.retryAfterSeconds,
        messageFa: "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید."
      });
    }

    let user;
    try {
      user = await authenticate(username, request.body?.password ?? "");
    } catch (error) {
      if (isTransientDatabaseStartupError(error)) {
        const reason = databaseUnavailableReason(error);
        return reply.code(503).send({
          ok: false,
          error: "database_unavailable",
          reasonCode: "DATABASE_UNAVAILABLE",
          retryable: reason.transient,
          messageFa: "پایگاه داده برای ورود آماده نیست. چند لحظه دیگر دوباره تلاش کنید."
        });
      }
      throw error;
    }
    if (!user) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials", messageFa: "نام کاربری یا رمز عبور اشتباه است." });
    }

    resetLoginRateLimit(request.ip, username);
    let token: string;
    let expiresAt: Date;
    try {
      const session = await createSession(user.id, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip
      });
      token = session.token;
      expiresAt = session.expiresAt;
    } catch (error) {
      if (isTransientDatabaseStartupError(error)) {
        const reason = databaseUnavailableReason(error);
        return reply.code(503).send({
          ok: false,
          error: "database_unavailable",
          reasonCode: "DATABASE_UNAVAILABLE",
          retryable: reason.transient,
          messageFa: "پایگاه داده برای ایجاد نشست آماده نیست. چند لحظه دیگر دوباره تلاش کنید."
        });
      }
      throw error;
    }
    reply.setCookie(AUTH_COOKIE_NAME, token, {
      path: AUTH_COOKIE_PATH,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      expires: expiresAt
    });
    return { ok: true, user };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await getSessionUser(request.cookies[AUTH_COOKIE_NAME]);
    if (!user) return reply.code(401).send({ ok: false, error: "unauthorized", messageFa: "برای دسترسی باید وارد حساب کاربری شوید." });
    return { ok: true, user };
  });

  const sessionStatus = async (request: FastifyRequest) => {
    const user = await getSessionUser(request.cookies[AUTH_COOKIE_NAME]);
    return { ok: true, authenticated: Boolean(user), user };
  };

  app.get("/api/auth/session-status", sessionStatus);
  app.get("/api/auth/status", sessionStatus);

  app.get("/api/auth/csrf", async (request, reply) => {
    const token = request.cookies[AUTH_COOKIE_NAME];
    const user = await getSessionUser(token);
    if (!user || !token) return reply.code(401).send({ ok: false, error: "unauthorized", messageFa: "برای دسترسی باید وارد حساب کاربری شوید." });
    return { ok: true, csrfToken: csrfTokenForSession(token) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(request.cookies[AUTH_COOKIE_NAME]);
    reply.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
    return { ok: true };
  });
}
