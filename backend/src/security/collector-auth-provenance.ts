function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The provenance bit is assigned only after the log source IP and source
 * port both match the SSH session observed by the target. */
export function isCollectorOwnedAuthSuccess(event: { action: string | null; tags: unknown }) {
  if (event.action !== "auth_success") return false;
  const tags = object(event.tags);
  return tags.collector === true && tags.collectorOwned === true;
}

export function matchesCollectorSession(event: { action: string; srcIp?: string; srcPort?: number }, session: { collectorSourceIp?: string; collectorSourcePort?: number; applicationSshSessions?: Array<{ ip: string; port: number }> }) {
  if (event.action !== "auth_success" || !event.srcIp || !event.srcPort) return false;
  return (event.srcIp === session.collectorSourceIp && event.srcPort === session.collectorSourcePort) ||
    (session.applicationSshSessions ?? []).some((owned) => owned.ip === event.srcIp && owned.port === event.srcPort);
}
