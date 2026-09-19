import bcrypt from "bcryptjs";
import type { AppUserRole } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { permissionsForRole } from "../security/permissions.js";
import { APPLICATION_SECTIONS, normalizeApplicationSections } from "../security/section-access.js";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const ROLES = new Set<AppUserRole>(["admin", "operator", "viewer"]);

function normalizeRole(value: unknown): AppUserRole {
  const role = String(value ?? "viewer") as AppUserRole;
  if (!ROLES.has(role)) throw new Error("INVALID_USER_ROLE");
  return role;
}

function normalizeIdentity(input: { username?: unknown; displayName?: unknown }) {
  const username = String(input.username ?? "").trim().toLowerCase();
  const displayName = String(input.displayName ?? "").trim();
  if (!USERNAME_PATTERN.test(username)) throw new Error("INVALID_USERNAME");
  if (displayName.length < 2 || displayName.length > 80) throw new Error("INVALID_DISPLAY_NAME");
  return { username, displayName };
}

function validateManagedPassword(password: unknown) {
  const value = String(password ?? "");
  const violations = [
    ...(value.length < 6 ? ["PASSWORD_TOO_SHORT"] : []),
    ...(value.length > 128 ? ["PASSWORD_TOO_LONG"] : [])
  ];
  if (violations.length) {
    const error = new Error("PASSWORD_POLICY_FAILED") as Error & { violations?: string[] };
    error.violations = violations;
    throw error;
  }
  return value;
}

function publicManagedUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: AppUserRole;
  isActive: boolean;
  allowedSections: string[];
  createdAt: Date;
  updatedAt: Date;
  sessions: Array<{ lastSeenAt: Date }>;
  _count: { sessions: number };
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    allowedSections: user.role === "admin" ? [...APPLICATION_SECTIONS] : user.allowedSections,
    effectivePermissions: permissionsForRole(user.role),
    activeSessionCount: user._count.sessions,
    lastSeenAt: user.sessions[0]?.lastSeenAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function managedUserSelect() {
  const now = new Date();
  return {
    id: true,
    username: true,
    displayName: true,
    role: true,
    isActive: true,
    allowedSections: true,
    createdAt: true,
    updatedAt: true,
    sessions: { where: { expiresAt: { gt: now } }, orderBy: { lastSeenAt: "desc" as const }, take: 1, select: { lastSeenAt: true } },
    _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } }
  } as const;
}

export async function listManagedUsers() {
  const users = await prisma.appUser.findMany({ orderBy: [{ isActive: "desc" }, { role: "asc" }, { displayName: "asc" }], select: managedUserSelect() });
  return users.map(publicManagedUser);
}

export async function createManagedUser(input: { username?: unknown; displayName?: unknown; password?: unknown; role?: unknown; allowedSections?: unknown }) {
  const identity = normalizeIdentity(input);
  const role = normalizeRole(input.role);
  const password = validateManagedPassword(input.password);
  const allowedSections = role === "admin" ? [...APPLICATION_SECTIONS] : normalizeApplicationSections(input.allowedSections);
  const user = await prisma.appUser.create({
    data: { ...identity, passwordHash: await bcrypt.hash(password, 12), role, allowedSections, isActive: true },
    select: managedUserSelect()
  });
  return publicManagedUser(user);
}

export async function updateManagedUser(actorId: string, userId: string, input: { displayName?: unknown; role?: unknown; isActive?: unknown; allowedSections?: unknown }) {
  const current = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!current) throw new Error("USER_NOT_FOUND");
  const role = input.role === undefined ? current.role : normalizeRole(input.role);
  const isActive = input.isActive === undefined ? current.isActive : input.isActive === true;
  const displayName = input.displayName === undefined ? current.displayName : String(input.displayName).trim();
  if (displayName.length < 2 || displayName.length > 80) throw new Error("INVALID_DISPLAY_NAME");
  if (actorId === userId && role !== "admin") throw new Error("CANNOT_DEMOTE_SELF");
  if (actorId === userId && !isActive) throw new Error("CANNOT_DEACTIVATE_SELF");
  if (current.role === "admin" && current.isActive && (role !== "admin" || !isActive)) {
    const otherActiveAdmins = await prisma.appUser.count({ where: { id: { not: userId }, role: "admin", isActive: true } });
    if (!otherActiveAdmins) throw new Error("LAST_ACTIVE_ADMIN_REQUIRED");
  }
  const allowedSections = role === "admin"
    ? [...APPLICATION_SECTIONS]
    : input.allowedSections === undefined
      ? normalizeApplicationSections(current.allowedSections)
      : normalizeApplicationSections(input.allowedSections);
  const accessChanged = role !== current.role || isActive !== current.isActive || allowedSections.join("|") !== current.allowedSections.join("|");
  const user = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.appUser.update({ where: { id: userId }, data: { displayName, role, isActive, allowedSections }, select: managedUserSelect() });
    if (accessChanged) await transaction.authSession.deleteMany({ where: { userId } });
    return updated;
  });
  return publicManagedUser(user);
}

export async function resetManagedUserPassword(actorId: string, userId: string, passwordInput: unknown) {
  if (actorId === userId) throw new Error("USE_CHANGE_PASSWORD_FOR_SELF");
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const password = validateManagedPassword(passwordInput);
  await prisma.$transaction([
    prisma.appUser.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    prisma.authSession.deleteMany({ where: { userId } })
  ]);
  return { ok: true, sessionsRevoked: true };
}

export async function deleteManagedUser(actorId: string, userId: string, confirmation: unknown) {
  if (actorId === userId) throw new Error("CANNOT_DELETE_SELF");
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { id: true, username: true, role: true, isActive: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (String(confirmation ?? "").trim().toLowerCase() !== `delete ${user.username}`) throw new Error("USER_DELETE_CONFIRMATION_MISMATCH");
  if (user.role === "admin" && user.isActive) {
    const otherActiveAdmins = await prisma.appUser.count({ where: { id: { not: userId }, role: "admin", isActive: true } });
    if (!otherActiveAdmins) throw new Error("LAST_ACTIVE_ADMIN_REQUIRED");
  }
  await prisma.appUser.delete({ where: { id: userId } });
  return { id: userId, permanentlyDeleted: true, cascadedCompaniesAndAssets: true };
}

export function userAccessCatalog() {
  return {
    sections: [...APPLICATION_SECTIONS],
    roles: (["viewer", "operator", "admin"] as const).map((role) => ({ role, permissions: permissionsForRole(role) }))
  };
}
