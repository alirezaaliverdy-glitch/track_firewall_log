import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { redactForPersistence, redactText } from "../security/redaction.js";
import { getVendorTelemetryProfile, normalizeTelemetryVendor, VENDOR_TELEMETRY_PROFILES } from "../telemetry/vendor-telemetry-profiles.js";
import { boundedTelemetryStore } from "../telemetry/bounded-telemetry-store.js";

const MAX_EVENT_REFERENCES = 100;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function collectReferenceIds(value: unknown, result = new Set<string>()): Set<string> {
  if (result.size >= MAX_EVENT_REFERENCES) return result;
  if (typeof value === "string") {
    const candidate = value.trim();
    if (candidate && candidate.length <= 128) result.add(candidate);
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferenceIds(record(item)?.id ?? item, result);
  } else {
    const item = record(value);
    if (item?.id) collectReferenceIds(item.id, result);
  }
  return result;
}

function storedEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    const data = record(item);
    if (!data) return typeof item === "string"
      ? { id: `evidence-${index + 1}`, message: redactText(item), value: redactForPersistence(item) }
      : { id: `evidence-${index + 1}`, value: redactForPersistence(item) };
    return {
      id: String(data.id ?? `evidence-${index + 1}`),
      message: typeof data.message === "string" ? redactText(data.message) : undefined,
      srcIp: typeof data.srcIp === "string" ? data.srcIp : undefined,
      dstPort: typeof data.dstPort === "number" ? data.dstPort : undefined,
      value: redactForPersistence(data)
    };
  });
}

function telemetryReferenceForEvent(event: { deviceId: string | null; timestamp: Date | null; sourceType: string | null; rawMessage: string | null; normalizedJson: unknown }) {
  if (!event.deviceId || !event.rawMessage) return null;
  const normalized = record(event.normalizedJson);
  const timestamp = typeof normalized?.timestamp === "string" ? normalized.timestamp : event.timestamp?.toISOString();
  const source = typeof normalized?.source === "string" ? normalized.source : event.sourceType?.replace(/^linux_live_/, "");
  const raw = typeof normalized?.raw === "string" ? normalized.raw : event.rawMessage;
  if (!timestamp || !source) return null;
  return crypto.createHash("sha256").update(`${event.deviceId}|${timestamp}|${source}|${raw}`).digest("hex").slice(0, 24);
}

function uniqueRawEvents<T extends { rawMessage?: string | null }>(events: T[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const raw = String(event.rawMessage ?? "").trim();
    const key = raw ? crypto.createHash("sha256").update(raw).digest("hex") : `id:${String((event as { id?: unknown }).id ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function listPublicVendorTelemetryProfiles() {
  return Object.values(VENDOR_TELEMETRY_PROFILES).map((profile) => ({
    vendorId: profile.vendorId,
    vendorName: profile.vendorName,
    liveSources: profile.liveSources,
    snapshotSources: profile.snapshotSources,
    implemented: profile.implemented,
    rules: profile.findingRules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      kind: rule.eventPattern ? "event" : "snapshot",
      mitreTags: rule.mitreTags ?? []
    }))
  }));
}

export async function getFindingEvidence(findingId: string) {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: {
      device: { select: { id: true, name: true, vendor: true, host: true, type: true } },
      asset: { select: { id: true, name: true, managementIp: true } }
    }
  });
  if (!finding) return null;

  const referenceIds = [...collectReferenceIds(finding.rawRefsJson)];
  const events = referenceIds.length ? await prisma.securityEvent.findMany({
    where: {
      id: { in: referenceIds },
      deviceId: finding.deviceId
    },
    orderBy: [{ timestamp: "desc" }, { receivedAt: "desc" }],
    take: MAX_EVENT_REFERENCES
  }) : [];
  const resolvedReferenceIds = new Set(events.map((event) => event.id));
  const unresolvedIds = new Set(referenceIds.filter((id) => !resolvedReferenceIds.has(id)));
  const deviceEventCandidates = unresolvedIds.size ? await prisma.securityEvent.findMany({
    where: { deviceId: finding.deviceId },
    orderBy: { receivedAt: "desc" },
    take: 2_000
  }) : [];
  const reconstructedEvents = deviceEventCandidates.filter((event) => {
    const reference = telemetryReferenceForEvent(event);
    if (!reference || !unresolvedIds.has(reference)) return false;
    unresolvedIds.delete(reference);
    resolvedReferenceIds.add(reference);
    return true;
  });
  const telemetryEvents = unresolvedIds.size ? (await boundedTelemetryStore.readEvents(finding.deviceId, 2_000).catch(() => []))
    .filter((event) => unresolvedIds.has(event.id))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_EVENT_REFERENCES) : [];
  telemetryEvents.forEach((event) => { unresolvedIds.delete(event.id); resolvedReferenceIds.add(event.id); });
  const profile = getVendorTelemetryProfile(finding.vendor, finding.device.type);
  const evidence = storedEvidence(finding.evidenceJson);
  const isSnapshot = finding.source.toLowerCase().includes("snapshot");
  const availability = events.length || reconstructedEvents.length || telemetryEvents.length ? "raw_events" : evidence.some((item) => item.message) ? "stored_evidence" : isSnapshot ? "snapshot" : "unavailable";

  return {
    findingId: finding.id,
    vendor: normalizeTelemetryVendor(finding.vendor) ?? finding.vendor,
    source: finding.source,
    category: finding.category,
    availability,
    redacted: true,
    integrity: {
      exactReferencesOnly: true,
      referenceCount: referenceIds.length,
      resolvedReferenceCount: resolvedReferenceIds.size,
      unresolvedReferenceCount: unresolvedIds.size
    },
    device: finding.device,
    asset: finding.asset,
    profile: profile ? {
      vendorId: profile.vendorId,
      vendorName: profile.vendorName,
      liveSources: profile.liveSources,
      snapshotSources: profile.snapshotSources
    } : null,
    events: uniqueRawEvents([...[...events, ...reconstructedEvents].map((event) => ({
      id: event.id,
      storage: "security_event" as const,
      timestamp: event.timestamp ?? event.receivedAt,
      receivedAt: event.receivedAt,
      vendor: event.vendor,
      sourceType: event.sourceType,
      eventType: event.eventType,
      severity: event.severity,
      action: event.action,
      rawMessage: redactText(event.rawMessage ?? event.rawSnippet ?? ""),
      srcIp: event.srcIp,
      srcPort: event.srcPort,
      dstIp: event.dstIp,
      dstPort: event.dstPort,
      protocol: event.protocol,
      username: event.username,
      ruleName: event.ruleName,
      interfaceIn: event.interfaceIn,
      interfaceOut: event.interfaceOut,
      normalized: redactForPersistence(event.normalizedJson)
    })), ...telemetryEvents.map((event) => {
      const parsed = event.parsedFields ?? {};
      return {
        id: event.id,
        storage: "telemetry_store" as const,
        timestamp: event.timestamp,
        receivedAt: event.timestamp,
        vendor: event.vendor,
        sourceType: event.source,
        eventType: event.category,
        severity: event.severity,
        action: null,
        rawMessage: redactText(event.rawMessage),
        srcIp: typeof parsed.sourceIp === "string" ? parsed.sourceIp : null,
        srcPort: typeof parsed.sourcePort === "number" ? parsed.sourcePort : null,
        dstIp: typeof parsed.destinationIp === "string" ? parsed.destinationIp : null,
        dstPort: typeof parsed.port === "number" ? parsed.port : null,
        protocol: typeof parsed.protocol === "string" ? parsed.protocol : null,
        username: typeof parsed.username === "string" ? parsed.username : null,
        ruleName: null,
        interfaceIn: typeof parsed.interfaceIn === "string" ? parsed.interfaceIn : null,
        interfaceOut: typeof parsed.interfaceOut === "string" ? parsed.interfaceOut : null,
        normalized: redactForPersistence({ normalizedMessage: event.normalizedMessage, parsedFields: parsed })
      };
    })]).sort((left, right) => Date.parse(String(right.timestamp)) - Date.parse(String(left.timestamp))).slice(0, MAX_EVENT_REFERENCES),
    storedEvidence: evidence,
    snapshotEvidence: isSnapshot ? redactForPersistence(finding.evidenceJson) : null
  };
}
