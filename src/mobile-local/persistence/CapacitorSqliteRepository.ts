import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { ApprovalReceipt, AuditEvent, ActionPlan, DeviceDetails, ExecutionEvent, ExecutionResult } from "../../../packages/contracts/src/index";
import { LOCAL_MOBILE_DB_NAME, LOCAL_MOBILE_DB_VERSION, LOCAL_MOBILE_MIGRATIONS } from "@/mobile-local/persistence/migrations";
import { InMemoryLocalMobileRepository, type LocalMobileRepository } from "@/mobile-local/persistence/LocalMobileRepository";

type Row = Record<string, unknown>;

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class CapacitorSqliteRepository implements LocalMobileRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connection: SQLiteDBConnection | null = null;

  async initialize() {
    await this.sqlite.addUpgradeStatement(LOCAL_MOBILE_DB_NAME, LOCAL_MOBILE_MIGRATIONS.map((migration) => ({ toVersion: migration.version, statements: migration.statements as unknown as string[] })));
    this.connection = await this.sqlite.createConnection(LOCAL_MOBILE_DB_NAME, false, "no-encryption", LOCAL_MOBILE_DB_VERSION, false);
    await this.connection.open();
    await this.withTransaction(async (db) => {
      for (const migration of LOCAL_MOBILE_MIGRATIONS) {
        for (const statement of migration.statements) await db.execute(statement);
        await db.run("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)", [migration.version, new Date().toISOString()]);
      }
    });
  }

  async resetLocalData() {
    const db = this.requireConnection();
    await this.withTransaction(async () => {
      for (const table of ["settings", "audit_events", "verification_evidence", "execution_state", "approvals", "action_plans", "known_hosts", "credential_metadata", "devices"]) {
        await db.execute(`DELETE FROM ${table}`);
      }
    });
  }

  async listDevices() {
    const result = await this.requireConnection().query("SELECT * FROM devices ORDER BY created_at DESC");
    return (result.values ?? []).map((row) => this.deviceFromRow(row as Row));
  }

  async saveDevice(device: DeviceDetails) {
    await this.requireConnection().run(
      `INSERT OR REPLACE INTO devices(id, name, vendor, host, port, credential_ref, trusted_host_key_ref, verified, platform, capabilities_json, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [device.id, device.name, device.vendor, device.host, device.port, device.credentialRef ?? null, device.trustedHostKeyRef ?? null, device.verified ? 1 : 0, device.platform ?? null, JSON.stringify(device.capabilities), device.createdAt, device.updatedAt]
    );
  }

  async getDevice(deviceId: string) {
    const result = await this.requireConnection().query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    const row = result.values?.[0] as Row | undefined;
    return row ? this.deviceFromRow(row) : null;
  }

  async savePlan(plan: ActionPlan) {
    await this.requireConnection().run(
      `INSERT OR REPLACE INTO action_plans(id, device_id, action_type, status, risk_level, parameters_json, command_specs_json, verification, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [plan.id, plan.deviceId, plan.actionType, plan.status, plan.riskLevel, JSON.stringify(plan.parameters), JSON.stringify(plan.commandSpecs), plan.verification, plan.createdAt, plan.updatedAt]
    );
  }

  async getPlan(planId: string) {
    const result = await this.requireConnection().query("SELECT * FROM action_plans WHERE id = ?", [planId]);
    const row = result.values?.[0] as Row | undefined;
    return row ? this.planFromRow(row) : null;
  }

  async saveApproval(receipt: ApprovalReceipt) {
    await this.requireConnection().run(
      "INSERT OR REPLACE INTO approvals(plan_id, approved_at, approval_hash, binding_json) VALUES(?, ?, ?, ?)",
      [receipt.planId, receipt.approvedAt, receipt.approvalHash, JSON.stringify(receipt.binding)]
    );
  }

  async getApproval(planId: string) {
    const result = await this.requireConnection().query("SELECT * FROM approvals WHERE plan_id = ?", [planId]);
    const row = result.values?.[0] as Row | undefined;
    return row ? { planId: String(row.plan_id), approvedAt: String(row.approved_at), approvalHash: String(row.approval_hash), binding: json<Record<string, unknown>>(row.binding_json, {}) } : null;
  }

  async saveExecutionResult(result: ExecutionResult) {
    await this.requireConnection().run(
      `INSERT OR REPLACE INTO execution_state(execution_id, plan_id, status, connector_invoked, verification, stdout, stderr, exit_code, idempotency_key, started_at, completed_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT started_at FROM execution_state WHERE execution_id = ?), ?), ?)`,
      [result.executionId, result.planId, result.status, result.connectorInvoked ? 1 : 0, result.verification, result.stdout, result.stderr, result.exitCode, result.executionId, result.executionId, result.completedAt, result.completedAt]
    );
  }

  async getExecutionResult(executionId: string) {
    const result = await this.requireConnection().query("SELECT * FROM execution_state WHERE execution_id = ?", [executionId]);
    const row = result.values?.[0] as Row | undefined;
    return row ? this.executionFromRow(row) : null;
  }

  async appendExecutionEvent(event: ExecutionEvent) {
    await this.requireConnection().run(
      "INSERT INTO verification_evidence(id, execution_id, evidence_json, created_at) VALUES(?, ?, ?, ?)",
      [`event-${event.executionId}-${event.createdAt}`, event.executionId, JSON.stringify(event), event.createdAt]
    );
  }

  async listExecutionEvents(executionId: string) {
    const result = await this.requireConnection().query("SELECT evidence_json FROM verification_evidence WHERE execution_id = ? ORDER BY created_at ASC", [executionId]);
    return (result.values ?? []).map((row) => json<ExecutionEvent>((row as Row).evidence_json, { executionId, type: "verification", message: "unreadable event", createdAt: new Date().toISOString() }));
  }

  async appendAuditEvent(event: AuditEvent) {
    await this.requireConnection().run(
      "INSERT INTO audit_events(id, event_hash, previous_hash, event_type, payload_json, created_at) VALUES(?, ?, ?, ?, ?, ?)",
      [event.id, event.eventHash, event.previousHash, event.eventType, JSON.stringify(event.payload), event.createdAt]
    );
  }

  async listAuditEvents() {
    const result = await this.requireConnection().query("SELECT * FROM audit_events ORDER BY created_at ASC");
    return (result.values ?? []).map((row) => this.auditFromRow(row as Row));
  }

  private requireConnection() {
    if (!this.connection) throw new Error("LOCAL_SQLITE_NOT_INITIALIZED");
    return this.connection;
  }

  private async withTransaction(work: (db: SQLiteDBConnection) => Promise<void>) {
    const db = this.requireConnection();
    await db.beginTransaction();
    try {
      await work(db);
      await db.commitTransaction();
    } catch (error) {
      await db.rollbackTransaction();
      throw error;
    }
  }

  private deviceFromRow(row: Row): DeviceDetails {
    return {
      id: String(row.id),
      name: String(row.name),
      vendor: String(row.vendor) as DeviceDetails["vendor"],
      host: String(row.host),
      port: Number(row.port),
      credentialRef: typeof row.credential_ref === "string" ? row.credential_ref : null,
      trustedHostKeyRef: typeof row.trusted_host_key_ref === "string" ? row.trusted_host_key_ref : null,
      verified: Number(row.verified) === 1,
      platform: typeof row.platform === "string" ? row.platform : null,
      capabilities: json<string[]>(row.capabilities_json, []),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private planFromRow(row: Row): ActionPlan {
    return {
      id: String(row.id),
      deviceId: String(row.device_id),
      actionType: String(row.action_type),
      status: String(row.status) as ActionPlan["status"],
      riskLevel: String(row.risk_level) as ActionPlan["riskLevel"],
      parameters: json<Record<string, unknown>>(row.parameters_json, {}),
      commandSpecs: json<ActionPlan["commandSpecs"]>(row.command_specs_json, []),
      verification: String(row.verification) as ActionPlan["verification"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private executionFromRow(row: Row): ExecutionResult {
    return {
      executionId: String(row.execution_id),
      planId: String(row.plan_id),
      status: String(row.status) as ExecutionResult["status"],
      connectorInvoked: Number(row.connector_invoked) === 1,
      verification: String(row.verification) as ExecutionResult["verification"],
      stdout: String(row.stdout ?? ""),
      stderr: String(row.stderr ?? ""),
      exitCode: typeof row.exit_code === "number" ? row.exit_code : null,
      completedAt: String(row.completed_at ?? "")
    };
  }

  private auditFromRow(row: Row): AuditEvent {
    return {
      id: String(row.id),
      eventHash: String(row.event_hash),
      previousHash: typeof row.previous_hash === "string" ? row.previous_hash : null,
      eventType: String(row.event_type),
      payload: json<Record<string, unknown>>(row.payload_json, {}),
      createdAt: String(row.created_at)
    };
  }
}

export function createLocalMobileRepository(): LocalMobileRepository {
  if (typeof window === "undefined") return new InMemoryLocalMobileRepository();
  return new CapacitorSqliteRepository();
}
