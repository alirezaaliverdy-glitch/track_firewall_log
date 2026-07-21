import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const AUTH_COOKIE_NAME = "firewall_session";
export const AUTH_COOKIE_PATH = "/";

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "operator" | "viewer";
};

export function hashSessionToken(token: string) {
  return createHmac("sha256", env.authSessionSecret).update(token).digest("hex");
}

export function publicUser(user: PublicUser): PublicUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

export async function bootstrapAdmin() {
  if (await prisma.appUser.count()) return false;
  if (env.adminPassword.length < 8) {
    throw new Error("ADMIN_PASSWORD must contain at least 8 characters before the first user can be created");
  }
  const passwordHash = await bcrypt.hash(env.adminPassword, 12);
  await prisma.appUser.create({
    data: {
      username: env.adminUsername.toLowerCase(),
      passwordHash,
      displayName: env.adminDisplayName,
      role: "admin"
    }
  });
  return true;
}

export async function authenticate(username: string, password: string) {
  if (!username.trim() || password.length < 8) return null;
  const user = await prisma.appUser.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return publicUser(user);
}

export async function createSession(userId: string, metadata: { userAgent?: string; ipAddress?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.authSessionTtlHours * 60 * 60 * 1000);
  await pruneExpiredSessions();
  await prisma.authSession.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt, ...metadata }
  });
  return { token, expiresAt };
}

export async function getSessionUser(token?: string) {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const now = new Date();
  const idleTimeoutMs = env.authSessionIdleMinutes * 60 * 1000;
  if (now.getTime() - session.lastSeenAt.getTime() > idleTimeoutMs) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    void prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return publicUser(session.user);
}

export async function destroySession(token?: string) {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function destroyAllSessionsForUser(userId: string) {
  await prisma.authSession.deleteMany({ where: { userId } });
}

export async function pruneExpiredSessions(now = new Date()) {
  await prisma.authSession.deleteMany({ where: { expiresAt: { lte: now } } });
}
