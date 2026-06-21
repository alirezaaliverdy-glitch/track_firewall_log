const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type SecurityEvent = {
  id: string;
  deviceId: string | null;
  sourceId: string | null;
  batchId: string | null;
  timestamp: string | null;
  receivedAt: string;
  vendor: string | null;
  eventType: string;
  action: string | null;
  severity: string | null;
  srcIp: string | null;
  srcPort: number | null;
  dstIp: string | null;
  dstPort: number | null;
  protocol: string | null;
  username: string | null;
  ruleName: string | null;
  interfaceIn: string | null;
  interfaceOut: string | null;
  rawMessage: string | null;
  normalizedJson: Record<string, unknown>;
  tags: Record<string, unknown> | null;
  createdAt: string;
  device?: { id: string; name: string; type: string; host?: string };
  source?: { id: string; name: string; type: string };
  batch?: { id: string; status: string; createdAt?: string; completedAt?: string | null };
};

export type EventBatch = {
  id: string;
  sourceId: string | null;
  deviceId: string | null;
  status: string;
  totalEvents: number;
  parsedEvents: number;
  failedEvents: number;
  createdAt: string;
  completedAt: string | null;
  device?: { id: string; name: string; type: string } | null;
  source?: { id: string; name: string; type: string } | null;
};

export type EventsSummary = {
  totalEvents: number;
  countBySeverity: Array<{ severity: string; count: number }>;
  countByAction: Array<{ action: string; count: number }>;
  topSourceIps: Array<{ value: string; count: number }>;
  topDestinationPorts: Array<{ value: string; count: number }>;
  topSources: Array<{ id: string; name: string; type: string; count: number }>;
  topDevices: Array<{ id: string; name: string; type: string; count: number }>;
};

export type EventFilters = {
  vendor?: string;
  action?: string;
  severity?: string;
  srcIp?: string;
  dstIp?: string;
  port?: string;
  protocol?: string;
};

const EMPTY_SUMMARY: EventsSummary = {
  totalEvents: 0,
  countBySeverity: [],
  countByAction: [],
  topSourceIps: [],
  topDestinationPorts: [],
  topSources: [],
  topDevices: [],
};

const safeNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
};

const normalizeCountList = (value: unknown, labelKey: "value" | "severity" | "action") =>
  normalizeArray<Record<string, unknown>>(value).map((item) => ({
    [labelKey]: String(item[labelKey] ?? item.value ?? item.name ?? "unknown"),
    count: safeNumber(item.count),
  }));

const normalizeSummary = (value: unknown): EventsSummary => {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const bySeverity = source.countBySeverity ?? source.bySeverity;
  const byAction = source.countByAction ?? source.byAction;

  return {
    totalEvents: safeNumber(source.totalEvents ?? source.total),
    countBySeverity: Array.isArray(bySeverity)
      ? normalizeCountList(bySeverity, "severity") as EventsSummary["countBySeverity"]
      : Object.entries((bySeverity && typeof bySeverity === "object" ? bySeverity : {}) as Record<string, unknown>).map(
          ([severity, count]) => ({ severity, count: safeNumber(count) })
        ),
    countByAction: Array.isArray(byAction)
      ? normalizeCountList(byAction, "action") as EventsSummary["countByAction"]
      : Object.entries((byAction && typeof byAction === "object" ? byAction : {}) as Record<string, unknown>).map(
          ([action, count]) => ({ action, count: safeNumber(count) })
        ),
    topSourceIps: normalizeCountList(source.topSourceIps, "value") as EventsSummary["topSourceIps"],
    topDestinationPorts: normalizeCountList(source.topDestinationPorts, "value") as EventsSummary["topDestinationPorts"],
    topSources: normalizeArray<Record<string, unknown>>(source.topSources).map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? item.value ?? "Unknown source"),
      type: String(item.type ?? "upload"),
      count: safeNumber(item.count),
    })),
    topDevices: normalizeArray<Record<string, unknown>>(source.topDevices).map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? item.value ?? "Unknown device"),
      type: String(item.type ?? "generic_firewall"),
      count: safeNumber(item.count),
    })),
  };
};

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Security events request failed.";
    throw new Error(message);
  }

  return payload as T;
}

function queryString(filters: EventFilters & { limit?: number }) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listSecurityEvents(filters: EventFilters = {}) {
  const payload = await requestJson<unknown>(`/events${queryString({ ...filters, limit: 100 })}`);
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : payload;
  return normalizeArray<SecurityEvent>(
    Array.isArray(source) ? source : (source as Record<string, unknown>).events
  );
}

export function getSecurityEvent(id: string) {
  return requestJson<SecurityEvent>(`/events/${id}`);
}

export async function getSecurityEventsSummary(filters: EventFilters = {}) {
  const payload = await requestJson<unknown>(`/events/summary${queryString(filters)}`);
  return normalizeSummary(payload ?? EMPTY_SUMMARY);
}

export async function listEventBatches() {
  const payload = await requestJson<unknown>("/event-batches?limit=10");
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : payload;
  return normalizeArray<EventBatch>(
    Array.isArray(source) ? source : (source as Record<string, unknown>).batches
  );
}
