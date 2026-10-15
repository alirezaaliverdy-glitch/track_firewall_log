import { prisma } from "../db/prisma.js";
import { linuxEventAction, parseLinuxSecurityLog } from "../security/linux-log-semantics.js";
import { isApplicationOwnedSecurityEvent } from "../security/collector-auth-provenance.js";

type EvidenceRow = { id: string; rawMessage: string; timestamp: string | Date; username?: string | null; action?: string | null; srcIp?: string | null; tags?: unknown };
type FindingInput = { title: string; fingerprint: string; vendor: string; category: string; actor?: string | null; srcIp: string | null };
export function analyzeFindingEvidence(finding: FindingInput, events: EvidenceRow[], coverage: { referenceCount: number; resolvedReferenceCount: number }) {
  const linux = /linux|ubuntu|debian/i.test(finding.vendor);
  const rootClaim = linux && (/linux\.root-remote-login/.test(finding.fingerprint) || /(?:remote root login|root.*login|login.*root|ورود.*root)/i.test(finding.title));
  const interpreted = events.map(event => {
    const meaning = linux ? parseLinuxSecurityLog(event.rawMessage) : null;
    const kind = meaning?.kind !== "other" && meaning ? meaning.kind : event.action ?? "unknown";
    const actor = meaning?.actor ?? event.username ?? null;
    const owned = isApplicationOwnedSecurityEvent({ tags: event.tags });
    const contradicted = rootClaim && meaning && ["sudo_command", "sudo_failure", "session", "ssh_failure"].includes(meaning.kind) || rootClaim && meaning?.kind === "ssh_success" && meaning.actor !== "root";
    const supports = !owned && !contradicted && (rootClaim ? meaning?.kind === "ssh_success" && actor === "root" : /^(?:auth_failed|ssh_failure|sudo_failed|sudo_failure|threat_detected|port_blocked|configuration_change|suspicious_activity|vpn_auth_failed)$/.test(kind));
    const fa = kind === "sudo_command" ? `اجرای دستور توسط ${actor ?? "نامشخص"} با دسترسی ${meaning?.effectiveUser ?? "نامشخص"}؛ این رویداد ورود SSH نیست.`
      : kind === "ssh_success" ? `ورود موفق SSH با حساب ${actor}.`
      : kind === "ssh_failure" ? `تلاش ناموفق SSH برای حساب ${actor ?? "نامشخص"}.`
      : kind === "sudo_failure" ? `درخواست ناموفق دسترسی sudo توسط ${actor ?? "نامشخص"}.`
      : kind === "session" ? "باز یا بسته شدن نشست؛ به‌تنهایی اثبات ورود راه‌دور نیست."
      : "رویداد با فیلدهای ثبت‌شده بررسی شد؛ تفسیر قطعی بیشتر به لاگ ساختاریافته نیاز دارد.";
    const en = kind === "sudo_command" ? `Command by ${actor ?? "unknown"} running as ${meaning?.effectiveUser ?? "unknown"}; this is not an SSH login.` : kind === "ssh_success" ? `Successful SSH login as ${actor}.` : kind === "ssh_failure" ? `Failed SSH login for ${actor ?? "unknown"}.` : kind === "session" ? "Session lifecycle; not proof of a remote login." : "Review the recorded event fields and source.";
    return { id: event.id, timestamp: new Date(event.timestamp).toISOString(), kind, actor, effectiveUser: meaning?.effectiveUser ?? null, hostname: meaning?.hostname ?? null, sourceIp: meaning ? meaning.sourceIp ?? null : event.srcIp ?? null, applicationOwned: owned, supportsFinding: Boolean(supports), contradictsFinding: Boolean(contradicted), explanationFa: fa, explanationEn: en };
  });
  const supportCount = interpreted.filter(row => row.supportsFinding).length;
  const contradictedCount = interpreted.filter(row => row.contradictsFinding).length;
  const complete = coverage.referenceCount > 0 && coverage.resolvedReferenceCount === coverage.referenceCount && events.length >= coverage.referenceCount;
  const contradicted = Boolean(rootClaim && complete && contradictedCount === events.length && !supportCount);
  const verdict = contradicted ? "contradicted" : supportCount ? "supported" : "inconclusive";
  const actors = [...new Set(interpreted.map(row => row.actor).filter((value): value is string => Boolean(value)))];
  return {
    version: "evidence-semantics-v1", verdict, rootClaim, complete, supportCount, contradictedCount, actors,
    titleFa: contradicted ? "شواهد، ورود root را تأیید نمی‌کنند" : supportCount ? "نوع رویداد با شواهد هم‌خوان است" : "برای نتیجهٔ قطعی شواهد کافی نیست",
    titleEn: contradicted ? "The evidence contradicts a root login" : supportCount ? "Event semantics support the finding" : "More evidence is needed",
    summaryFa: contradicted ? `حساب اجراکننده ${actors.join("، ") || "نامشخص"} بوده است. USER=root سطح دسترسی دستور را مشخص می‌کند. عبارت‌های داخل COMMAND، رویداد ورود نیستند.` : "حساب اجراکننده، مبدأ، نوع رویداد و ارجاع‌های همین تجهیز بررسی شده‌اند. مشاهدهٔ رویداد به‌تنهایی مجاز یا مخرب بودن آن را ثابت نمی‌کند.",
    summaryEn: contradicted ? `The invoking account was ${actors.join(", ") || "unknown"}. USER=root describes command privileges. Text inside COMMAND is not a login event.` : "Actor, source, event type and device-specific references were examined. An observed event alone does not prove malicious activity.",
    events: interpreted.slice(0, 20),
    limitationsFa: [ ...(!complete ? ["همهٔ ارجاع‌های اصلی قابل بازیابی نیستند؛ نتیجه قطعی نیست."] : []), "مجاز بودن فعالیت باید با تغییرات و دسترسی‌های تأییدشده مقایسه شود." ],
    limitationsEn: [ ...(!complete ? ["Some original references are unavailable; the conclusion is limited."] : []), "Check authorization against approved access and changes." ],
  };
}

/** Reclassify only findings whose complete retained references contradict a
 * remote root login. Keep original evidence and audit the correction. */
export async function repairMisclassifiedRootFindings(deviceId?: string) {
  const findings = await prisma.finding.findMany({ where: { ...(deviceId ? { deviceId } : {}), vendor: "linux", fingerprint: { contains: "linux.root-remote-login" }, status: { in: ["active", "acknowledged", "investigating"] } }, take: 100 });
  let corrected = 0;
  for (const finding of findings) {
    const refs = Array.isArray(finding.rawRefsJson) ? [...new Set(finding.rawRefsJson.filter((id): id is string => typeof id === "string"))] : [];
    if (!refs.length || refs.length > 100) continue;
    const events = await prisma.securityEvent.findMany({ where: { id: { in: refs }, deviceId: finding.deviceId }, select: { id: true, rawMessage: true, rawSnippet: true, timestamp: true, receivedAt: true, username: true, action: true, tags: true } });
    const analysis = analyzeFindingEvidence(finding, events.map(row => ({ ...row, rawMessage: row.rawMessage ?? row.rawSnippet ?? "", timestamp: row.timestamp ?? row.receivedAt })), { referenceCount: refs.length, resolvedReferenceCount: events.length });
    if (analysis.verdict !== "contradicted") continue;
    await prisma.$transaction(async tx => {
      const updated = await tx.finding.updateMany({ where: { id: finding.id, status: { in: ["active", "acknowledged", "investigating"] }, lastSeen: finding.lastSeen }, data: { status: "false_positive", actor: analysis.actors.length === 1 ? analysis.actors[0] : null } });
      if (!updated.count) return;
      for (const event of events) {
        const meaning = parseLinuxSecurityLog(event.rawMessage ?? event.rawSnippet ?? "");
        if (meaning.kind === "sudo_command" || meaning.kind === "sudo_failure") await tx.securityEvent.update({ where: { id: event.id }, data: { action: linuxEventAction(meaning), username: meaning.actor ?? null, srcIp: null, srcPort: null } });
      }
      await tx.auditLog.create({ data: { deviceId: finding.deviceId, actor: "system:log-semantics", action: "security.finding.classification_corrected", targetType: "finding", targetId: finding.id, dryRun: false, approvalStatus: "not_required", metadata: { reason: "all_references_contradict_remote_root_login", parser: analysis.version, evidenceCount: events.length } } });
      corrected++;
    });
  }
  return corrected;
}
