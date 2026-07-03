import crypto from "node:crypto";
import { Prisma, type Device } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getVendorTelemetryProfile, type FindingCategory, type TelemetryVendor, type VendorFindingRule } from "./vendor-telemetry-profiles.js";

export type NormalizedFinding = { id: string; deviceId: string; vendor: TelemetryVendor; title: string; severity: "low" | "medium" | "high" | "critical"; category: FindingCategory; status: "active" | "acknowledged" | "resolved" | "suppressed"; confidence: number; summary: string; evidence: string[]; source: string; rawRefs: string[]; firstSeen: string; lastSeen: string; count: number; mitreTags: string[]; affectedObject?: string; actor?: string; srcIp?: string; dstIp?: string; dstPort?: number; recommendedActions: Array<{ intent: string; label: string }>; suppressionReason?: string; fingerprint: string };
export type RawTelemetryEvent = { id?: string; timestamp?: string | Date; source?: string; raw?: string; message?: string; summary?: string; eventType?: string; action?: string; severity?: string; srcIp?: string; dstIp?: string; dstPort?: number; actor?: string; username?: string; affectedObject?: string; [key: string]: unknown };

const windows = new Map<string, number[]>();
function text(event: RawTelemetryEvent) { return [event.raw, event.message, event.summary, event.eventType, event.action, event.severity].filter(Boolean).join(" "); }
function valueAt(input: unknown, path: string) { return path.split(".").reduce<unknown>((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, input); }
function snapshotMatches(rule: VendorFindingRule, snapshot: unknown) { const value = valueAt(snapshot, rule.snapshotPath ?? ""); const s = String(value ?? "").toLowerCase(); switch (rule.snapshotTest) { case "truthy": return Boolean(value); case "enabled": return ["yes", "true", "enabled", "without-password", "prohibit-password"].includes(s); case "inactive": return !s || /inactive|unknown|unavailable|not.?detected|disabled|failed/.test(s); case "public": return /wildcard|public|0\.0\.0\.0|\[::\]/.test(s); default: return false; } }
function stableFingerprint(deviceId: string, vendor: string, ruleId: string, event?: RawTelemetryEvent) { const subject = event?.srcIp ?? event?.affectedObject ?? "device"; return crypto.createHash("sha256").update(`${deviceId}|${vendor}|${ruleId}|${subject}`).digest("hex"); }
function evidenceFor(event?: RawTelemetryEvent, snapshotValue?: unknown) { const line = event ? text(event) : String(snapshotValue ?? "Snapshot condition matched"); return [line.replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]").slice(0, 500)]; }

export function evaluateVendorTelemetry(input: { device: Pick<Device, "id" | "vendor" | "type"> | { id: string; vendor: string; type?: unknown }; events?: RawTelemetryEvent[]; snapshot?: unknown; now?: Date }) {
  const profile = getVendorTelemetryProfile(input.device.vendor, input.device.type); if (!profile) return { vendor: null, findings: [] as NormalizedFinding[], suppressed: [] as Array<{ reason: string; event: RawTelemetryEvent }> };
  const now = input.now ?? new Date(); const findings: NormalizedFinding[] = []; const suppressed: Array<{ reason: string; event: RawTelemetryEvent }> = [];
  for (const event of input.events ?? []) {
    const raw = text(event); const suppression = profile.suppressionRules.find(x => x.pattern.test(raw)); if (suppression) { suppressed.push({ reason: suppression.reason, event }); continue; }
    for (const rule of profile.findingRules.filter(x => x.eventPattern?.test(raw))) {
      const key = stableFingerprint(input.device.id, profile.vendorId, rule.id, event); const cutoff = now.getTime() - (rule.windowMinutes ?? 5) * 60_000; const timestamps = (windows.get(key) ?? []).filter(x => x >= cutoff); timestamps.push(now.getTime()); windows.set(key, timestamps); if (timestamps.length < (rule.threshold ?? 1)) continue;
      findings.push(buildFinding(input.device.id, profile.vendorId, rule, key, event, undefined, timestamps.length, now));
    }
  }
  if (input.snapshot !== undefined && input.snapshot !== null) for (const rule of profile.findingRules.filter(x => x.snapshotPath && snapshotMatches(x, input.snapshot))) { const key = stableFingerprint(input.device.id, profile.vendorId, rule.id); findings.push(buildFinding(input.device.id, profile.vendorId, rule, key, undefined, valueAt(input.snapshot, rule.snapshotPath!), 1, now)); }
  return { vendor: profile.vendorId, findings, suppressed };
}

function buildFinding(deviceId: string, vendor: TelemetryVendor, rule: VendorFindingRule, fingerprint: string, event: RawTelemetryEvent | undefined, snapshotValue: unknown, count: number, now: Date): NormalizedFinding { return { id: fingerprint.slice(0, 24), deviceId, vendor, title: rule.title, severity: rule.severity, category: rule.category, status: "active", confidence: rule.confidence, summary: `${rule.title}. ${rule.whyItMatters}`, evidence: evidenceFor(event, snapshotValue), source: event?.source ?? (rule.snapshotPath ? "snapshot" : "live"), rawRefs: event?.id ? [event.id] : [], firstSeen: now.toISOString(), lastSeen: now.toISOString(), count, mitreTags: rule.mitreTags ?? [], ...(event?.affectedObject ? { affectedObject: event.affectedObject } : {}), ...(event?.actor || event?.username ? { actor: String(event.actor ?? event.username) } : {}), ...(event?.srcIp ? { srcIp: event.srcIp } : {}), ...(event?.dstIp ? { dstIp: event.dstIp } : {}), ...(event?.dstPort ? { dstPort: event.dstPort } : {}), recommendedActions: [{ intent: rule.recommendedIntent, label: `Create ActionPlan: ${rule.recommendedIntent}` }], fingerprint }; }

export async function processVendorTelemetry(input: Parameters<typeof evaluateVendorTelemetry>[0]) {
  const result = evaluateVendorTelemetry(input);
  const persisted: NormalizedFinding[] = [];
  for (const finding of result.findings) {
    const existing = await prisma.finding.findUnique({ where: { deviceId_fingerprint: { deviceId: finding.deviceId, fingerprint: finding.fingerprint } } });
    const evidence = Array.from(new Set([...(Array.isArray(existing?.evidenceJson) ? existing.evidenceJson.map(String) : []), ...finding.evidence])).slice(-20);
    const refs = Array.from(new Set([...(Array.isArray(existing?.rawRefsJson) ? existing.rawRefsJson.map(String) : []), ...finding.rawRefs])).slice(-50);
    const saved = await prisma.finding.upsert({ where: { deviceId_fingerprint: { deviceId: finding.deviceId, fingerprint: finding.fingerprint } }, create: { deviceId: finding.deviceId, vendor: finding.vendor, title: finding.title, severity: finding.severity, category: finding.category, status: finding.status, confidence: finding.confidence, summary: finding.summary, evidenceJson: finding.evidence as Prisma.InputJsonValue, source: finding.source, rawRefsJson: finding.rawRefs as Prisma.InputJsonValue, firstSeen: new Date(finding.firstSeen), lastSeen: new Date(finding.lastSeen), count: finding.count, mitreTags: finding.mitreTags, affectedObject: finding.affectedObject, actor: finding.actor, srcIp: finding.srcIp, dstIp: finding.dstIp, dstPort: finding.dstPort, recommendedActions: finding.recommendedActions as Prisma.InputJsonValue, fingerprint: finding.fingerprint }, update: { lastSeen: new Date(finding.lastSeen), count: { increment: finding.count }, evidenceJson: evidence as Prisma.InputJsonValue, rawRefsJson: refs as Prisma.InputJsonValue, confidence: finding.confidence, severity: finding.severity, status: "active" } });
    persisted.push(serializeFinding(saved as unknown as Record<string, unknown>) as unknown as NormalizedFinding);
  }
  return { ...result, findings: persisted };
}

export function serializeFinding(record: Record<string, unknown>) { return { ...record, evidence: record.evidenceJson ?? [], rawRefs: record.rawRefsJson ?? [], recommendedActions: record.recommendedActions ?? [], evidenceJson: undefined, rawRefsJson: undefined }; }
export function resetFindingEngineWindows() { windows.clear(); }
