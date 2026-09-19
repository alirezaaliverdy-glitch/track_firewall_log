const CISCO_DETAIL_LIMIT = 128;
const HIDDEN_CISCO_DETAIL_KEYS = /^(raw|evidence|command|commandEvidence|outputs?|password|secret|privateKey|passphrase|community)$/i;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function interfaceKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
    .replace(/^gigabitethernet/, "gi")
    .replace(/^fastethernet/, "fa")
    .replace(/^tengigabitethernet/, "te")
    .replace(/^port-channel/, "po")
    .replace(/[^a-z0-9]/g, "");
}

export function mergeCiscoWorkspaceInterfaces(summaryValue: unknown, switchportValue: unknown) {
  const merged = new Map<string, Record<string, unknown>>();
  for (const item of [...array(switchportValue), ...array(summaryValue)]) {
    const row = object(item);
    const name = row.name ?? row.interface ?? row.port;
    const key = interfaceKey(name);
    if (!key) continue;
    merged.set(key, { ...merged.get(key), ...row, name });
  }
  return [...merged.values()];
}

export function safeCiscoDetail(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, CISCO_DETAIL_LIMIT).map((item) => safeCiscoDetail(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !HIDDEN_CISCO_DETAIL_KEYS.test(key))
    .map(([key, item]) => [key, safeCiscoDetail(item, depth + 1)]));
}

function domain(value: unknown) {
  const source = object(value);
  const entries = array(source.entries);
  return {
    state: String(source.state ?? (entries.length ? "collected" : "not_collected")),
    count: entries.length,
    entries: safeCiscoDetail(entries)
  };
}

export function projectCiscoWorkspaceDetails(collectionValue: unknown) {
  const collection = object(collectionValue);
  if (!Object.keys(collection).length) return null;
  const system = object(collection.system);
  const interfaceData = object(collection.interfaces);
  const network = object(collection.network);
  const configuration = object(collection.configuration);
  const security = object(collection.securityServices);
  const health = object(collection.health);
  const mergedInterfaces = mergeCiscoWorkspaceInterfaces(interfaceData.summary, interfaceData.switchports);
  return {
    collectedAt: collection.collectedAt ?? null,
    inventoryStatus: collection.inventoryStatus ?? "unknown",
    capabilityStatus: collection.capabilityStatus ?? "unknown",
    platform: collection.platform ?? null,
    platformFamily: collection.platformFamily ?? null,
    system: safeCiscoDetail(system),
    inventory: safeCiscoDetail(array(system.inventory)),
    interfaces: {
      state: interfaceData.state ?? "unknown",
      summary: safeCiscoDetail(mergedInterfaces),
      switchports: safeCiscoDetail(array(interfaceData.switchports)),
      errorCount: array(interfaceData.errors).length
    },
    health: safeCiscoDetail(health),
    network: Object.fromEntries(Object.entries(network).map(([key, item]) => [key,
      Array.isArray(item)
        ? { state: item.length ? "collected" : "not_collected", count: item.length, entries: safeCiscoDetail(item) }
        : domain(item)
    ])),
    configuration: Object.fromEntries(Object.entries(configuration).map(([key, item]) => [key,
      item && typeof item === "object" && !Array.isArray(item) ? domain(item) : safeCiscoDetail(item)
    ])),
    security: Object.fromEntries(Object.entries(security).map(([key, item]) => [key, domain(item)])),
    warnings: safeCiscoDetail(array(collection.warnings))
  };
}
