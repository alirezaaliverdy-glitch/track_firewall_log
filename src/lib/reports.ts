import { API_BASE_URL } from "@/config/frontendEnv";

export type ReportCategory = "server" | "firewall" | "switch" | "router" | "other";
export type ReportState = "active" | "limited" | "inactive";
export type ReportAssessment = { statusReason?: string; recommendation?: string; technicalDetails?: string; connectionState?: "online" | "offline" | "unknown" | "auth_failed" };
export type CompanyStatusEquipment = ReportAssessment & { id: string; name: string; host: string; vendor: string; model: string; category: ReportCategory; status: ReportState; description: string; physicalLocation: string; vendorFields: Array<{ label: string; value: string }>; cpuPercent: number | null; diskPercent: number | null; collectedAt: string | null; source: "live" | "snapshot" | "inventory" };
export type CompanyStatusReport = { schemaVersion: 1; generatedAt: string; reportDateFa: string; reportDateGregorian: string; reportTime: string; timezone: "Asia/Tehran"; reportNumber: string; preparedBy: string; company: { id: string; name: string; code: string }; summary: { total: number; active: number; limited: number; inactive: number; healthScore: number }; equipment: CompanyStatusEquipment[]; completedActions: string[]; futureActions: string[]; additionalNotes: string; responsibleName: string };
export type ReportFormat = "html" | "pdf" | "xlsx";
export type ReportHistoryEntry = { id: string; actorUsername: string; actorDisplayName: string; createdAt: string; company: { id: string; name: string; code: string }; reportNumber: string; equipmentCount: number; healthScore: number };

async function errorOf(response: Response) { const text = await response.text(); try { const body = JSON.parse(text) as Record<string, unknown>; return String(body.messageFa ?? body.error ?? "REPORT_FAILED"); } catch { return text || "REPORT_FAILED"; } }

export async function createCompanyStatusReport(companyId: string) {
  const response = await fetch(`${API_BASE_URL}/reports/company-status`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, refresh: true }) });
  if (!response.ok) throw new Error(await errorOf(response));
  return ((await response.json()) as { report: CompanyStatusReport }).report;
}

export async function listCompanyStatusReportHistory(companyId: string, limit = 30) {
  const query = new URLSearchParams({ companyId, limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/reports/company-status/history?${query.toString()}`, { credentials: "include" });
  if (!response.ok) throw new Error(await errorOf(response));
  return ((await response.json()) as { history: ReportHistoryEntry[] }).history;
}

export async function clearCompanyStatusReportHistory(companyId: string) {
  const response = await fetch(`${API_BASE_URL}/reports/company-status/history`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, confirmation: "DELETE REPORT HISTORY" })
  });
  if (!response.ok) throw new Error(await errorOf(response));
  return (await response.json()) as { ok: true; deletedCount: number };
}

export async function downloadCompanyStatusReport(report: CompanyStatusReport, format: ReportFormat) {
  const response = await fetch(`${API_BASE_URL}/reports/company-status/export`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: report.company.id, report, format }) });
  if (!response.ok) throw new Error(await errorOf(response));
  const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = `company-status-${report.company.code}.${format}`; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
