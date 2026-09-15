import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isProduction } from "../config/env.js";
import {
  databaseUnavailableReason,
  isTransientDatabaseStartupError
} from "../db/prisma.js";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  authenticate,
  changePassword,
  createSession,
  destroyAllSessionsForUser,
  destroySession,
  getSessionUser,
  listSessionsForUser,
  revokeSessionForUser
} from "../services/auth.service.js";
import { csrfTokenForSession } from "../security/csrf.js";
import { assertLoginRateLimit, resetLoginRateLimit } from "../security/rate-limit.js";
import { prisma } from "../db/prisma.js";
import { hasPermission } from "../security/permissions.js";
import { isTrustedNativeLogin, sessionCredentialsForRequest } from "../security/session-transport.js";

function auditAuthEvent(input: {
  action: string;
  actor?: string;
  targetId?: string;
  request: FastifyRequest;
  outcome: "succeeded" | "failed" | "blocked";
}) {
  const userAgent = input.request.headers["user-agent"]?.slice(0, 500);
  void prisma.auditLog.create({
    data: {
      actor: input.actor?.slice(0, 128),
      action: input.action,
      targetType: "authentication",
      targetId: input.targetId,
      dryRun: false,
      approvalStatus: "not_required",
      metadata: { outcome: input.outcome, ipAddress: input.request.ip, ...(userAgent ? { userAgent } : {}) }
    }
  }).catch(() => undefined);
}

function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const username = request.body?.username ?? "";
    const loginLimit = assertLoginRateLimit(request.ip, username);
    if (!loginLimit.allowed) {
      auditAuthEvent({ action: "auth.login", actor: username.trim().toLowerCase(), request, outcome: "blocked" });
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
      auditAuthEvent({ action: "auth.login", actor: username.trim().toLowerCase(), request, outcome: "failed" });
      return reply.code(401).send({ ok: false, error: "invalid_credentials", messageFa: "نام کاربری یا رمز عبور اشتباه است." });
    }

    let token: string;
    let expiresAt: Date;
    try {
      const session = await createSession(user.id, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip
      });
      token = session.token;
      expiresAt = session.expiresAt;
      await destroySession(sessionCredentialsForRequest(request).token);
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
    resetLoginRateLimit(request.ip, username);
    const nativeLogin = isTrustedNativeLogin(request);
    if (!nativeLogin) {
      reply.setCookie(AUTH_COOKIE_NAME, token, {
        path: AUTH_COOKIE_PATH,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        priority: "high",
        expires: expiresAt
      });
    }
    auditAuthEvent({ action: "auth.login", actor: user.username, targetId: user.id, request, outcome: "succeeded" });
    return { ok: true, user, ...(nativeLogin ? { sessionToken: token, expiresAt } : {}) };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await getSessionUser(sessionCredentialsForRequest(request).token);
    if (!user) return reply.code(401).send({ ok: false, error: "unauthorized", messageFa: "برای دسترسی باید وارد حساب کاربری شوید." });
    return { ok: true, user };
  });

  const sessionStatus = async (request: FastifyRequest) => {
    const user = await getSessionUser(sessionCredentialsForRequest(request).token);
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

  app.get("/api/auth/sessions", async (request, reply) => {
    if (!hasPermission(request.authUser!.role, "auth.session.terminate")) {
      return reply.code(403).send({ ok: false, error: "admin_required", messageFa: "پایان‌دادن نشست‌ها فقط برای مدیر سامانه مجاز است." });
    }
    return { ok: true, sessions: await listSessionsForUser(request.authUser!.id, request.authSessionToken) };
  });

  app.delete<{ Params: { id: string } }>("/api/auth/sessions/:id", async (request, reply) => {
    const result = await revokeSessionForUser(request.authUser!.id, request.params.id, request.authSessionToken);
    if (!result.revoked) {
      return reply.code(404).send({ ok: false, error: "session_not_found", messageFa: "نشست موردنظر پیدا نشد." });
    }
    auditAuthEvent({ action: "auth.session.revoke", actor: request.authUser!.username, targetId: request.params.id, request, outcome: "succeeded" });
    if (result.current) clearAuthCookie(reply);
    return { ok: true, currentSessionRevoked: result.current };
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    await destroyAllSessionsForUser(request.authUser!.id);
    clearAuthCookie(reply);
    auditAuthEvent({ action: "auth.logout_all", actor: request.authUser!.username, targetId: request.authUser!.id, request, outcome: "succeeded" });
    return { ok: true };
  });

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>("/api/auth/change-password", async (request, reply) => {
    const currentPassword = request.body?.currentPassword ?? "";
    const newPassword = request.body?.newPassword ?? "";
    const result = await changePassword(request.authUser!.id, currentPassword, newPassword);
    if (!result.ok && result.reason === "CURRENT_PASSWORD_INVALID") {
      auditAuthEvent({ action: "auth.password.change", actor: request.authUser!.username, targetId: request.authUser!.id, request, outcome: "failed" });
      return reply.code(400).send({ ok: false, error: "current_password_invalid", messageFa: "رمز عبور فعلی صحیح نیست." });
    }
    if (!result.ok) {
      return reply.code(400).send({
        ok: false,
        error: result.reason === "PASSWORD_REUSED" ? "password_reused" : "password_policy_failed",
        violations: result.violations,
        messageFa: result.reason === "PASSWORD_REUSED"
          ? "رمز عبور جدید نباید با رمز فعلی یکسان باشد."
          : "رمز عبور جدید شرایط امنیتی لازم را ندارد."
      });
    }
    clearAuthCookie(reply);
    auditAuthEvent({ action: "auth.password.change", actor: request.authUser!.username, targetId: request.authUser!.id, request, outcome: "succeeded" });
    return { ok: true, signedOut: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(request.authSessionToken);
    clearAuthCookie(reply);
    auditAuthEvent({ action: "auth.logout", actor: request.authUser?.username, targetId: request.authUser?.id, request, outcome: "succeeded" });
    return { ok: true };
  });
}
