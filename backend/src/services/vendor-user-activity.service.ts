import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { redactText } from "../security/redaction.js";

type AccountEvent = {
  id: string;
  deviceId: string | null;
  vendor: string | null;
  username: string | null;
  action: string | null;
  eventType: string;
  severity: string | null;
  timestamp: Date | null;
  receivedAt: Date;
  srcIp: string | null;
  sourceType: string | null;
  rawSnippet: string | null;
  rawMessage: string | null;
  tags: unknown;
};

const EVENT_SAMPLE_LIMIT = 10_000;
const FINDING_SAMPLE_LIMIT = 500;
const SUPPORTED_COLLECTORS = new Set(["linux", "mikrotik", "fortigate", "cisco", "pfsense"]);

function safeUsername(value: string | null | undefined) {
  const username = String(value ?? "").trim().replace(/^["'`]+|["'`,;:]+$/g, "");
  return username && username.length <= 80 && /^[\p{L}\p{N}_.@\\-]+$/u.test(username) && !/^(?:unknown|none|null|system|invalid)$/i.test(username)
    ? username : null;
}

function rawText(event: Pick<AccountEvent, "rawSnippet" | "rawMessage">) {
  return event.rawSnippet ?? event.rawMessage ?? "";
}

export function accountNameFromEvent(event: Pick<AccountEvent, "username" | "rawSnippet" | "rawMessage">) {
  const explicit = safeUsername(event.username);
  if (explicit) return explicit;
  const raw = rawText(event);
  const patterns = [
    /\b(?:Accepted (?:password|publickey)|Failed password) for (?:invalid user )?([^\s]+) from\b/i,
    /\bsudo(?:\[\d+\])?:\s*([^\s:]+)\s*:/i,
    /\[user:\s*([^\]\s]+)\]/i,
    /\buser\s+([^\s,;:]+)\s+(?:logged in|logged out)\b/i,
    /\b(?:successful|failed) login for user\s+([^\s,;:]+)/i,
    /\bconfigured from .*? by\s+([^\s,;:]+)/i,
    /\b(?:changed|added|removed|deleted|disabled|enabled)\b.{0,100}\bby\s+([^\s,;:]+)/i,
    /\b(?:user|username|account)=["']?([^\s"',;]+)/i
  ];
  for (const pattern of patterns) {
    const name = safeUsername(raw.match(pattern)?.[1]);
    if (name) return name;
  }
  return null;
}

export type AccountActivityKind = "login" | "failed_login" | "logout" | "privileged" | "change" | "activity";
export type AccountActivityRisk = "normal" | "review" | "high";

export function classifyAccountEvent(event: Pick<AccountEvent, "action" | "eventType" | "rawSnippet" | "rawMessage" | "tags">): { kind: AccountActivityKind; risk: AccountActivityRisk } | null {
  const tags = event.tags && typeof event.tags === "object" && !Array.isArray(event.tags) ? event.tags as Record<string, unknown> : {};
  if (tags.collectorOwned === true) return null;
  const raw = rawText(event);
  const action = (event.action ?? "").toLowerCase();
  const eventType = event.eventType.toLowerCase();
  if (/auth_failed|auth_failure|login_failed|login_failure|sudo_failed|vpn_auth_failed/.test(`${action} ${eventType}`) || /(?:login|authentication|password).*?(?:failed|failure|denied|invalid)/i.test(raw)) {
    return { kind: "failed_login", risk: "review" };
  }
  if (action === "auth_success" || /login_success|auth_success/.test(eventType) || /\b(?:accepted (?:password|publickey)|login[_ ]success(?:ful)?|success(?:ful)? login|logged in from|logged in via)\b/i.test(raw) || /\buser\s+\S+\s+logged in\b/i.test(raw) || (/\baction="?login"?/i.test(raw) && /\bstatus="?(?:success|succeeded|ok)"?/i.test(raw))) {
    return { kind: "login", risk: "normal" };
  }
  if (/\b(?:logged out|logout|logoff|session closed)\b/i.test(raw) || action === "logout") return { kind: "logout", risk: "normal" };
  if (/\bCOMMAND\s*=/.test(raw) && /\bsudo\b/i.test(raw)) {
    const high = /\b(?:userdel|visudo|passwd|reboot|poweroff|shutdown|iptables|nft|ufw|rm\s+-[a-z]*r|systemctl\s+(?:stop|disable)|chmod\s+777)\b/i.test(raw);
    return { kind: "privileged", risk: high ? "high" : "review" };
  }
  if (action === "configuration_change" || /\b(?:configured from|configuration (?:changed|deleted)|policy (?:changed|deleted)|firewall (?:changed|disabled)|user\s+\S+\s+(?:added|removed|created|changed|deleted|disabled))\b/i.test(raw)) {
    return { kind: "change", risk: "review" };
  }
  // A username on a traffic log is evidence of an attributed event, not a
  // proven administrative action or a currently active session.
  return { kind: "activity", risk: "normal" };
}

function candidateWhere(vendor: string, since: Date, deviceId?: string, ownerId?: string): Prisma.SecurityEventWhereInput {
  return {
    vendor: { equals: vendor, mode: "insensitive" },
    ...(deviceId ? { deviceId } : {}),
    ...(ownerId ? { device: { company: { ownerId, deletedAt: null }, deletedAt: null } } : {}),
    AND: [
      { OR: [{ timestamp: { gte: since } }, { timestamp: null, receivedAt: { gte: since } }] },
      { OR: [
        { username: { not: null } },
        { action: { in: ["auth_success", "auth_failed", "configuration_change", "sudo_failed", "sudo_command", "session_lifecycle", "login", "logout"] } },
        ...["login", "logged in", "accepted password", "accepted publickey", "configured from", "sudo:", "changed", "deleted", "added", "removed"].flatMap((word) => [
          { rawSnippet: { contains: word, mode: "insensitive" as const } },
          { rawMessage: { contains: word, mode: "insensitive" as const } }
        ])
      ] }
    ]
  };
}

export async function listVendorUserActivity(input: { vendor?: string; deviceId?: string; days?: number; username?: string; ownerId?: string }) {
  const devices = await prisma.device.findMany({
    where: { deletedAt: null, ...(input.ownerId ? { company: { ownerId: input.ownerId, deletedAt: null } } : {}) },
    select: { id: true, name: true, vendor: true },
    orderBy: { name: "asc" }
  });
  const observedVendors = await prisma.securityEvent.findMany({
    where: { vendor: { not: null }, ...(input.ownerId ? { device: { company: { ownerId: input.ownerId, deletedAt: null }, deletedAt: null } } : {}) },
    distinct: ["vendor"],
    select: { vendor: true }
  });
  const vendors = [...new Set([...devices.map((device) => device.vendor), ...observedVendors.map((event) => event.vendor ?? "")].map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  const vendor = input.vendor?.trim().toLowerCase() ?? "";
  const days = [7, 30, 90].includes(input.days ?? 30) ? input.days ?? 30 : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const vendorDevices = devices.filter((device) => device.vendor.toLowerCase() === vendor);
  if (!vendor) return { vendors, vendor: null, deviceId: null, selectedUsername: input.username ?? null, devices: [], days, since, sampled: false, accounts: [], timeline: [], timelineTotal: 0, findings: [], coverage: "select_vendor" };
  if (!vendors.includes(vendor)) throw new Error("INVALID_VENDOR");
  if (input.deviceId && !vendorDevices.some((device) => device.id === input.deviceId)) throw new Error("INVALID_DEVICE");

  const [rows, findings] = await Promise.all([
    prisma.securityEvent.findMany({
      where: candidateWhere(vendor, since, input.deviceId, input.ownerId),
      orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
      take: EVENT_SAMPLE_LIMIT + 1,
      select: { id: true, deviceId: true, vendor: true, username: true, action: true, eventType: true, severity: true, timestamp: true, receivedAt: true, srcIp: true, sourceType: true, rawSnippet: true, rawMessage: true, tags: true }
    }),
    prisma.finding.findMany({
      where: { vendor: { equals: vendor, mode: "insensitive" }, actor: { not: null }, lastSeen: { gte: since }, ...(input.deviceId ? { deviceId: input.deviceId } : {}), ...(input.ownerId ? { device: { company: { ownerId: input.ownerId, deletedAt: null }, deletedAt: null } } : {}) },
      orderBy: { lastSeen: "desc" },
      take: FINDING_SAMPLE_LIMIT + 1,
      select: { id: true, actor: true, deviceId: true, title: true, severity: true, status: true, lastSeen: true }
    })
  ]);
  const sampled = rows.length > EVENT_SAMPLE_LIMIT || findings.length > FINDING_SAMPLE_LIMIT;
  const deviceNames = new Map(vendorDevices.map((device) => [device.id, device.name]));
  const timeline = rows.slice(0, EVENT_SAMPLE_LIMIT).flatMap((event) => {
    const username = accountNameFromEvent(event);
    const classification = classifyAccountEvent(event);
    if (!username || !classification) return [];
    return [{
      id: event.id,
      username,
      kind: classification.kind,
      risk: classification.risk,
      deviceId: event.deviceId,
      deviceName: event.deviceId ? deviceNames.get(event.deviceId) ?? null : null,
      sourceIp: event.srcIp,
      observedAt: event.timestamp ?? event.receivedAt,
      sourceType: event.sourceType,
      evidence: redactText(rawText(event)).slice(0, 300)
    }];
  });
  const accountMap = new Map<string, { username: string; loginCount: number; activityCount: number; reviewCount: number; hasAttributedAction: boolean; deviceIds: Set<string>; lastSeen: Date; sourceIps: Set<string> }>();
  for (const event of timeline) {
    const key = event.username.toLowerCase();
    const account = accountMap.get(key) ?? { username: event.username, loginCount: 0, activityCount: 0, reviewCount: 0, hasAttributedAction: false, deviceIds: new Set<string>(), lastSeen: event.observedAt, sourceIps: new Set<string>() };
    if (event.kind === "login") account.loginCount += 1;
    else account.activityCount += 1;
    if (event.risk !== "normal") account.reviewCount += 1;
    if (event.kind === "privileged" || event.kind === "change") account.hasAttributedAction = true;
    if (event.deviceId) account.deviceIds.add(event.deviceId);
    if (event.sourceIp) account.sourceIps.add(event.sourceIp);
    if (event.observedAt > account.lastSeen) account.lastSeen = event.observedAt;
    accountMap.set(key, account);
  }
  const relevantFindings = findings.slice(0, FINDING_SAMPLE_LIMIT).flatMap((finding) => {
    const username = safeUsername(finding.actor);
    if (!username) return [];
    const account = accountMap.get(username.toLowerCase());
    if (!account || (!account.loginCount && !account.hasAttributedAction)) return [];
    if (finding.deviceId && !account.deviceIds.has(finding.deviceId)) return [];
    return [{ id: finding.id, username, deviceId: finding.deviceId, title: finding.title, severity: finding.severity, status: finding.status, lastSeen: finding.lastSeen }];
  });
  const accounts = [...accountMap.values()].filter((account) => account.loginCount > 0 || account.hasAttributedAction).map((account) => ({
    username: account.username,
    loginCount: account.loginCount,
    activityCount: account.activityCount,
    reviewCount: account.reviewCount,
    findingCount: relevantFindings.filter((finding) => finding.username.toLowerCase() === account.username.toLowerCase()).length,
    devices: [...account.deviceIds].map((id) => ({ id, name: deviceNames.get(id) ?? id })),
    sourceIps: [...account.sourceIps].slice(0, 5),
    lastSeen: account.lastSeen
  })).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  const selectedTimeline = input.username ? timeline.filter((event) => {
    const account = accountMap.get(event.username.toLowerCase());
    return event.username.toLowerCase() === input.username?.toLowerCase() && (account?.loginCount || account?.hasAttributedAction);
  }) : [];
  return {
    vendors,
    vendor,
    deviceId: input.deviceId ?? null,
    selectedUsername: input.username ?? null,
    devices: vendorDevices,
    days,
    since,
    sampled,
    accounts,
    timeline: selectedTimeline.slice(0, 250),
    timelineTotal: selectedTimeline.length,
    findings: relevantFindings,
    coverage: SUPPORTED_COLLECTORS.has(vendor) ? "collector_or_import" : "import_only"
  };
}
