import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  CompanyServiceError,
  createCompany,
  listCompanies,
  permanentlyDeleteCompany,
  restoreCompany,
  softDeleteCompany,
  updateCompany
} from "../services/company.service.js";

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new CompanyServiceError("AUTH_REQUIRED", 401);
  return request.authUser;
}

function audit(request: FastifyRequest, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  void prisma.auditLog.create({
    data: {
      actor: request.authUser?.username,
      action,
      targetType: "company",
      targetId,
      dryRun: false,
      approvalStatus: "confirmed",
      metadata: metadata as Prisma.InputJsonValue
    }
  }).catch(() => undefined);
}

function failure(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  const serviceError = error instanceof CompanyServiceError ? error : new CompanyServiceError("COMPANY_OPERATION_FAILED", 500);
  return reply.code(serviceError.statusCode).send({ error: serviceError.code });
}

export async function companyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { view?: "active" | "deleted" | "all" } }>("/api/companies", async (request, reply) => {
    try {
      return { companies: await listCompanies(actor(request), request.query.view ?? "active") };
    } catch (error) { return failure(reply, error); }
  });

  app.get<{ Querystring: { view?: "active" | "deleted" | "all" } }>("/api/admin/companies", async (request, reply) => {
    try {
      return { companies: await listCompanies(actor(request), request.query.view ?? "deleted", true) };
    } catch (error) { return failure(reply, error); }
  });

  app.post<{ Body: { name?: unknown; code?: unknown; description?: unknown } }>("/api/companies", async (request, reply) => {
    try {
      const company = await createCompany(actor(request), request.body ?? {});
      audit(request, "company.create", company.id, { code: company.code });
      return reply.code(201).send({ company });
    } catch (error) { return failure(reply, error); }
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown; code?: unknown; description?: unknown } }>("/api/companies/:id", async (request, reply) => {
    try {
      const company = await updateCompany(actor(request), request.params.id, request.body ?? {});
      audit(request, "company.update", company.id, { code: company.code });
      return { company };
    } catch (error) { return failure(reply, error); }
  });

  app.delete<{ Params: { id: string }; Body: { confirmation?: unknown } }>("/api/companies/:id", async (request, reply) => {
    try {
      const result = await softDeleteCompany(actor(request), request.params.id, request.body?.confirmation);
      audit(request, "company.soft_delete", result.id, { recoverable: true });
      return result;
    } catch (error) { return failure(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/api/companies/:id/restore", async (request, reply) => {
    try {
      const company = await restoreCompany(actor(request), request.params.id);
      audit(request, "company.restore", company.id);
      return { company };
    } catch (error) { return failure(reply, error); }
  });

  app.delete<{ Params: { id: string }; Body: { confirmation?: unknown } }>("/api/admin/companies/:id/permanent", async (request, reply) => {
    try {
      const result = await permanentlyDeleteCompany(actor(request), request.params.id, request.body?.confirmation);
      audit(request, "company.permanent_delete", result.id, { irreversible: true });
      return result;
    } catch (error) { return failure(reply, error); }
  });
}
