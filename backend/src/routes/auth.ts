import type { FastifyInstance } from "fastify";
import { isProduction } from "../config/env.js";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  authenticate,
  createSession,
  destroySession,
  getSessionUser
} from "../services/auth.service.js";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const key = request.ip;
    const now = Date.now();
    const entry = attempts.get(key);
    const current = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : entry;
    if (current.count >= MAX_ATTEMPTS) {
      return reply.code(429).send({ ok: false, error: "too_many_attempts", messageFa: "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." });
    }

    const user = await authenticate(request.body?.username ?? "", request.body?.password ?? "");
    if (!user) {
      current.count += 1;
      attempts.set(key, current);
      return reply.code(401).send({ ok: false, error: "invalid_credentials", messageFa: "نام کاربری یا رمز عبور اشتباه است." });
    }

    attempts.delete(key);
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip
    });
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

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(request.cookies[AUTH_COOKIE_NAME]);
    reply.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
    return { ok: true };
  });
}
