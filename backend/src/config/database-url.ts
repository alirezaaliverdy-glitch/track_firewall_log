const ACTIVE_LOCAL_HOST = "127.0.0.1";

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function resolveDatabaseUrl(rawDatabaseUrl: string | undefined) {
  if (!rawDatabaseUrl) return rawDatabaseUrl;
  try {
    const parsed = new URL(rawDatabaseUrl);
    if (isLocalHost(parsed.hostname) && process.env.NODE_ENV !== "production") {
      parsed.hostname = ACTIVE_LOCAL_HOST;
      return parsed.toString();
    }
    return rawDatabaseUrl;
  } catch {
    return rawDatabaseUrl;
  }
}

export function databaseConnectionInfo(rawDatabaseUrl: string | undefined) {
  const resolved = resolveDatabaseUrl(rawDatabaseUrl);
  if (!resolved) return { present: false as const };
  const parsed = new URL(resolved);
  return {
    present: true as const,
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "")
  };
}
