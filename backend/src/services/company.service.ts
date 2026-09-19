import type { AppUserRole, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export class CompanyServiceError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number) {
    super(code);
  }
}

type Actor = { id: string; role: AppUserRole; username?: string };

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeCode(value: unknown) {
  return text(value, 32).toUpperCase().replace(/\s+/g, "-");
}

function assertCompanyInput(input: { name?: unknown; code?: unknown }) {
  const name = text(input.name);
  const code = normalizeCode(input.code);
  if (name.length < 2) throw new CompanyServiceError("COMPANY_NAME_REQUIRED", 400);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new CompanyServiceError("COMPANY_CODE_INVALID", 400);
  }
  return { name, code };
}

const companyInclude = {
  _count: {
    select: {
      devices: { where: { deletedAt: null } },
      assets: { where: { deletedAt: null } }
    }
  }
} satisfies Prisma.CompanyInclude;

export async function listCompanies(actor: Actor, view: "active" | "deleted" | "all" = "active", support = false) {
  if (support && actor.role !== "admin") throw new CompanyServiceError("ADMIN_REQUIRED", 403);
  const deletedAt = view === "active" ? null : view === "deleted" ? { not: null } : undefined;
  return prisma.company.findMany({
    where: {
      ...(support ? {} : { ownerId: actor.id }),
      ...(deletedAt === undefined ? {} : { deletedAt })
    },
    include: {
      ...companyInclude,
      ...(support ? { owner: { select: { id: true, username: true, displayName: true } } } : {})
    },
    orderBy: [{ deletedAt: "asc" }, { name: "asc" }]
  });
}

export async function getCompanyForActor(companyId: string, actorId: string, includeDeleted = false) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, ownerId: actorId, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: companyInclude
  });
  if (!company) throw new CompanyServiceError("COMPANY_NOT_FOUND", 404);
  return company;
}

export async function createCompany(actor: Actor, input: { name?: unknown; code?: unknown; description?: unknown }) {
  const { name, code } = assertCompanyInput(input);
  try {
    return await prisma.company.create({
      data: { ownerId: actor.id, name, code, description: text(input.description, 500) || null },
      include: companyInclude
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new CompanyServiceError("COMPANY_CODE_EXISTS", 409);
    throw error;
  }
}

export async function updateCompany(actor: Actor, companyId: string, input: { name?: unknown; code?: unknown; description?: unknown }) {
  const current = await getCompanyForActor(companyId, actor.id);
  const { name, code } = assertCompanyInput({
    name: input.name === undefined ? current.name : input.name,
    code: input.code === undefined ? current.code : input.code
  });
  try {
    return await prisma.company.update({
      where: { id: current.id },
      data: {
        name,
        code,
        ...(input.description === undefined ? {} : { description: text(input.description, 500) || null })
      },
      include: companyInclude
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new CompanyServiceError("COMPANY_CODE_EXISTS", 409);
    throw error;
  }
}

export async function softDeleteCompany(actor: Actor, companyId: string, confirmation: unknown) {
  const company = await getCompanyForActor(companyId, actor.id);
  if (text(confirmation) !== company.name) throw new CompanyServiceError("COMPANY_CONFIRMATION_MISMATCH", 400);
  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.asset.updateMany({ where: { companyId, deletedAt: null }, data: { deletedAt } }),
    prisma.device.updateMany({ where: { companyId, deletedAt: null }, data: { deletedAt } }),
    prisma.company.update({ where: { id: companyId }, data: { deletedAt, deletedById: actor.id } })
  ]);
  return { id: companyId, deletedAt };
}

export async function restoreCompany(actor: Actor, companyId: string) {
  const company = await getCompanyForActor(companyId, actor.id, true);
  if (!company.deletedAt) return company;
  const archivedWithCompany = company.deletedAt;
  await prisma.$transaction([
    prisma.asset.updateMany({ where: { companyId, deletedAt: archivedWithCompany }, data: { deletedAt: null } }),
    prisma.device.updateMany({ where: { companyId, deletedAt: archivedWithCompany }, data: { deletedAt: null } }),
    prisma.company.update({ where: { id: companyId }, data: { deletedAt: null, deletedById: null } })
  ]);
  return getCompanyForActor(companyId, actor.id);
}

export async function permanentlyDeleteCompany(actor: Actor, companyId: string, confirmation: unknown) {
  if (actor.role !== "admin") throw new CompanyServiceError("ADMIN_REQUIRED", 403);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new CompanyServiceError("COMPANY_NOT_FOUND", 404);
  if (!company.deletedAt) throw new CompanyServiceError("COMPANY_MUST_BE_SOFT_DELETED_FIRST", 409);
  if (text(confirmation) !== `DELETE ${company.code}`) {
    throw new CompanyServiceError("PERMANENT_CONFIRMATION_MISMATCH", 400);
  }
  await prisma.company.delete({ where: { id: companyId } });
  return { id: companyId, permanentlyDeleted: true };
}
