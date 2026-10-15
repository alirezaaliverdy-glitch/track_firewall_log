import { isIP } from "node:net";
import { prisma } from "../db/prisma.js";
import { getFindingEvidence } from "./finding-evidence.service.js";
import { isApplicationOwnedSecurityEvent } from "../security/collector-auth-provenance.js";
import { parseLinuxSecurityLog } from "../security/linux-log-semantics.js";

export const CAMPAIGN_WINDOW_MS = 15 * 60_000;
export function campaignWindow(timestamp: Date) {
  const start = new Date(Math.floor(timestamp.getTime() / CAMPAIGN_WINDOW_MS) * CAMPAIGN_WINDOW_MS);
  return { start, end: new Date(start.getTime() + CAMPAIGN_WINDOW_MS) };
}
export function aggregateCampaignSources(events: Array<{ id: string; timestamp: string | Date; srcIp?: string | null; username?: string | null; action?: string | null; eventType?: string | null; rawMessage?: string | null; tags?: unknown; findingId: string }>) {
  const sources = new Map<string, { ip: string; events: number; accounts: string[]; firstSeen: string; lastSeen: string; findingIds: string[] }>();
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id) || isApplicationOwnedSecurityEvent({ tags: event.tags })) continue;
    seen.add(event.id);
    const meaning = parseLinuxSecurityLog(event.rawMessage ?? "");
    if (meaning.program === "sudo") continue;
    const attack = meaning.kind === "ssh_failure" || /auth_failed|auth_failure|authentication_failure|login_failure|vpn_auth_failed|port_scan|network_scan|threat_detected|firewall_denied|intrusion|ips_/.test(`${event.action ?? ""} ${event.eventType ?? ""}`);
    if (!attack) continue;
    const ip = meaning.sourceIp ?? event.srcIp;
    if (!ip || !isIP(ip)) continue;
    const time = new Date(event.timestamp).toISOString();
    const row = sources.get(ip) ?? { ip, events: 0, accounts: [], firstSeen: time, lastSeen: time, findingIds: [] };
    row.events++;
    row.firstSeen = row.firstSeen < time ? row.firstSeen : time;
    row.lastSeen = row.lastSeen > time ? row.lastSeen : time;
    const actor = meaning.actor ?? event.username;
    if (actor && !row.accounts.includes(actor)) row.accounts.push(actor);
    if (!row.findingIds.includes(event.findingId)) row.findingIds.push(event.findingId);
    sources.set(ip, row);
  }
  return [...sources.values()].sort((a, b) => b.events - a.events || a.ip.localeCompare(b.ip));
}

/** Read model only: preserve individual findings, references and action eligibility.
 * Same target + exact rule/title + bounded UTC window, never cross-workspace. */
export async function getFindingCampaign(id: string, ownerId?: string) {
  const scope = ownerId ? { device: { company: { ownerId, deletedAt: null }, deletedAt: null } } : {};
  const anchor = await prisma.finding.findFirst({ where: { id, ...scope }, include: { device: { select: { id: true, name: true, host: true } } } });
  if (!anchor) return null;
  const { start, end } = campaignWindow(anchor.lastSeen);
  const candidates = await prisma.finding.findMany({
    where: { deviceId: anchor.deviceId, vendor: anchor.vendor, source: anchor.source, title: anchor.title, category: anchor.category, dstPort: anchor.dstPort,
      lastSeen: { gte: start }, firstSeen: { lt: end }, status: { notIn: ["false_positive", "suppressed"] }, ...scope },
    orderBy: { lastSeen: "desc" }, take: 101,
  });
  const findings = candidates.slice(0, 100);
  if (!findings.some(row => row.id === anchor.id)) findings.unshift(anchor);
  const owners = new Map<string, string>();
  for (const finding of findings) {
    if (!Array.isArray(finding.rawRefsJson)) continue;
    for (const ref of finding.rawRefsJson) {
      const refId = typeof ref === "string" ? ref : ref && typeof ref === "object" && "id" in ref ? String(ref.id) : null;
      if (refId && owners.size < 1000 && !owners.has(refId)) owners.set(refId, finding.id);
    }
  }
  const rows = owners.size ? await prisma.securityEvent.findMany({ where: { id: { in: [...owners.keys()] }, deviceId: anchor.deviceId, timestamp: { gte: start, lt: end } },
    select: { id: true, timestamp: true, srcIp: true, username: true, action: true, eventType: true, rawMessage: true, rawSnippet: true, tags: true }, take: 1000 }) : [];
  const evidence = await getFindingEvidence(anchor.id);
  const exact = rows.map(row => ({ ...row, timestamp: row.timestamp ?? start, rawMessage: row.rawMessage ?? row.rawSnippet, findingId: owners.get(row.id)! }));
  const missing = (evidence?.events ?? []).filter(row => !rows.some(found => found.id === row.id) && new Date(row.timestamp) >= start && new Date(row.timestamp) < end);
  const sources = aggregateCampaignSources([...exact, ...missing.map(row => ({ ...row, findingId: anchor.id }))]);
  return {
    findingId: anchor.id, device: anchor.device, windowMinutes: 15, start: start.toISOString(), end: end.toISOString(),
    grouping: "same_target_rule_time_window", coordinatedAttackProven: false,
    sources, sourceCount: sources.length, observedEvents: sources.reduce((sum, row) => sum + row.events, 0),
    findings: findings.map(row => ({ id: row.id, srcIp: row.srcIp, status: row.status, count: row.count })),
    partial: candidates.length > 100 || owners.size >= 1000 || Boolean(evidence?.integrity.unresolvedReferenceCount),
  };
}
