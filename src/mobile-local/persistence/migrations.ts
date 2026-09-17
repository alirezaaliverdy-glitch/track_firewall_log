export const LOCAL_MOBILE_DB_NAME = "firewall_local_mobile";
export const LOCAL_MOBILE_DB_VERSION = 1;

export const LOCAL_MOBILE_MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        credential_ref TEXT,
        trusted_host_key_ref TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        platform TEXT,
        capabilities_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS credential_metadata (
        ref TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        username TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        invalidated_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS known_hosts (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        sha256_fingerprint TEXT NOT NULL,
        trusted_at TEXT NOT NULL,
        replaced_at TEXT,
        UNIQUE(device_id, host, port)
      )`,
      `CREATE TABLE IF NOT EXISTS action_plans (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        command_specs_json TEXT NOT NULL,
        verification TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS approvals (
        plan_id TEXT PRIMARY KEY,
        approved_at TEXT NOT NULL,
        approval_hash TEXT NOT NULL,
        binding_json TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS execution_state (
        execution_id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        connector_invoked INTEGER NOT NULL DEFAULT 0,
        verification TEXT NOT NULL,
        stdout TEXT NOT NULL DEFAULT '',
        stderr TEXT NOT NULL DEFAULT '',
        exit_code INTEGER,
        idempotency_key TEXT NOT NULL UNIQUE,
        started_at TEXT NOT NULL,
        completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS verification_evidence (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        event_hash TEXT NOT NULL,
        previous_hash TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ]
  }
] as const;

export function localMobileSchemaSql() {
  return LOCAL_MOBILE_MIGRATIONS.flatMap((migration) => migration.statements).join(";\n");
}
