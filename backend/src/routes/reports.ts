import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { buildCompanyStatusReport, CompanyReportError, renderCompanyReportHtml, renderCompanyReportPdf, renderCompanyReportXlsx, sanitizeCompanyStatusReport } from "../reports/company-status-report.service.js";
import type { CompanyStatusReport } from "../reports/company-status-report.types.js";

function failure(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  const known = error instanceof CompanyReportError ? error : new CompanyReportError(error instanceof Error ? error.message : "REPORT_FAILED", 500);
  return reply.code(known.statusCode).send({ error: known.code });
}

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { companyId?: string; limit?: string } }>("/api/reports/company-status/history", async (request, reply) => {
    try {
      if (!request.authUser) throw new CompanyReportError("AUTH_REQUIRED", 401);
      const companyId = String(request.query.companyId ?? "").trim();
      if (!companyId) throw new CompanyReportError("COMPANY_ID_REQUIRED", 400);
      const company = await prisma.company.findFirst({
        where: { id: companyId, ownerId: request.authUser.id, deletedAt: null },
        select: { id: true, name: true, code: true }
      });
      if (!company) throw new CompanyReportError("COMPANY_NOT_FOUND", 404);

      const requestedLimit = Number.parseInt(String(request.query.limit ?? "30"), 10);
      const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 100);
      const records = await prisma.auditLog.findMany({
        where: { action: "report.company_status.generate", targetType: "company", targetId: companyId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, actor: true, metadata: true, createdAt: true }
      });
      const actors = [...new Set(records.map((item) => item.actor).filter((actor): actor is string => Boolean(actor)))];
      const users = actors.length ? await prisma.appUser.findMany({
        where: { username: { in: actors } },
        select: { username: true, displayName: true }
      }) : [];
      const displayNames = new Map(users.map((user) => [user.username, user.displayName]));
      const history = records.map((item) => {
        const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : {};
        const actorUsername = item.actor ?? "system";
        return {
          id: item.id,
          actorUsername,
          actorDisplayName: displayNames.get(actorUsername) ?? String(metadata.preparedBy ?? actorUsername),
          createdAt: item.createdAt.toISOString(),
          company,
          reportNumber: String(metadata.reportNumber ?? "—"),
          equipmentCount: Number(metadata.equipment ?? 0),
          healthScore: Number(metadata.healthScore ?? 0)
        };
      });
      return { history };
    } catch (error) { return failure(reply, error); }
  });

  app.post<{ Body: { companyId?: string; refresh?: boolean } }>("/api/reports/company-status", async (request, reply) => {
    try {
      if (!request.authUser) throw new CompanyReportError("AUTH_REQUIRED", 401);
      const report = await buildCompanyStatusReport(String(request.body?.companyId ?? ""), request.authUser, request.body?.refresh !== false);
      await prisma.auditLog.create({ data: { actor: request.authUser.username, action: "report.company_status.generate", targetType: "company", targetId: report.company.id, dryRun: false, approvalStatus: "not_required", metadata: { equipment: report.summary.total, healthScore: report.summary.healthScore, generatedAt: report.generatedAt, reportNumber: report.reportNumber, preparedBy: report.preparedBy } } });
      return { report };
    } catch (error) { return failure(reply, error); }
  });

  app.post<{ Body: { companyId?: string; format?: "html" | "pdf" | "xlsx"; report?: CompanyStatusReport } }>("/api/reports/company-status/export", async (request, reply) => {
    try {
      if (!request.authUser) throw new CompanyReportError("AUTH_REQUIRED", 401);
      const companyId = String(request.body?.companyId ?? "");
      const owned = await prisma.company.findFirst({ where: { id: companyId, ownerId: request.authUser.id, deletedAt: null }, select: { id: true } });
      if (!owned) throw new CompanyReportError("COMPANY_NOT_FOUND", 404);
      const report = sanitizeCompanyStatusReport(request.body?.report as CompanyStatusReport, companyId);
      const format = request.body?.format ?? "pdf", filename = `company-status-${report.company.code}-${new Date().toISOString().slice(0, 10)}`;
      if (format === "html") return reply.header("Content-Type", "text/html; charset=utf-8").header("Content-Disposition", `attachment; filename="${filename}.html"`).send(await renderCompanyReportHtml(report));
      if (format === "xlsx") return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${filename}.xlsx"`).send(await renderCompanyReportXlsx(report));
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${filename}.pdf"`).send(await renderCompanyReportPdf(report));
    } catch (error) { return failure(reply, error); }
  });
}
