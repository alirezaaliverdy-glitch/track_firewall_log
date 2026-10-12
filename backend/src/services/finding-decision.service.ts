import { prisma } from "../db/prisma.js";
import { findingSupportsIpResponse } from "../assets/finding-remediation-policy.js";
import { isApplicationOwnedSecurityEvent } from "../security/collector-auth-provenance.js";
import { getFindingEvidence } from "./finding-evidence.service.js";
import { buildTrustedSourceMatcher } from "./trusted-source-ip.service.js";

export type DecisionEvidence = {
  category: string;
  status: string;
  srcIp: string | null;
  vendor: string;
  confidence: number;
  count: number;
  lastSeen: Date;
  referenceCount: number;
  resolvedReferenceCount: number;
  supportingReferenceCount: number;
  applicationOwnedReferenceCount: number;
  independentDeviceCount: number;
  authSuccessCount: number;
  trustedSource: boolean;
};

export function correlateFindingEvidence(input: DecisionEvidence, now = new Date()) {
  const open = !["resolved", "closed", "false_positive", "accepted_risk", "suppressed"].includes(input.status);
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - input.lastSeen.getTime()) / 60_000));
  const recent = ageMinutes <= 30;
  const coverage = input.referenceCount > 0 ? input.resolvedReferenceCount / input.referenceCount : 0;
  const supportCoverage = input.referenceCount > 0 ? input.supportingReferenceCount / input.referenceCount : 0;
  const isAttackCategory = ["authentication", "authentication_attack", "vpn", "reconnaissance", "network_scan", "threat-prevention", "intrusion-detection"].includes(input.category.toLowerCase());
  const signals = [
    { key: "rule", level: "observed", fa: `${input.count} رویداد مطابق قانون روی همین تجهیز ثبت شده است.`, en: `${input.count} rule-matching events were recorded on this device.` },
    ...(input.referenceCount ? [{ key: "references", level: coverage >= 0.8 ? "observed" : "caution", fa: `${input.resolvedReferenceCount} از ${input.referenceCount} ارجاع لاگ قابل بازیابی است.`, en: `${input.resolvedReferenceCount} of ${input.referenceCount} log references are retrievable.` }] : [{ key: "references", level: "caution", fa: "ارجاع مستقیم به لاگ برای این یافته ثبت نشده است.", en: "This finding has no direct log references." }]),
    ...(input.referenceCount && input.supportingReferenceCount < input.resolvedReferenceCount ? [{ key: "support", level: "caution", fa: "همهٔ لاگ‌های بازیابی‌شده این مبدأ و نوع رخداد را تأیید نمی‌کنند.", en: "Not all retrieved logs support this source and event type." }] : []),
    ...(input.applicationOwnedReferenceCount ? [{ key: "application", level: "caution", fa: "بخشی از رویدادها مربوط به اتصال خود برنامه است و شاهد حمله شمرده نشده است.", en: "Some events belong to the application's own connection and were excluded as attack evidence." }] : []),
    ...(input.independentDeviceCount > 1 ? [{ key: "devices", level: "observed", fa: `همین مبدأ در ${input.independentDeviceCount} تجهیز دیده شده است.`, en: `The same source was seen on ${input.independentDeviceCount} devices.` }] : []),
    ...(input.authSuccessCount ? [{ key: "success", level: "caution", fa: "پس از هشدار، ورود موفقی از همین مبدأ ثبت شده؛ مجاز بودن آن باید بررسی شود.", en: "A successful login from this source followed the alert; verify whether it was authorized." }] : []),
    ...(input.trustedSource ? [{ key: "trusted", level: "caution", fa: "این IP در فهرست مبدأهای مورداعتماد است؛ مسدودسازی پیشنهاد نمی‌شود.", en: "This IP is trusted; blocking is not recommended." }] : []),
    ...(!recent ? [{ key: "stale", level: "caution", fa: "آخرین شاهد بیش از ۳۰ دقیقه پیش ثبت شده؛ وضعیت فعلی را دوباره بررسی کنید.", en: "The latest evidence is over 30 minutes old; check the current state." }] : []),
  ] as Array<{ key: string; level: string; fa: string; en: string }>;
  // This is evidence strength, not a probability of compromise. A rule's
  // static confidence cannot overcome missing or stale source evidence.
  let evidenceScore = Math.round(Math.min(1, Math.max(0, input.confidence)) * 100);
  if (!input.referenceCount) evidenceScore = Math.min(evidenceScore, 55);
  else if (supportCoverage < 0.5) evidenceScore = Math.min(evidenceScore, 60);
  else if (supportCoverage < 0.8) evidenceScore = Math.min(evidenceScore, 72);
  if (input.independentDeviceCount > 1 && supportCoverage >= 0.8) evidenceScore = Math.min(98, evidenceScore + 5);
  if (!recent) evidenceScore = Math.min(evidenceScore, 55);
  if (input.trustedSource) evidenceScore = Math.min(evidenceScore, 50);
  if (input.authSuccessCount) evidenceScore = Math.min(evidenceScore, 65);
  const blockEligible = open && recent && !input.trustedSource && !input.authSuccessCount && evidenceScore >= 75 && input.supportingReferenceCount >= 2 && findingSupportsIpResponse(input);
  const mode = !open ? "closed" : blockEligible ? "review_action" : "investigate";
  return {
    mode,
    evidenceScore,
    evidenceLabelFa: evidenceScore >= 75 ? "شواهد قوی" : evidenceScore >= 55 ? "شواهد محدود" : "شواهد ناکافی",
    evidenceLabelEn: evidenceScore >= 75 ? "Strong evidence" : evidenceScore >= 55 ? "Limited evidence" : "Insufficient evidence",
    signals,
    explanationFa: !open ? "این یافته دیگر باز نیست؛ برای اقدام تازه، شواهد جدید لازم است." : blockEligible ? "شواهد تازه و قابل‌بازیابی از یک مبدأ حمله‌محور پشتیبانی می‌کنند. پیش‌نمایش محدودسازی را بررسی کنید." : input.trustedSource ? "مبدأ مورداعتماد است؛ ابتدا علت فعالیت و مجاز بودن آن را بررسی کنید." : !isAttackCategory ? "نوع این مشکل با مسدودسازی IP رفع نمی‌شود؛ علت و وضعیت فعلی تجهیز را بررسی کنید." : "برای پیشنهاد مسدودسازی، شواهد مستقل یا تازهٔ بیشتری لازم است.",
    explanationEn: !open ? "This finding is closed; new evidence is needed for another action." : blockEligible ? "Recent retrievable evidence supports reviewing a source restriction." : input.trustedSource ? "This source is trusted; first check why it was active and whether it was authorized." : !isAttackCategory ? "Blocking an IP does not address this type of issue; inspect its cause and current device state." : "More independent or recent evidence is needed before suggesting a block.",
    nextStepFa: blockEligible ? "پیش‌نمایش اقدام را ببینید؛ اجرا فقط پس از تأیید شماست." : "لاگ‌های واقعی و وضعیت فعلی تجهیز را بررسی کنید.",
    nextStepEn: blockEligible ? "Review the action preview; execution still needs your confirmation." : "Review raw logs and the device's current state.",
    observedAt: input.lastSeen.toISOString(),
    deviceCount: input.independentDeviceCount,
    authSuccessCount: input.authSuccessCount,
    referenceCount: input.referenceCount,
    resolvedReferenceCount: input.resolvedReferenceCount,
    supportingReferenceCount: input.supportingReferenceCount,
    applicationOwnedReferenceCount: input.applicationOwnedReferenceCount,
  };
}

export async function getFindingDecision(id: string, ownerId?: string) {
  const finding = await prisma.finding.findFirst({ where: { id, ...(ownerId ? { device: { company: { ownerId, deletedAt: null }, deletedAt: null } } : {}) } });
  if (!finding) return null;
  const evidence = await getFindingEvidence(id);
  const referencedSecurityEvents = evidence?.events.length ? await prisma.securityEvent.findMany({
    where: { deviceId: finding.deviceId, id: { in: evidence.events.map((event) => event.id) } },
    select: { id: true, tags: true }
  }) : [];
  const applicationOwnedIds = new Set(referencedSecurityEvents.filter(isApplicationOwnedSecurityEvent).map((event) => event.id));
  const supportingReferenceCount = evidence?.events.filter((event) => {
    if (!finding.srcIp || event.srcIp !== finding.srcIp || applicationOwnedIds.has(event.id)) return false;
    const marker = `${event.action ?? ""} ${event.eventType ?? ""}`.toLowerCase();
    return !/auth_success|accepted|allowed|ordinary_connection/.test(marker);
  }).length ?? 0;
  const [related, loginEvents, trusted] = await Promise.all([
    finding.srcIp ? prisma.finding.findMany({ where: { srcIp: finding.srcIp, lastSeen: { gte: new Date(finding.lastSeen.getTime() - 24 * 60 * 60_000) }, status: { notIn: ["resolved", "closed", "false_positive", "accepted_risk", "suppressed"] }, ...(ownerId ? { device: { company: { ownerId, deletedAt: null }, deletedAt: null } } : {}) }, select: { deviceId: true }, take: 100 }) : Promise.resolve([]),
    finding.srcIp ? prisma.securityEvent.findMany({ where: { deviceId: finding.deviceId, srcIp: finding.srcIp, OR: [{ action: "auth_success" }, { eventType: "auth_success" }], timestamp: { gte: finding.lastSeen, lte: new Date() } }, select: { action: true, tags: true }, take: 100 }) : Promise.resolve([]),
    finding.srcIp ? buildTrustedSourceMatcher([finding.srcIp]) : Promise.resolve(() => false),
  ]);
  return correlateFindingEvidence({
    category: finding.category,
    status: finding.status,
    srcIp: finding.srcIp,
    vendor: finding.vendor,
    confidence: finding.confidence,
    count: finding.count,
    lastSeen: finding.lastSeen,
    referenceCount: evidence?.integrity.referenceCount ?? 0,
    resolvedReferenceCount: evidence?.integrity.resolvedReferenceCount ?? 0,
    supportingReferenceCount,
    applicationOwnedReferenceCount: applicationOwnedIds.size,
    independentDeviceCount: Math.max(1, new Set(related.map((item) => item.deviceId)).size),
    authSuccessCount: loginEvents.filter((event) => !isApplicationOwnedSecurityEvent(event)).length,
    trustedSource: trusted(finding.srcIp, finding.vendor),
  });
}
