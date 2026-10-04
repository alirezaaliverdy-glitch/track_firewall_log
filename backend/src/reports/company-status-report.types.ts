export type ReportEquipmentCategory = "server" | "firewall" | "switch" | "router" | "other";
export type ReportEquipmentState = "active" | "limited" | "inactive";

export type CompanyStatusEquipment = {
  id: string; name: string; host: string; vendor: string; model: string;
  category: ReportEquipmentCategory; status: ReportEquipmentState;
  description: string; physicalLocation: string;
  vendorFields: Array<{ label: string; value: string }>;
  cpuPercent: number | null; diskPercent: number | null;
  collectedAt: string | null; source: "live" | "snapshot" | "inventory";
  statusReason?: string; recommendation?: string; technicalDetails?: string;
  connectionState?: "online" | "offline" | "unknown" | "auth_failed";
};

export type CompanyStatusReport = {
  schemaVersion: 1; generatedAt: string; reportDateFa: string; reportDateGregorian: string; reportTime: string; timezone: "Asia/Tehran"; reportNumber: string; preparedBy: string;
  company: { id: string; name: string; code: string };
  summary: { total: number; active: number; limited: number; inactive: number; healthScore: number };
  equipment: CompanyStatusEquipment[];
  completedActions: string[]; futureActions: string[]; additionalNotes: string; responsibleName: string;
};
