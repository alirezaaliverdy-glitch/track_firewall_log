import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
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

const LOGIN_SAMPLE_LIMIT = 5_000;
const SENSITIVE_SAMPLE_LIMIT = 2_000;
const FAILURE_SAMPLE_LIMIT = 1_000;
const CONTEXT_SAMPLE_LIMIT = 500;
const FINDING_SAMPLE_LIMIT = 500;
const LOGIN_ACTIONS = ["auth_success", "login"];
const SENSITIVE_ACTIONS = ["configuration_change", "sudo_command"];
const FAILURE_ACTIONS = ["auth_failed", "sudo_failed", "session_lifecycle", "logout"];
const ACCOUNT_ACTIONS = [...LOGIN_ACTIONS, ...SENSITIVE_ACTIONS, ...FAILURE_ACTIONS];
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

export function attributedAccountName(event: Pick<AccountEvent, "username" | "action" | "eventType" | "rawSnippet" | "rawMessage" | "tags">) {
  const classification = classifyAccountEvent(event);
  if (!classification) return null;
  if (classification.kind === "privileged" || classification.kind === "change") {
    const raw = rawText(event);
    const actor = raw.match(/\bsudo(?:\[\d+\])?:\s*([^\s:]+)\s*:/i)?.[1]
      ?? raw.match(/\b(?:configured from|changed|added|removed|deleted|disabled|enabled)\b.{0,120}\bby\s+([^\s,;:]+)/i)?.[1];
    // A structured username can identify the target account, not the operator.
    return safeUsername(actor);
  }
  return accountNameFromEvent(event);
}

function baseWhere(vendor: string, since: Date, deviceId?: string, ownerId?: string): Prisma.SecurityEventWhereInput {
  return {
    vendor: { equals: vendor, mode: "insensitive" },
    ...(deviceId ? { deviceId } : {}),
    ...(ownerId ? { device: { company: { ownerId, deletedAt: null }, deletedAt: null } } : {}),
    OR: [{ timestamp: { gte: since } }, { timestamp: null, receivedAt: { gte: since } }]
  };
}

export async function listVendorUserActivity(input: { vendor?: string; deviceId?: string; days?: number; username?: string; ownerId?: string }) {
  const devices = await prisma.device.findMany({
    where: { deletedAt: null, ...(input.ownerId ? { company: { ownerId: input.ownerId, deletedAt: null } } : {}) },
    select: { id: true, name: true, vendor: true },
    orderBy: { name: "asc" }
  });
  const observedVendors = await prisma.securityEvent.groupBy({
    by: ["vendor"],
    where: { vendor: { not: null }, ...(input.ownerId ? { device: { company: { ownerId: input.ownerId, deletedAt: null }, deletedAt: null } } : {}) },
  });
  const vendors = [...new Set([...devices.map((device) => device.vendor), ...observedVendors.map((event) => event.vendor ?? "")].map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  const vendor = input.vendor?.trim().toLowerCase() ?? "";
  const days = [7, 30, 90].includes(input.days ?? 30) ? input.days ?? 30 : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const vendorDevices = devices.filter((device) => device.vendor.toLowerCase() === vendor);
  if (!vendor) {
    const recentLogin = await prisma.securityEvent.findFirst({
      where: { action: "auth_success", vendor: { in: vendors, mode: "insensitive" }, receivedAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, ...(input.ownerId ? { device: { company: { ownerId: input.ownerId, deletedAt: null }, deletedAt: null } } : {}) },
      orderBy: { receivedAt: "desc" },
      select: { vendor: true }
    });
    return { vendors, recommendedVendor: recentLogin?.vendor?.toLowerCase() ?? vendors[0] ?? null, vendor: null, deviceId: null, selectedUsername: input.username ?? null, devices: [], days, since, sampled: false, accounts: [], timeline: [], timelineTotal: 0, findings: [], coverage: "select_vendor", refreshedAt: new Date() };
  }
  if (!vendors.includes(vendor)) throw new Error("INVALID_VENDOR");
  if (input.deviceId && !vendorDevices.some((device) => device.id === input.deviceId)) throw new Error("INVALID_DEVICE");

  const eventSelect = { id: true, deviceId: true, vendor: true, username: true, action: true, eventType: true, severity: true, timestamp: true, receivedAt: true, srcIp: true, sourceType: true, rawSnippet: true, rawMessage: true, tags: true } as const;
  const eventOrder = [{ timestamp: "desc" as const }, { receivedAt: "desc" as const }];
  const [loginRows, sensitiveRows, failureRows, contextRows, selectedRows, findings, collectorStates] = await Promise.all([
    prisma.securityEvent.findMany({
      where: { ...baseWhere(vendor, since, input.deviceId, input.ownerId), action: { in: LOGIN_ACTIONS } },
      orderBy: eventOrder,
      take: LOGIN_SAMPLE_LIMIT + 1,
      select: eventSelect
    }),
    prisma.securityEvent.findMany({
      where: { ...baseWhere(vendor, since, input.deviceId, input.ownerId), action: { in: SENSITIVE_ACTIONS } },
      orderBy: eventOrder,
      take: SENSITIVE_SAMPLE_LIMIT + 1,
      select: eventSelect
    }),
    prisma.securityEvent.findMany({
      where: { ...baseWhere(vendor, since, input.deviceId, input.ownerId), action: { in: FAILURE_ACTIONS } },
      orderBy: eventOrder,
      take: FAILURE_SAMPLE_LIMIT + 1,
      select: eventSelect
    }),
    prisma.securityEvent.findMany({
      where: { ...baseWhere(vendor, since, input.deviceId, input.ownerId), action: { notIn: ACCOUNT_ACTIONS } },
      orderBy: eventOrder,
      take: CONTEXT_SAMPLE_LIMIT + 1,
      select: eventSelect
    }),
    input.username ? prisma.securityEvent.findMany({
      where: { ...baseWhere(vendor, since, input.deviceId, input.ownerId), AND: [{ OR: [
        { username: { equals: input.username, mode: "insensitive" } },
        { rawSnippet: { contains: input.username, mode: "insensitive" } },
        { rawMessage: { contains: input.username, mode: "insensitive" } }
      ] }] },
      orderBy: eventOrder,
      take: 501,
      select: eventSelect
    }) : Promise.resolve([]),
    prisma.finding.findMany({
      where: { vendor: { equals: vendor, mode: "insensitive" }, actor: { not: null }, lastSeen: { gte: since }, ...(input.deviceId ? { deviceId: input.deviceId } : {}), ...(input.ownerId ? { device: { company: { ownerId: input.ownerId, deletedAt: null }, deletedAt: null } } : {}) },
      orderBy: { lastSeen: "desc" },
      take: FINDING_SAMPLE_LIMIT + 1,
      select: { id: true, actor: true, deviceId: true, title: true, severity: true, status: true, lastSeen: true }
    }),
    prisma.eventCollectorState.findMany({
      where: { deviceId: { in: vendorDevices.filter((device) => !input.deviceId || device.id === input.deviceId).map((device) => device.id) } },
      select: { enabled: true, lastSuccessAt: true, lastErrorAt: true, deviceId: true, device: { select: { status: true } } }
    })
  ]);
  const sampled = loginRows.length > LOGIN_SAMPLE_LIMIT || sensitiveRows.length > SENSITIVE_SAMPLE_LIMIT || failureRows.length > FAILURE_SAMPLE_LIMIT || contextRows.length > CONTEXT_SAMPLE_LIMIT || selectedRows.length > 500 || findings.length > FINDING_SAMPLE_LIMIT;
  const rows = [...new Map([
    ...loginRows.slice(0, LOGIN_SAMPLE_LIMIT), ...sensitiveRows.slice(0, SENSITIVE_SAMPLE_LIMIT),
    ...failureRows.slice(0, FAILURE_SAMPLE_LIMIT), ...contextRows.slice(0, CONTEXT_SAMPLE_LIMIT), ...selectedRows.slice(0, 500)
  ].map((event) => [event.id, event])).values()]
    .sort((left, right) => (right.timestamp ?? right.receivedAt).getTime() - (left.timestamp ?? left.receivedAt).getTime());
  const deviceNames = new Map(vendorDevices.map((device) => [device.id, device.name]));
  const timeline = rows.flatMap((event) => {
    const username = attributedAccountName(event);
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
  const accountMap = new Map<string, { username: string; loginCount: number; activityCount: number; reviewCount: number; hasAttributedAction: boolean; deviceIds: Set<string>; reviewDeviceIds: Set<string>; lastSeen: Date; sourceIps: Set<string> }>();
  for (const event of timeline) {
    const key = event.username.toLowerCase();
    const account = accountMap.get(key) ?? { username: event.username, loginCount: 0, activityCount: 0, reviewCount: 0, hasAttributedAction: false, deviceIds: new Set<string>(), reviewDeviceIds: new Set<string>(), lastSeen: event.observedAt, sourceIps: new Set<string>() };
    if (event.kind === "login") account.loginCount += 1;
    else account.activityCount += 1;
    if (event.risk !== "normal") account.reviewCount += 1;
    if (event.kind === "privileged" || event.kind === "change") account.hasAttributedAction = true;
    if ((event.kind === "privileged" || event.kind === "change") && event.risk !== "normal" && event.deviceId) account.reviewDeviceIds.add(event.deviceId);
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
    reviewDeviceIds: [...account.reviewDeviceIds],
    sourceIps: [...account.sourceIps].slice(0, 5),
    lastSeen: account.lastSeen
  })).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  const selectedTimeline = input.username ? timeline.filter((event) => {
    const account = accountMap.get(event.username.toLowerCase());
    return event.username.toLowerCase() === input.username?.toLowerCase() && (account?.loginCount || account?.hasAttributedAction);
  }) : [];
  return {
    vendors,
    recommendedVendor: null,
    vendor,
    deviceId: input.deviceId ?? null,
    selectedUsername: input.username ?? null,
    devices: vendorDevices,
    days,
    since,
    refreshedAt: new Date(),
    sampled,
    monitoring: {
      enabledCollectors: env.securityMonitoringEnabled ? collectorStates.filter((state) => state.enabled && state.device.status !== "offline").length : 0,
      latestCollectionAt: collectorStates.reduce<Date | null>((latest, state) => state.lastSuccessAt && (!latest || state.lastSuccessAt > latest) ? state.lastSuccessAt : latest, null),
      latestErrorAt: collectorStates.reduce<Date | null>((latest, state) => state.lastErrorAt && (!latest || state.lastErrorAt > latest) ? state.lastErrorAt : latest, null)
    },
    accounts,
    timeline: selectedTimeline.slice(0, 250),
    timelineTotal: selectedTimeline.length,
    findings: relevantFindings,
    coverage: SUPPORTED_COLLECTORS.has(vendor) ? "collector_or_import" : "import_only"
  };
}

type ActivityInput = Parameters<typeof listVendorUserActivity>[0];
type ActivityResult = Awaited<ReturnType<typeof listVendorUserActivity>>;
const activityCache = new Map<string, { vendor: string; expiresAt: number; value?: ActivityResult; promise?: Promise<ActivityResult> }>();
const ACTIVITY_CACHE_MS = 15_000;

export function invalidateVendorUserActivityCache(vendor: string) {
  for (const [key, entry] of activityCache) if (entry.vendor === vendor.toLowerCase()) activityCache.delete(key);
}

export function listCachedVendorUserActivity(input: ActivityInput): Promise<ActivityResult> {
  const vendor = input.vendor?.trim().toLowerCase() ?? "";
  const key = JSON.stringify([input.ownerId ?? null, vendor, input.deviceId ?? null, input.days ?? null, input.username?.toLowerCase() ?? null]);
  const existing = activityCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    if (existing.value) return Promise.resolve(existing.value);
    if (existing.promise) return existing.promise;
  }
  const entry: { vendor: string; expiresAt: number; value?: ActivityResult; promise?: Promise<ActivityResult> } = { vendor, expiresAt: Date.now() + ACTIVITY_CACHE_MS };
  const promise = listVendorUserActivity(input).then((value) => {
    if (activityCache.get(key) === entry) { entry.value = value; entry.promise = undefined; entry.expiresAt = Date.now() + ACTIVITY_CACHE_MS; }
    return value;
  }).catch((error) => { if (activityCache.get(key) === entry) activityCache.delete(key); throw error; });
  entry.promise = promise;
  activityCache.set(key, entry);
  if (activityCache.size > 100) activityCache.delete(activityCache.keys().next().value!);
  return promise;
}
