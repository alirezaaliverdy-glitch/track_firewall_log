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
  const payload = await requestJson<{ events: SecurityEvent[] }>(`/events${queryString({ ...filters, limit: 100 })}`);
  return payload.events;
}

export function getSecurityEvent(id: string) {
  return requestJson<SecurityEvent>(`/events/${id}`);
}

export function getSecurityEventsSummary(filters: EventFilters = {}) {
  return requestJson<EventsSummary>(`/events/summary${queryString(filters)}`);
}

export async function listEventBatches() {
  const payload = await requestJson<{ batches: EventBatch[] }>("/event-batches?limit=10");
  return payload.batches;
}
