import { prisma } from "../db/prisma.js";
import {
  answerOnboardingSession,
  commitOnboardingSession,
  createOnboardingSession,
  detectOnboardingPlatform,
  discoverOnboardingInventory,
  getOnboardingSession,
  previewOnboardingSession,
  retryOnboardingSession,
  testOnboardingConnection
} from "./device-onboarding.service.js";

const inFlight = new Set<string>();
const BUSY = new Set(["connection_testing", "platform_detecting", "discovery_running", "saving"]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeError(value: unknown) {
  if (!value) return null;
  return String(value)
    .replace(/(?:password|passphrase|private.?key|token|api.?key|secret)\s*[:=]\s*\S+/gi, "[redacted]")
    .replace(/ssh:\/\/[^@\s]+@/gi, "ssh://[redacted]@")
    .slice(0, 500);
}

async function deviceOrThrow(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { credential: { select: { id: true, name: true, type: true } } }
  });
  if (!device) throw new Error("Device not found.");
  return device;
}

async function latestRows(deviceId: string) {
  return prisma.deviceOnboardingSession.findMany({
    where: { deviceId },
    orderBy: { updatedAt: "desc" },
    take: 20
  });
}

function publicAttempt(row: Awaited<ReturnType<typeof latestRows>>[number]) {
  const test = object(row.testJson);
  const detection = object(row.detectionJson);
  const result = object(row.resultJson);
  const error = object(result).error ?? test.error;
  return {
    sessionId: row.id,
    status: row.status,
    step: row.step,
    connectorInvoked: test.connectorInvoked === true || result.connectorInvoked === true,
    connected: test.connected === true,
    connectorType: test.connectorType ?? result.connectorType ?? null,
    platform: detection.platform ?? result.platform ?? null,
    error: sanitizeError(error),
    attemptedAt: row.updatedAt,
    expiresAt: row.expiresAt
  };
}

export async function getDeviceVerification(deviceId: string) {
  const device = await deviceOrThrow(deviceId);
  const rows = await latestRows(deviceId);
  const attempts = rows.map(publicAttempt);
  const latest = attempts[0] ?? null;
  const capabilities = object(device.capabilities);
  const onboarding = object(capabilities.onboarding);
  const verifiedAttempt = attempts.find((attempt) => attempt.status === "completed" && attempt.connectorInvoked && attempt.connected);
  const verified = Boolean(verifiedAttempt || onboarding.verifiedAt);
  const active = latest && new Date(latest.expiresAt).getTime() > Date.now() && !["completed", "cancelled"].includes(latest.status);
  return {
    deviceId: device.id,
    verificationStatus: verified ? "verified" : latest?.status === "connection_failed" ? "failed" : "unverified",
    vendor: device.vendor,
    platform: onboarding.platform ?? object(capabilities.ciscoDetection).platform ?? device.type,
    host: device.host,
    port: device.managementPort,
    method: device.protocol,
    credential: device.credential ? { id: device.credential.id, name: device.credential.name, type: device.credential.type } : null,
    lastAttemptAt: latest?.attemptedAt ?? null,
    lastSuccessAt: verifiedAttempt?.attemptedAt ?? onboarding.verifiedAt ?? null,
    connectorInvoked: latest?.connectorInvoked ?? false,
    connectorType: latest?.connectorType ?? onboarding.connectorType ?? null,
    connected: latest?.connected ?? false,
    error: latest?.error ?? null,
    activeSessionId: active ? latest.sessionId : null,
    busy: Boolean(latest && BUSY.has(latest.status)),
    history: attempts
  };
}

async function sessionForDevice(deviceId: string, input: Record<string, unknown> = {}) {
  const device = await deviceOrThrow(deviceId);
  const requestedSessionId = typeof input.sessionId === "string" ? input.sessionId : "";
  if (requestedSessionId) {
    const session = await getOnboardingSession(requestedSessionId);
    if (session.deviceId !== deviceId) throw new Error("Verification session does not belong to this device.");
    return session;
  }
  const rows = await latestRows(deviceId);
  const latest = rows[0];
  if (latest && BUSY.has(latest.status) && Date.now() - latest.updatedAt.getTime() < 5 * 60_000) {
    throw new Error("A verification attempt is already in progress for this device.");
  }
  return createOnboardingSession({ deviceId: device.id, platform: object(device.capabilities).onboarding ? object(object(device.capabilities).onboarding).platform : undefined });
}

async function exclusive<T>(deviceId: string, operation: () => Promise<T>) {
  if (inFlight.has(deviceId)) throw new Error("A verification attempt is already in progress for this device.");
  inFlight.add(deviceId);
  try { return await operation(); }
  finally { inFlight.delete(deviceId); }
}

export async function testDeviceVerification(deviceId: string, input: Record<string, unknown> = {}) {
  return exclusive(deviceId, async () => {
    const session = await sessionForDevice(deviceId, input);
    const credentialId = typeof input.credentialId === "string" ? input.credentialId.trim() : "";
    if (credentialId && credentialId !== session.draft.credentialId) {
      await answerOnboardingSession(session.id, { ...session.draft, credentialId });
    } else if (session.status === "draft") {
      await answerOnboardingSession(session.id, session.draft);
    } else if (["connection_failed", "credential_invalid", "credential_missing", "validation_failed"].includes(session.status)) {
      await retryOnboardingSession(session.id);
    }
    await testOnboardingConnection(session.id);
    return getDeviceVerification(deviceId);
  });
}

export async function retryDeviceVerification(deviceId: string, input: Record<string, unknown> = {}) {
  return testDeviceVerification(deviceId, input);
}

export async function commitDeviceVerification(deviceId: string, input: Record<string, unknown> = {}) {
  return exclusive(deviceId, async () => {
    const verification = await getDeviceVerification(deviceId);
    const sessionId = typeof input.sessionId === "string" && input.sessionId ? input.sessionId : verification.activeSessionId;
    if (!sessionId) throw new Error("Run a successful connector-backed connection test first.");
    let session = await getOnboardingSession(sessionId);
    if (session.deviceId !== deviceId) throw new Error("Verification session does not belong to this device.");
    if (session.test?.connected !== true || session.test?.connectorInvoked !== true) throw new Error("Run a successful connector-backed connection test first.");
    if (session.status === "connection_verified") session = await detectOnboardingPlatform(sessionId);
    if (session.status === "platform_detected") session = await discoverOnboardingInventory(sessionId);
    if (session.status === "discovery_completed") session = await previewOnboardingSession(sessionId);
    if (session.status !== "preview_ready") throw new Error(`Verification cannot be committed from ${session.status}.`);
    await commitOnboardingSession(sessionId);
    return getDeviceVerification(deviceId);
  });
}

export function resetDeviceVerificationLocksForTest() { inFlight.clear(); }
