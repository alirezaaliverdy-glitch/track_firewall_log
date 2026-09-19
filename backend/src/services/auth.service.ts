import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { passwordPolicyViolations } from "../security/password-policy.js";

export const AUTH_COOKIE_NAME = "firewall_session";
export const AUTH_COOKIE_PATH = "/";
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString("base64url"), 12);

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "operator" | "viewer";
  allowedSections: string[];
};

export type PublicAuthSession = {
  id: string;
  current: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
};

export function hashSessionToken(token: string) {
  return createHmac("sha256", env.authSessionSecret).update(token).digest("hex");
}

export function publicUser(user: PublicUser): PublicUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, allowedSections: user.allowedSections };
}

export async function authenticate(username: string, password: string) {
  if (!username.trim() || username.length > 128 || password.length < 6 || password.length > 128) return null;
  const user = await prisma.appUser.findUnique({ where: { username: username.trim().toLowerCase() } });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? await dummyPasswordHash);
  if (!user || !user.isActive || !passwordMatches) return null;
  return publicUser(user);
}

export async function createSession(userId: string, metadata: { userAgent?: string; ipAddress?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.authSessionTtlHours * 60 * 60 * 1000);
  await pruneExpiredSessions();
  await prisma.authSession.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt, ...metadata }
  });
  const excessSessions = await prisma.authSession.findMany({
    where: { userId },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    skip: env.authMaxActiveSessions,
    select: { id: true }
  });
  if (excessSessions.length > 0) {
    await prisma.authSession.deleteMany({ where: { id: { in: excessSessions.map(({ id }) => id) } } });
  }
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

export async function listSessionsForUser(userId: string, currentToken?: string): Promise<PublicAuthSession[]> {
  const currentTokenHash = currentToken ? hashSessionToken(currentToken) : null;
  const idleCutoff = new Date(Date.now() - env.authSessionIdleMinutes * 60 * 1000);
  const sessions = await prisma.authSession.findMany({
    where: { userId, expiresAt: { gt: new Date() }, lastSeenAt: { gt: idleCutoff } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      tokenHash: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      userAgent: true,
      ipAddress: true
    }
  });
  return sessions.map(({ tokenHash, ...session }) => ({
    ...session,
    current: tokenHash === currentTokenHash
  }));
}

export async function revokeSessionForUser(userId: string, sessionId: string, currentToken?: string) {
  const session = await prisma.authSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, tokenHash: true }
  });
  if (!session) return { revoked: false, current: false };
  await prisma.authSession.delete({ where: { id: session.id } });
  return {
    revoked: true,
    current: Boolean(currentToken && session.tokenHash === hashSessionToken(currentToken))
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || currentPassword.length > 128 || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, reason: "CURRENT_PASSWORD_INVALID" as const, violations: [] as string[] };
  }
  const violations = passwordPolicyViolations(newPassword, user.username);
  if (violations.length > 0) {
    return { ok: false as const, reason: "PASSWORD_POLICY_FAILED" as const, violations };
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return { ok: false as const, reason: "PASSWORD_REUSED" as const, violations: ["PASSWORD_REUSED"] };
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.appUser.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.authSession.deleteMany({ where: { userId } })
  ]);
  return { ok: true as const };
}

export async function pruneExpiredSessions(now = new Date()) {
  await prisma.authSession.deleteMany({ where: { expiresAt: { lte: now } } });
}
