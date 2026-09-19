import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createManagedUser, deleteManagedUser, listManagedUsers, resetManagedUserPassword, updateManagedUser, userAccessCatalog } from "../services/user-management.service.js";

function requireAdmin(request: FastifyRequest) {
  if (request.authUser?.role !== "admin") throw new Error("ADMIN_REQUIRED");
  return request.authUser;
}

function auditUserManagement(request: FastifyRequest, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  void prisma.auditLog.create({
    data: {
      actor: request.authUser?.username,
      action,
      targetType: "user_account",
      targetId,
      dryRun: false,
      approvalStatus: "not_required",
      metadata: metadata as Prisma.InputJsonValue
    }
  }).catch(() => undefined);
}

function responseCode(code: string) {
  if (code === "ADMIN_REQUIRED") return 403;
  if (code === "USER_NOT_FOUND") return 404;
  if (code === "USERNAME_ALREADY_EXISTS") return 409;
  return 400;
}

function managementError(error: unknown) {
  const value = error as { message?: string; code?: string; violations?: string[] };
  const code = value.code === "P2002" ? "USERNAME_ALREADY_EXISTS" : value.message ?? "USER_MANAGEMENT_FAILED";
  return { code, violations: value.violations ?? [] };
}

export async function adminUserRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", async (request, reply) => {
    try {
      requireAdmin(request);
      return { users: await listManagedUsers(), catalog: userAccessCatalog() };
    } catch (error) {
      const result = managementError(error);
      return reply.code(responseCode(result.code)).send({ error: result.code, violations: result.violations });
    }
  });

  app.post<{ Body: { username?: unknown; displayName?: unknown; password?: unknown; role?: unknown; allowedSections?: unknown } }>("/api/admin/users", async (request, reply) => {
    try {
      requireAdmin(request);
      const user = await createManagedUser(request.body ?? {});
      auditUserManagement(request, "admin.user.create", user.id, { role: user.role, allowedSections: user.allowedSections });
      return reply.code(201).send({ user });
    } catch (error) {
      const result = managementError(error);
      return reply.code(responseCode(result.code)).send({ error: result.code, violations: result.violations });
    }
  });

  app.patch<{ Params: { id: string }; Body: { displayName?: unknown; role?: unknown; isActive?: unknown; allowedSections?: unknown } }>("/api/admin/users/:id", async (request, reply) => {
    try {
      const actor = requireAdmin(request);
      const user = await updateManagedUser(actor.id, request.params.id, request.body ?? {});
      auditUserManagement(request, "admin.user.update", user.id, { role: user.role, isActive: user.isActive, allowedSections: user.allowedSections });
      return { user };
    } catch (error) {
      const result = managementError(error);
      return reply.code(responseCode(result.code)).send({ error: result.code, violations: result.violations });
    }
  });

  app.post<{ Params: { id: string }; Body: { password?: unknown } }>("/api/admin/users/:id/reset-password", async (request, reply) => {
    try {
      const actor = requireAdmin(request);
      const result = await resetManagedUserPassword(actor.id, request.params.id, request.body?.password);
      auditUserManagement(request, "admin.user.password_reset", request.params.id, { sessionsRevoked: true });
      return result;
    } catch (error) {
      const result = managementError(error);
      return reply.code(responseCode(result.code)).send({ error: result.code, violations: result.violations });
    }
  });

  app.delete<{ Params: { id: string }; Body: { confirmation?: unknown } }>("/api/admin/users/:id", async (request, reply) => {
    try {
      const actor = requireAdmin(request);
      const result = await deleteManagedUser(actor.id, request.params.id, request.body?.confirmation);
      auditUserManagement(request, "admin.user.permanent_delete", request.params.id, { irreversible: true, cascadedCompaniesAndAssets: true });
      return result;
    } catch (error) {
      const result = managementError(error);
      return reply.code(responseCode(result.code)).send({ error: result.code, violations: result.violations });
    }
  });
}
