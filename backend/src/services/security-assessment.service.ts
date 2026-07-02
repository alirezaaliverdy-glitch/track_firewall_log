import { ActionType, AiRiskLevel, type Prisma } from "@prisma/client";
import { getCommandCatalogEntry, VENDOR_COMMAND_CATALOG } from "../actions/catalog/index.js";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { prisma } from "../db/prisma.js";
import { buildSecurityContext } from "./ai-context.service.js";
import { proposeActionPlan } from "./action-plan.service.js";
import { analyzeVendorDevice, buildCompactVendorAiContext, normalizeAnalysisVendor } from "../assessments/vendor-analysis-profiles.js";

type SecurityContext = Awaited<ReturnType<typeof buildSecurityContext>>;
type AssessmentFinding = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  affectedDevices: string[];
  vendor: string;
  device: string;
  evidence: Record<string, unknown>;
  explanation: string;
  recommendedNextStep: string;
};

type RecommendationDraft = {
  deviceId: string | null;
  vendor: string;
  title: string;
  severity: string;
  category: string;
  reason: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  catalogActionId: string | null;
  actionType: string | null;
  parameters: Record<string, unknown>;
  executable: boolean;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVendor(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("mikrotik") || text.includes("routeros")) return "mikrotik";
  if (text.includes("forti")) return "fortigate";
  if (text.includes("linux") || text.includes("ubuntu") || text.includes("debian")) return "linux";
  if (text.includes("pfsense")) return "pfsense";
  return text || "unknown";
}

function severityCount(context: SecurityContext, severity: string) {
  return context.incidents.countBySeverity.find((row) => row.severity === severity)?.count ?? 0;
}

export function buildAssessmentDraft(context: SecurityContext, snapshotCount = 0, snapshotRecords: Array<{ deviceId: string; snapshotType: string; dataJson: unknown }> = []) {
  const findings: AssessmentFinding[] = [];
  const criticalIncidents = severityCount(context, "critical");
  const highIncidents = severityCount(context, "high");
  const mediumIncidents = severityCount(context, "medium");
  const sensitiveHits = context.events.sensitivePorts.reduce((sum, row) => sum + row.count, 0);
  const unhealthyDevices = context.devices.filter((device) => !["online", "connected"].includes(String(device.status).toLowerCase()));
  const failedActions = context.actionPlans.recent.filter((plan) => plan.status === "failed");

  if (criticalIncidents + highIncidents > 0) {
    findings.push({
      id: "active-high-severity-incidents",
      title: "رخدادهای امنیتی شدید نیازمند رسیدگی فوری هستند",
      severity: criticalIncidents > 0 ? "critical" : "high",
      category: "incident_trend",
      affectedDevices: context.incidents.recent.map((incident) => incident.device?.id).filter((id): id is string => Boolean(id)),
      vendor: "همه", device: "چند دستگاه",
      evidence: { criticalIncidents, highIncidents, recent: context.incidents.recent.slice(0, 5) },
      explanation: "تشخیص‌های اخیر نشان‌دهنده فشار امنیتی فعال یا رخدادهای حل‌نشده است.",
      recommendedNextStep: "شواهد رخدادها بررسی و منبع مخرب تأییدشده فقط با اکشن کنترل‌شده مهار شود."
    });
  }
  if (sensitiveHits > 0) {
    findings.push({
      id: "sensitive-management-port-activity",
      title: "ترافیک به سرویس‌های حساس مشاهده شده است",
      severity: sensitiveHits > 25 ? "high" : "medium",
      category: "exposed_services",
      affectedDevices: context.devices.map((device) => device.id),
      vendor: "همه", device: "دستگاه‌های ثبت‌شده",
      evidence: { sensitivePorts: context.events.sensitivePorts, recentEventCount: context.events.recentCount },
      explanation: "ترافیک پورت‌های مدیریتی و داده، سطح حمله را افزایش می‌دهد و باید به مبدأهای مورد اعتماد محدود شود.",
      recommendedNextStep: "سرویس‌های در حال گوش‌دادن بررسی و دسترسی مدیریتی با اکشن کاتالوگ محدود شود."
    });
  }
  if (unhealthyDevices.length > 0) {
    findings.push({
      id: "device-health-visibility",
      title: "اتصال برخی دستگاه‌های ثبت‌شده تأیید نشده است",
      severity: "medium",
      category: "device_health",
      affectedDevices: unhealthyDevices.map((device) => device.id),
      vendor: "همه", device: unhealthyDevices.map((device) => device.name).join("، "),
      evidence: { devices: unhealthyDevices.map((device) => ({ id: device.id, name: device.name, status: device.status })) },
      explanation: "نبود وضعیت سلامت معتبر، اطمینان به ارزیابی فایروال و پوشش جمع‌آوری داده را کم می‌کند.",
      recommendedNextStep: "وضعیت credential (بدون مشاهده مقدار محرمانه) و دسترسی connector بررسی شود."
    });
  }
  if (failedActions.length > 0) {
    findings.push({
      id: "failed-controlled-actions",
      title: "برخی اکشن‌های کنترل‌شده ناموفق بوده‌اند",
      severity: "medium",
      category: "action_history",
      affectedDevices: failedActions.map((plan) => plan.deviceId).filter((id): id is string => Boolean(id)),
      vendor: "همه", device: "دستگاه‌های مرتبط با اکشن",
      evidence: { failedActions },
      explanation: "اکشن ناموفق می‌تواند ایمن‌سازی برنامه‌ریزی‌شده را ناقص باقی بگذارد.",
      recommendedNextStep: "پیش از تلاش مجدد، خروجی connector و تاریخچه ممیزی بررسی شود."
    });
  }
  if (context.events.recentCount === 0) {
    findings.push({
      id: "no-recent-security-events",
      title: "داده امنیتی تازه در دسترس نیست",
      severity: "medium",
      category: "logging",
      affectedDevices: context.devices.map((device) => device.id),
      vendor: "همه", device: "همه دستگاه‌ها",
      evidence: { recentWindowMinutes: context.recentWindowMinutes, eventCount: 0 },
      explanation: "خالی بودن بازه رویداد می‌تواند ناشی از نبود رخداد یا شکاف در لاگ و collector باشد.",
      recommendedNextStep: "collector، ارسال لاگ، زمان سیستم و نگهداری داده بررسی شود."
    });
  }

  const catalogCoverage = Object.fromEntries(["mikrotik", "fortigate", "linux"].map((vendor) => {
    const entries = VENDOR_COMMAND_CATALOG.filter((entry) => entry.vendor === vendor);
    return [vendor, { total: entries.length, executable: entries.filter((entry) => entry.supportsExecution).length, readOnly: entries.filter((entry) => entry.readOnly).length }];
  }));
  const score = Math.min(100,
    criticalIncidents * 18 + highIncidents * 10 + mediumIncidents * 4 +
    Math.min(20, sensitiveHits) + unhealthyDevices.length * 5 + failedActions.length * 4 +
    (context.events.recentCount === 0 ? 10 : 0)
  );
  const topRisks = [...findings].sort((a, b) => ["low", "medium", "high", "critical"].indexOf(b.severity) - ["low", "medium", "high", "critical"].indexOf(a.severity)).slice(0, 5);
  const affectedDevices = Array.from(new Set(findings.flatMap((finding) => finding.affectedDevices)));
  const summary = score >= 70
    ? "ریسک امنیتی بالا است؛ بررسی فوری و مهار اولویت‌بندی‌شده توصیه می‌شود."
    : score >= 40
      ? "ریسک امنیتی متوسط است؛ چند بهبود مهم در ایمن‌سازی و مشاهده‌پذیری لازم است."
      : "ریسک مشاهده‌شده پایین است؛ ایمن‌سازی دوره‌ای و کنترل پوشش لاگ باید ادامه یابد.";

  const vendorCounts = Object.fromEntries(["mikrotik", "fortigate", "linux", "pfsense", "cisco", "generic"].map((vendor) => [vendor, context.devices.filter((d) => normalizeAnalysisVendor(d.vendor || d.type) === vendor).length]));
  const vendorAnalyses = context.devices.map((device) => analyzeVendorDevice(device, snapshotRecords.filter((snapshot) => snapshot.deviceId === device.id)));
  const connected = context.devices.filter((d) => ["online", "connected"].includes(String(d.status).toLowerCase())).length;
  const noDeviceData = snapshotCount === 0;
  const riskLabel = score >= 70 ? "بحرانی" : score >= 40 ? "بالا" : score >= 20 ? "متوسط" : "پایین";

  return {
    riskScore: score,
    summary,
    findings,
    topRisks,
    affectedDevices,
    evidence: {
      devices: context.devices.length,
      recentEvents: context.events.recentCount,
      recentIncidents: context.incidents.recent.length,
      recentActions: context.actionPlans.recent.length,
      connectorSnapshots: snapshotCount,
      sensitivePorts: context.events.sensitivePorts,
      topSourceIps: context.events.topSourceIps
    },
    language: "fa",
    dataNotice: context.devices.length === 0 && context.events.recentCount === 0 && context.incidents.recent.length === 0
      ? "داده کافی از دستگاه‌ها یا لاگ‌ها موجود نیست؛ تحلیل بر اساس اطلاعات ثبت‌شده فعلی انجام شد."
      : noDeviceData ? "داده خوانده‌شده از دستگاه موجود نیست؛ تحلیل بر اساس داده‌های ثبت‌شده در برنامه انجام شده است." : "تحلیل از داده خواندنی دستگاه و داده‌های ثبت‌شده در برنامه استفاده کرده است.",
    sections: {
      executiveSummary: { title: "خلاصه مدیریتی", securityStatus: summary, overallRisk: riskLabel, mainProblems: topRisks.map((item) => item.title) },
      assetsAndVendors: { title: "دارایی‌ها و Vendorها", mikrotik: vendorCounts.mikrotik, fortigate: vendorCounts.fortigate, linux: vendorCounts.linux, registeredDevices: context.devices.length, connected, readOnlySnapshots: snapshotCount },
      attackSurface: { title: "وضعیت سطح حمله", exposedServices: context.events.sensitivePorts, managementPorts: context.devices.map((d) => ({ device: d.name, port: d.managementPort, protocol: d.protocol })), publicServices: "در داده‌های موجود مشخص نشده است", unnecessaryServices: "نیازمند snapshot خواندنی سرویس‌ها" },
      firewallPolicies: { title: "وضعیت فایروال و Policyها", status: noDeviceData ? "قواعد فایروال، NAT/VIP، نسبت allow/drop، any/any و logging بدون snapshot قابل تأیید نیست." : "اطلاعات خواندنی موجود است؛ یافته‌های مرتبط باید با شواهد snapshot تطبیق داده شوند." },
      managementAccess: { title: "وضعیت دسترسی مدیریتی", paths: context.devices.map((d) => ({ device: d.name, protocol: d.protocol, port: d.managementPort })), trustedSources: "در داده‌های ثبت‌شده مشخص نشده است", adminRisk: "محدودیت مبدأ و سطح دسترسی مدیر باید راستی‌آزمایی شود." },
      loggingMonitoring: { title: "وضعیت لاگ و مانیتورینگ", availableLogs: context.events.recentCount, missingLogs: context.events.recentCount === 0, recentSecurityEvents: context.events.recentCount, incidents: context.incidents.recent.length, detectionCoverage: context.detections.recentRules.length },
      hardeningStatus: { title: "وضعیت Hardening", applied: "از تاریخچه اکشن‌های موفق قابل بررسی است", missing: findings.map((f) => f.title), riskyDefaults: "نیازمند داده خواندنی vendor-specific", backupConfigStatus: "در داده‌های موجود تأیید نشده است" },
      vendorSpecificChecks: {
        title: "کنترل‌های اختصاصی Vendor",
        mikrotik: "SSH/Winbox/API، پورت سرویس‌ها، مبدأ مدیریت، DNS از WAN، input chain، established/related، drop invalid، address-list، NAT و backup/export",
        fortigate: "admin access، local-in policy، لاگ Policy، broad allow، address object، VIP، route، security profile، backup و system logging",
        linux: "SSH root login و port، listening ports، UFW/iptables/nftables، fail2ban، sudo users، auth logs، Docker، Nginx و شاخص به‌روزرسانی",
        result: noDeviceData ? "به دلیل نبود snapshot خواندنی، این کنترل‌ها تأیید نشده‌اند و به بررسی دستی نیاز دارند." : "کنترل‌ها بر اساس snapshot خواندنی و شواهد ثبت‌شده ارزیابی می‌شوند."
      },
      findings: { title: "یافته‌ها", items: findings },
      nextActions: { title: "اقدامات پیشنهادی بعدی", prioritized: findings.map((f) => f.recommendedNextStep), quickWins: ["بررسی پوشش لاگ", "محدودسازی مبدأ دسترسی مدیریتی"], highImpact: ["رسیدگی به رخدادهای شدید", "بازبینی سرویس‌های حساس"] },
      riskScore: { title: "امتیاز ریسک", score, label: riskLabel, explanation: "امتیاز به‌صورت قطعی از شدت رخدادها، ترافیک پورت حساس، سلامت دستگاه، شکست اکشن و پوشش داده محاسبه شده است." }
    },
    explanation: "امتیاز به‌صورت قطعی از شدت رخدادها، ترافیک پورت حساس، سلامت دستگاه، شکست اکشن و پوشش داده محاسبه شده است.",
    recommendedNextSteps: findings.map((finding) => finding.recommendedNextStep),
    catalogCoverage,
    vendorAnalyses,
    aiContext: buildCompactVendorAiContext(vendorAnalyses)
  };
}

async function collectReadOnlySnapshots(scopeId?: string) {
  const devices = await prisma.device.findMany({ where: scopeId ? { id: scopeId } : undefined });
  const snapshots = await Promise.all(devices.map(async (device) => {
    const connector = selectDeviceConnector(device);
    if (!connector || (!device.credentialId && !device.credentialRef)) return null;
    try {
      const data = await connector.collectStatus(device);
      return await prisma.deviceSnapshot.create({
        data: { deviceId: device.id, vendor: normalizeVendor(device.vendor || device.type), snapshotType: "connector_status", dataJson: toJson(data) }
      });
    } catch (error) {
      return await prisma.deviceSnapshot.create({
        data: { deviceId: device.id, vendor: normalizeVendor(device.vendor || device.type), snapshotType: "connector_status_error", dataJson: toJson({ message: error instanceof Error ? error.message : "Status collection failed" }) }
      });
    }
  }));
  return snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
}

export async function runFullAnalysis(input: { scopeType?: string; scopeId?: string; collectConnectorData?: boolean } = {}) {
  const [context, snapshots] = await Promise.all([
    buildSecurityContext({ recentMinutes: 1440 }),
    input.collectConnectorData === false ? Promise.resolve([]) : collectReadOnlySnapshots(input.scopeType === "device" ? input.scopeId : undefined)
  ]);
  const [credentialLinks, capabilityRecords, storedSnapshots, auditLogs, latestSnapshots] = await Promise.all([
    prisma.device.count({ where: { OR: [{ credentialId: { not: null } }, { credentialRef: { not: null } }] } }),
    prisma.deviceCapability.count(),
    prisma.deviceSnapshot.count(),
    prisma.actionAuditLog.count(),
    prisma.deviceSnapshot.findMany({ orderBy: { collectedAt: "desc" }, take: 100, select: { deviceId: true, snapshotType: true, dataJson: true } })
  ]);
  const scopedContext = input.scopeType === "device" && input.scopeId ? { ...context, devices: context.devices.filter((device) => device.id === input.scopeId) } : context;
  const relevantSnapshots = latestSnapshots.filter((snapshot) => scopedContext.devices.some((device) => device.id === snapshot.deviceId));
  const draft = buildAssessmentDraft(scopedContext as SecurityContext, relevantSnapshots.length, relevantSnapshots);
  return prisma.securityAssessment.create({
    data: {
      scopeType: input.scopeType?.trim() || "all",
      scopeId: input.scopeId?.trim() || null,
      status: "completed",
      riskScore: draft.riskScore,
      summary: draft.summary,
      findingsJson: toJson(draft),
      dataSourcesJson: toJson({ device: scopedContext.devices.length, deviceCredentialStatusOnly: credentialLinks, secretValuesRead: false, rawLogsSentToAi: false, compactVendorAiContext: draft.aiContext, deviceCapability: capabilityRecords, deviceSnapshot: storedSnapshots, newlyCollectedSnapshots: snapshots.length, securityEvent: context.events.recentCount, incident: context.incidents.recent.length, actionPlan: context.actionPlans.recent.length, actionAuditLog: auditLogs, securityAssessment: true, hardeningRecommendation: true, vendorCatalogActions: VENDOR_COMMAND_CATALOG.length }),
      language: "fa"
    },
    include: { recommendations: { include: { device: { select: { id: true, name: true, vendor: true, type: true } } } } }
  });
}

function publicFinding(finding: AssessmentFinding) {
  return {
    id: finding.id,
    titleFa: finding.title,
    severity: finding.severity,
    vendor: finding.vendor,
    deviceName: finding.device,
    deviceId: finding.affectedDevices[0] ?? null,
    evidence: finding.evidence,
    whyItMattersFa: finding.explanation,
    recommendationFa: finding.recommendedNextStep,
    executable: false,
    catalogActionId: null
  };
}

function stableAssessment(draft: ReturnType<typeof buildAssessmentDraft>, createdAt = new Date().toISOString(), id: string | null = null) {
  return {
    id,
    riskScore: draft.riskScore,
    summaryFa: draft.summary,
    sections: Object.values(draft.sections),
    findings: draft.findings.map(publicFinding),
    dataSources: Object.entries(draft.evidence).map(([name, value]) => ({ name, available: Array.isArray(value) ? value.length > 0 : Boolean(value), value })),
    dataNoticeFa: draft.dataNotice,
    createdAt,
    // Compatibility fields for existing clients while the public API uses the fields above.
    status: "completed", scopeType: "all", scopeId: null, summary: draft.summary, language: "fa",
    findingsJson: draft, dataSourcesJson: draft.evidence, recommendations: []
  };
}

export async function runStableFullAnalysis(input: { scopeType?: string; scopeId?: string; collectConnectorData?: boolean } = {}) {
  try {
    const stored = await runFullAnalysis(input);
    const draft = object(stored.findingsJson) as ReturnType<typeof buildAssessmentDraft>;
    return { ok: true as const, source: "deterministic" as const, assessment: stableAssessment(draft, stored.createdAt.toISOString(), stored.id), technicalError: null };
  } catch (error) {
    const context = await buildSecurityContext({ recentMinutes: 1440 });
    const draft = buildAssessmentDraft(context, 0);
    return { ok: true as const, source: "deterministic" as const, assessment: stableAssessment(draft), technicalError: error instanceof Error ? error.message : "Unknown assessment error" };
  }
}

export async function generateStandaloneHardeningSuggestions() {
  const context = await buildSecurityContext({ recentMinutes: 1440 });
  const draft = buildAssessmentDraft(context, 0);
  const devices = context.devices.map((device) => ({ id: device.id, name: device.name, vendor: String(device.vendor), type: String(device.type), managementPort: device.managementPort }));
  let persisted: Awaited<ReturnType<typeof getSecurityAssessment>> = null;
  try {
    const assessment = await runFullAnalysis({ collectConnectorData: false });
    persisted = await generateHardeningSuggestions(assessment.id);
  } catch {
    // Missing tables/columns or an unavailable database must not block local analysis.
  }
  const localDrafts = buildHardeningRecommendationDrafts({ findingsJson: draft }, devices);
  const sourceItems = persisted?.recommendations ?? localDrafts;
  const recommendations = sourceItems.map((raw) => {
    const item = "evidenceJson" in raw ? {
      ...raw,
      evidence: object(raw.evidenceJson),
      parameters: object(raw.parametersJson)
    } : raw;
    return ({
    id: "id" in item ? item.id : null,
    titleFa: item.title,
    severity: item.severity,
    vendor: item.vendor,
    deviceId: item.deviceId,
    deviceName: devices.find((device) => device.id === item.deviceId)?.name ?? "همه دستگاه‌ها",
    category: item.category,
    evidence: Object.entries(item.evidence).map(([name, value]) => ({ name, value })),
    recommendationFa: item.recommendation,
    reasonFa: item.reason,
    executable: item.executable && ("id" in item),
    catalogActionId: item.catalogActionId,
    suggestedParameters: item.parameters
  }); });
  return { ok: true as const, source: "deterministic" as const, assessmentId: persisted?.id ?? null, recommendations, dataNoticeFa: draft.dataNotice, createdAt: new Date().toISOString() };
}

export async function getSecurityAssessment(id: string) {
  const assessment = await prisma.securityAssessment.findUnique({
    where: { id },
    include: { recommendations: { orderBy: [{ executable: "desc" }, { createdAt: "asc" }], include: { device: { select: { id: true, name: true, vendor: true, type: true } } } } }
  });
  if (!assessment) return null;
  return { ...assessment, recommendations: assessment.recommendations.map((item) => ({ ...item, createActionSupported: item.executable, actionHint: item.catalogActionId ?? (item.actionType === "custom_vendor_action" ? "generic_security_action" : null), impact: item.reason, recommendedFix: item.recommendation, evidence: item.evidenceJson })) };
}

function catalogRecommendation(input: Omit<RecommendationDraft, "actionType" | "executable">): RecommendationDraft {
  const entry = input.catalogActionId ? getCommandCatalogEntry(input.catalogActionId) : null;
  const hasParams = entry ? entry.requiredParams.every((field) => input.parameters[field] !== undefined && input.parameters[field] !== "") : false;
  const actionType = entry && Object.values(ActionType).includes(entry.actionType as ActionType) ? String(entry.actionType) : null;
  return { ...input, actionType, executable: Boolean(entry?.supportsExecution && actionType && input.deviceId && hasParams) };
}

export function buildHardeningRecommendationDrafts(
  assessment: { findingsJson: unknown },
  devices: Array<{ id: string; name: string; vendor: string; type: string; managementPort: number }>
) {
  const details = object(assessment.findingsJson);
  const evidence = object(details.evidence);
  const topSources = Array.isArray(evidence.topSourceIps) ? evidence.topSourceIps.map(object) : [];
  const leadingSource = typeof topSources[0]?.srcIp === "string" ? topSources[0].srcIp : null;
  const recommendations: RecommendationDraft[] = [];

  for (const device of devices) {
    const vendor = normalizeAnalysisVendor(device.vendor || device.type);
    if (vendor === "mikrotik") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "تهیه خروجی امن و به‌روز از تنظیمات MikroTik", severity: "medium", category: "پشتیبان‌گیری و بازیابی",
        reason: "نسخه به‌روز، بازگشت کنترل‌شده و بازیابی پس از رخداد را قابل اتکاتر می‌کند.", evidence: { device: device.name, status: "وضعیت پشتیبان در داده موجود تأیید نشده است" },
        recommendation: "یک export بدون اطلاعات حساس تهیه و در محل امن نگهداری شود.", catalogActionId: "mikrotik.export_config", parameters: {}
      }));
      recommendations.push({ deviceId: device.id, vendor, title: "بازبینی زنجیره input و سرویس‌های WAN در MikroTik", severity: "high", category: "Vendor Hardening", reason: "نبود drop invalid، established/related یا محدودیت DNS و Winbox/API می‌تواند سطح حمله را افزایش دهد.", evidence: { checks: ["SSH/Winbox/API", "DNS از WAN", "drop invalid", "established/related", "NAT حساس"], status: "نیازمند snapshot خواندنی" }, recommendation: "قواعد input، سرویس‌های مدیریتی، DNS و port-forwardها به‌صورت دستی بازبینی شوند.", catalogActionId: null, actionType: null, parameters: {}, executable: false });
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "محدودسازی دسترسی مدیریتی SSH", severity: "high", category: "دسترسی مدیریتی",
        reason: "سرویس مدیریتی باید فقط از شبکه‌های صریحاً مورد اعتماد در دسترس باشد.", evidence: { managementPort: device.managementPort, trustedSource: "نامشخص" },
        recommendation: "CIDR مدیریتی مجاز تعیین و سپس دسترسی SSH محدود شود.", catalogActionId: "mikrotik.allow_management_source", parameters: { serviceName: "ssh" }
      }));
    } else if (vendor === "fortigate") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "تهیه پشتیبان به‌روز از تنظیمات FortiGate", severity: "medium", category: "پشتیبان‌گیری و بازیابی",
        reason: "پشتیبان به‌روز، بازیابی پیش از تغییر Policy و NAT را ممکن می‌کند.", evidence: { device: device.name, backupStatus: "تأیید نشده" },
        recommendation: "نسخه پشتیبان کنترل‌شده از تنظیمات تهیه شود.", catalogActionId: "fortigate.backup_config", parameters: {}
      }));
      recommendations.push({ deviceId: device.id, vendor, title: "بازبینی Policy، VIP و دسترسی مدیریتی FortiGate", severity: "high", category: "Firewall Policy", reason: "Policy گسترده، VIP در معرض، local-in باز و نبود security profile ریسک نفوذ را بالا می‌برد.", evidence: { checks: ["broad allow", "VIP", "local-in/admin", "policy logging", "security profiles"], status: "نیازمند snapshot خواندنی" }, recommendation: "Policyها، VIPها، local-in و پروفایل‌های امنیتی با اصل حداقل دسترسی بازبینی شوند.", catalogActionId: null, actionType: null, parameters: {}, executable: false });
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "فعال‌سازی لاگ برای Policyهای مهم فایروال", severity: "medium", category: "لاگ و مانیتورینگ",
        reason: "لاگ Policy شواهد رخداد و دید روند ترافیک را بهبود می‌دهد.", evidence: { device: device.name, policyId: "مشخص نشده" },
        recommendation: "Policy مدیریت‌شده انتخاب و ثبت همه ترافیک آن فعال شود.", catalogActionId: "fortigate.enable_policy_logging", parameters: {}
      }));
    } else if (vendor === "linux") {
      recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: "بازبینی پورت‌های در حال گوش‌دادن Linux", severity: "medium", category: "سرویس‌های در معرض",
        reason: "listenerهای غیرمنتظره می‌توانند سرویس مدیریتی یا برنامه را در معرض قرار دهند.", evidence: { device: device.name, listeningPorts: "هنوز خوانده نشده" },
        recommendation: "فهرست پورت‌ها با اکشن خواندنی کنترل‌شده جمع‌آوری و سرویس غیرضروری بسته شود.", catalogActionId: "linux.read_listening_ports", parameters: {}
      }));
      recommendations.push({ deviceId: device.id, vendor, title: "بازبینی SSH، فایروال و سرویس‌های حفاظتی Linux", severity: "high", category: "Authentication", reason: "ورود root، وضعیت نامشخص فایروال/fail2ban، sudo و Docker می‌تواند مسیر دسترسی ناامن ایجاد کند.", evidence: { checks: ["PermitRootLogin", "sudo users", "UFW/iptables/nftables", "fail2ban", "Docker ports", "auth logs"], status: "نیازمند snapshot خواندنی" }, recommendation: "تنظیمات SSH، کاربران sudo، فایروال، fail2ban، پورت‌های Docker و پوشش auth log بررسی شوند.", catalogActionId: null, actionType: null, parameters: {}, executable: false });
      if (leadingSource) recommendations.push(catalogRecommendation({
        deviceId: device.id, vendor, title: `مسدودسازی موقت مبدأ مشکوک ${leadingSource}`, severity: "high", category: "سرویس‌های در معرض",
        reason: "این مبدأ بیشترین حجم رویداد اخیر را ایجاد کرده است.", evidence: { sourceIp: leadingSource, source: topSources[0] },
        recommendation: "پس از تأیید مخرب بودن مبدأ، مسدودسازی مدیریت‌شده و زمان‌دار UFW اعمال شود.", catalogActionId: "linux.temporary_block_ip", parameters: { srcIp: leadingSource, durationMinutes: 30 }
      }));
    } else {
      const templates: Record<string, { title: string; reason: string; fix: string }> = {
        pfsense: { title: "محدودسازی دسترسی مدیریتی pfSense از WAN", reason: "قاعده WAN با دسترسی مدیریتی می‌تواند سطح حمله را افزایش دهد.", fix: "مبدأ دسترسی WAN به شبکه‌های مورد اعتماد محدود شود." },
        cisco: { title: "غیرفعال‌سازی Telnet و استفاده از SSH در Cisco", reason: "Telnet رمزنگاری ندارد و اطلاعات ورود را در معرض قرار می‌دهد.", fix: "Telnet غیرفعال و SSH با AAA و ACL مدیریتی فعال شود." },
        generic: { title: "بازبینی سطح سرویس و تلمتری دستگاه ناشناخته", reason: "Vendor یا قابلیت‌های دستگاه هنوز تأیید نشده است.", fix: "اتصال، سرویس‌های باز، لاگ احراز هویت و قابلیت‌ها جمع‌آوری شوند." }
      };
      const copy = templates[vendor] ?? templates.generic;
      recommendations.push({ deviceId: device.id, vendor, title: copy.title, severity: "high", category: "Vendor Hardening", reason: copy.reason, evidence: { device: device.name, status: "داده کافی جمع‌آوری نشده است" }, recommendation: copy.fix, catalogActionId: null, actionType: "custom_vendor_action", parameters: { vendor, requestedOperation: copy.fix, operationCategory: "hardening", executionSupport: "manual_or_not_implemented", requiresExplicitReview: true }, executable: true });
    }
  }

  const vendorAnalyses = Array.isArray(details.vendorAnalyses) ? details.vendorAnalyses.map(object) : [];
  for (const analysis of vendorAnalyses) {
    const analysisFindings = Array.isArray(analysis.findings) ? analysis.findings.map(object) : [];
    for (const finding of analysisFindings.filter((item) => item.id && item.title)) {
      const deviceId = typeof analysis.deviceId === "string" ? analysis.deviceId : null;
      const vendor = normalizeAnalysisVendor(analysis.vendor);
      const recommendedFix = String(finding.recommendedFix ?? "Review the finding and apply a controlled hardening change.");
      recommendations.push({
        deviceId, vendor, title: `${String(finding.title)} — پیشنهاد ایمن‌سازی`, severity: String(finding.severity ?? "medium"), category: "Vendor Finding", reason: `اثر امنیتی: ${String(finding.impact ?? "نیازمند بررسی")}`,
        evidence: { evidence: finding.evidence ?? "data not collected", findingId: finding.id }, recommendation: `${recommendedFix} (پس از بازبینی)`, catalogActionId: null, actionType: "custom_vendor_action",
        parameters: { vendor, requestedOperation: recommendedFix, operationCategory: "hardening", executionSupport: "manual_or_not_implemented", requiresExplicitReview: true, findingId: finding.id }, executable: Boolean(deviceId)
      });
    }
  }

  recommendations.push({
    deviceId: null, vendor: "همه", title: "راستی‌آزمایی پوشش سراسری لاگ", severity: "medium", category: "لاگ و مانیتورینگ",
    reason: "اعتبار ارزیابی به داده کامل و به‌موقع همه دستگاه‌های مدیریت‌شده وابسته است.", evidence: { recentEvents: evidence.recentEvents ?? 0 },
    recommendation: "دستگاه‌های ثبت‌شده با collectorهای فعال مقایسه و شکاف‌ها رفع شود.", catalogActionId: null, actionType: null, parameters: {}, executable: false
  });
  return recommendations;
}

export async function generateHardeningSuggestions(assessmentId: string) {
  const assessment = await prisma.securityAssessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return null;
  const existing = await prisma.hardeningRecommendation.count({ where: { assessmentId } });
  if (existing > 0) return getSecurityAssessment(assessmentId);
  const devices = await prisma.device.findMany({ select: { id: true, name: true, vendor: true, type: true, managementPort: true } });
  const drafts = buildHardeningRecommendationDrafts(assessment, devices);
  await prisma.hardeningRecommendation.createMany({
    data: drafts.map((draft) => ({
      assessmentId,
      deviceId: draft.deviceId,
      vendor: draft.vendor,
      title: draft.title,
      severity: draft.severity,
      category: draft.category,
      reason: draft.reason,
      evidenceJson: toJson(draft.evidence),
      recommendation: draft.recommendation,
      catalogActionId: draft.catalogActionId,
      actionType: draft.actionType,
      parametersJson: toJson(draft.parameters),
      executable: draft.executable,
      status: draft.executable ? "ready" : "manual"
    }))
  });
  return getSecurityAssessment(assessmentId);
}

export async function createActionPlanFromRecommendation(id: string) {
  const recommendation = await prisma.hardeningRecommendation.findUnique({ where: { id } });
  if (!recommendation) return null;
  if (recommendation.actionPlanId) {
    const existing = await prisma.actionPlan.findUnique({ where: { id: recommendation.actionPlanId }, include: { device: true } });
    if (existing) return { recommendationId: id, actionPlan: existing };
  }
  if (!recommendation.executable || !recommendation.actionType || !recommendation.deviceId) {
    throw new Error("این پیشنهاد دستی است یا هنوز در کاتالوگ کنترل‌شده پشتیبانی نمی‌شود.");
  }
  const entry = recommendation.catalogActionId ? getCommandCatalogEntry(recommendation.catalogActionId) : null;
  const isGenericProposal = !recommendation.catalogActionId && recommendation.actionType === "custom_vendor_action";
  if (!isGenericProposal && (!entry?.supportsExecution || entry.actionType !== recommendation.actionType || !Object.values(ActionType).includes(recommendation.actionType as ActionType))) {
    throw new Error("این پیشنهاد دیگر به اکشن اجرایی کاتالوگ کنترل‌شده نگاشت نمی‌شود.");
  }
  const parameters = object(recommendation.parametersJson);
  const missing = entry?.requiredParams.filter((field) => parameters[field] === undefined || parameters[field] === "") ?? [];
  if (missing.length > 0) throw new Error(`Recommendation requires: ${missing.join(", ")}.`);
  const plan = await proposeActionPlan({
    source: "system",
    requestedBy: `hardening-recommendation:${id}`,
    deviceId: recommendation.deviceId,
    vendor: recommendation.vendor,
    actionType: recommendation.actionType,
    riskLevel: (entry?.risk ?? recommendation.severity) as AiRiskLevel,
    parametersJson: parameters
  });
  await prisma.hardeningRecommendation.update({ where: { id }, data: { status: "action_plan_created", actionPlanId: plan.id } });
  return { recommendationId: id, actionPlan: plan };
}
