import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { buildCompanyStatusReport, CompanyReportError, renderCompanyReportHtml, renderCompanyReportPdf, renderCompanyReportXlsx, sanitizeCompanyStatusReport } from "../reports/company-status-report.service.js";
import type { CompanyStatusReport } from "../reports/company-status-report.types.js";

function failure(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  const known = error instanceof CompanyReportError ? error : new CompanyReportError(error instanceof Error ? error.message : "REPORT_FAILED", 500);
  return reply.code(known.statusCode).send({ error: known.code });
}

export async function reportRoutes(app: FastifyInstance) {
  app.post<{ Body: { companyId?: string; refresh?: boolean } }>("/api/reports/company-status", async (request, reply) => {
    try {
      if (!request.authUser) throw new CompanyReportError("AUTH_REQUIRED", 401);
      const report = await buildCompanyStatusReport(String(request.body?.companyId ?? ""), request.authUser, request.body?.refresh !== false);
      void prisma.auditLog.create({ data: { actor: request.authUser.username, action: "report.company_status.generate", targetType: "company", targetId: report.company.id, dryRun: false, approvalStatus: "not_required", metadata: { equipment: report.summary.total, generatedAt: report.generatedAt } } }).catch(() => undefined);
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
