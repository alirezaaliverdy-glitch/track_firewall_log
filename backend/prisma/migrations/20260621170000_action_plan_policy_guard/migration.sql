CREATE TYPE "ActionPlanSource" AS ENUM ('ai', 'user', 'system', 'detection');
CREATE TYPE "ActionPlanStatus" AS ENUM ('proposed', 'validation_failed', 'dry_run_ready', 'awaiting_approval', 'approved', 'rejected', 'executing', 'succeeded', 'failed', 'rolled_back');
CREATE TYPE "ActionType" AS ENUM ('block_source_ip_temporary', 'unblock_source_ip', 'open_port', 'close_port', 'change_ssh_port', 'add_firewall_rule', 'remove_firewall_rule', 'enable_rule', 'disable_rule');
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected');

CREATE TABLE "ActionPlan" (
  "id" TEXT NOT NULL,
  "source" "ActionPlanSource" NOT NULL,
  "requestedBy" TEXT,
  "deviceId" TEXT,
  "aiIntentId" TEXT,
  "actionType" "ActionType" NOT NULL,
  "status" "ActionPlanStatus" NOT NULL DEFAULT 'proposed',
  "riskLevel" "AiRiskLevel" NOT NULL,
  "parametersJson" JSONB NOT NULL,
  "validationJson" JSONB,
  "dryRunJson" JSONB,
  "approvalJson" JSONB,
  "resultJson" JSONB,
  "rollbackJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionAuditLog" (
  "id" TEXT NOT NULL,
  "actionPlanId" TEXT NOT NULL,
  "deviceId" TEXT,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionApproval" (
  "id" TEXT NOT NULL,
  "actionPlanId" TEXT NOT NULL,
  "approvedBy" TEXT,
  "decision" "ApprovalDecision" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActionPlan_source_idx" ON "ActionPlan"("source");
CREATE INDEX "ActionPlan_deviceId_idx" ON "ActionPlan"("deviceId");
CREATE INDEX "ActionPlan_aiIntentId_idx" ON "ActionPlan"("aiIntentId");
CREATE INDEX "ActionPlan_actionType_idx" ON "ActionPlan"("actionType");
CREATE INDEX "ActionPlan_status_idx" ON "ActionPlan"("status");
CREATE INDEX "ActionPlan_riskLevel_idx" ON "ActionPlan"("riskLevel");
CREATE INDEX "ActionPlan_createdAt_idx" ON "ActionPlan"("createdAt");

CREATE INDEX "ActionAuditLog_actionPlanId_idx" ON "ActionAuditLog"("actionPlanId");
CREATE INDEX "ActionAuditLog_deviceId_idx" ON "ActionAuditLog"("deviceId");
CREATE INDEX "ActionAuditLog_eventType_idx" ON "ActionAuditLog"("eventType");
CREATE INDEX "ActionAuditLog_createdAt_idx" ON "ActionAuditLog"("createdAt");

CREATE INDEX "ActionApproval_actionPlanId_idx" ON "ActionApproval"("actionPlanId");
CREATE INDEX "ActionApproval_decision_idx" ON "ActionApproval"("decision");
CREATE INDEX "ActionApproval_createdAt_idx" ON "ActionApproval"("createdAt");

ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_aiIntentId_fkey" FOREIGN KEY ("aiIntentId") REFERENCES "AiActionIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionAuditLog" ADD CONSTRAINT "ActionAuditLog_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionAuditLog" ADD CONSTRAINT "ActionAuditLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionApproval" ADD CONSTRAINT "ActionApproval_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
