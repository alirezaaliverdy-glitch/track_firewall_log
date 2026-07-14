import { auditDeviceAssetReconciliation, repairDeviceAssetReconciliation } from "../assets/asset-intelligence.service.js";
import { shutdownDatabase } from "../db/prisma.js";
import { prisma } from "../db/prisma.js";

const OBSERVABILITY_TABLES = ["DeviceCapabilityCache", "CollectionRun", "MetricSample", "MetricAggregate", "HealthSnapshot", "MonitorIncident"];

async function observabilitySchemaAudit() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('DeviceCapabilityCache', 'CollectionRun', 'MetricSample', 'MetricAggregate', 'HealthSnapshot', 'MonitorIncident')
    ORDER BY table_name
  `;
  const present = rows.map((row) => row.table_name);
  return { required: OBSERVABILITY_TABLES, present, missing: OBSERVABILITY_TABLES.filter((table) => !present.includes(table)) };
}

async function migrationHistoryAudit() {
  return prisma.$queryRaw<Array<{ migration_name: string; finished: boolean; rolled_back: boolean; error_log: string | null }>>`
    SELECT migration_name,
           finished_at IS NOT NULL AS finished,
           rolled_back_at IS NOT NULL AS rolled_back,
           CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN LEFT(logs, 1200) ELSE NULL END AS error_log
    FROM "_prisma_migrations"
    ORDER BY started_at
  `;
}

async function protectedRecordCounts() {
  const [devices, assets, credentials, findings, actionPlans] = await Promise.all([
    prisma.device.count(),
    prisma.asset.count(),
    prisma.deviceCredential.count(),
    prisma.finding.count(),
    prisma.actionPlan.count()
  ]);
  return { devices, assets, credentials, findings, actionPlans };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reconciliation = apply
    ? await repairDeviceAssetReconciliation(true)
    : { mode: "dry-run" as const, audit: await auditDeviceAssetReconciliation(), changed: 0 };
  const observabilitySchema = await observabilitySchemaAudit();
  const migrationHistory = await migrationHistoryAudit();
  const recordCounts = await protectedRecordCounts();
  process.stdout.write(`${JSON.stringify({ ...reconciliation, observabilitySchema, migrationHistory, recordCounts }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(shutdownDatabase);
