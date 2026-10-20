import { prisma } from "../db/prisma.js";
import { matchesDeviceMetricSource } from "./device-metric-source.js";
import { RESOURCE_KEYS, resourceIssues } from "./resource-issues.js";

export async function reconcileResourceIssues(deviceId: string) {
  const device = await prisma.device.findFirst({ where: { id: deviceId, deletedAt: null, company: { deletedAt: null } }, select: { vendor: true } });
  if (!device) return;
  const samples = await prisma.metricSample.findMany({ where: { deviceId, metricKey: { in: RESOURCE_KEYS }, timestamp: { gte: new Date(Date.now() - 300_000) } }, orderBy: { timestamp: "desc" }, take: 2048 });
  for (const issue of resourceIssues(samples.filter(sample => matchesDeviceMetricSource(device.vendor, sample.source)))) {
    const existing = await prisma.finding.findUnique({ where: { deviceId_fingerprint: { deviceId, fingerprint: issue.fingerprint } } });
    if (existing && existing.lastSeen >= issue.observedAt) continue;
    if (existing?.status === "suppressed" || existing?.status === "accepted_risk") continue;
    if (!issue.active) {
      if (existing && ["active", "acknowledged", "investigating"].includes(existing.status)) {
        await prisma.$transaction([
          prisma.finding.update({ where: { id: existing.id }, data: { status: "resolved", lastSeen: issue.observedAt, evidenceJson: issue.evidence } }),
          prisma.auditLog.create({ data: { deviceId, actor: "system", action: "monitoring.resource.resolved", targetType: "finding", targetId: existing.id, dryRun: false, approvalStatus: "not_required", metadata: { metricKey: issue.metricKey, observedAt: issue.observedAt.toISOString(), reason: "two_fresh_measurements_below_recovery_threshold" } } })
        ]);
      }
      continue;
    }
    const data = { title: issue.title, severity: issue.severity, category: "resource_health", status: "active", source: "measured_resource", confidence: 1,
      summary: "مصرف بالا در دو اندازه‌گیری تازه تأیید شد؛ علت را بررسی کنید. اقدام فقط پس از پیش‌نمایش و تأیید شما اجرا می‌شود.", evidenceJson: issue.evidence,
      rawRefsJson: [], lastSeen: issue.observedAt, affectedObject: issue.metricKey,
      recommendedActions: [{ intent: "inspect_resource", label: "بررسی علت مصرف از مسیر فرمان‌های ثبت‌شده" }] };
    await prisma.finding.upsert({ where: { deviceId_fingerprint: { deviceId, fingerprint: issue.fingerprint } },
      create: { ...data, deviceId, vendor: device.vendor, fingerprint: issue.fingerprint, firstSeen: issue.observedAt, count: 1 },
      update: { ...data, count: { increment: 1 } } });
  }
}
