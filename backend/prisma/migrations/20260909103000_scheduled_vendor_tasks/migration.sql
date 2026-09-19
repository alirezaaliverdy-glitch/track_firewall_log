CREATE TYPE "ScheduledTaskCalendar" AS ENUM ('gregorian', 'jalali');
CREATE TYPE "ScheduledTaskStatus" AS ENUM ('scheduled', 'paused', 'running', 'completed', 'cancelled');
CREATE TYPE "ScheduledTaskTrigger" AS ENUM ('schedule', 'manual');
CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('running', 'succeeded', 'failed', 'skipped');

CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "catalogCommandId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "riskLevel" "AiRiskLevel" NOT NULL,
    "parametersJson" JSONB NOT NULL,
    "calendarType" "ScheduledTaskCalendar" NOT NULL DEFAULT 'gregorian',
    "localDate" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledTaskStatus" NOT NULL DEFAULT 'scheduled',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "confirmationJson" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledTaskRun" (
    "id" TEXT NOT NULL,
    "scheduledTaskId" TEXT NOT NULL,
    "actionPlanId" TEXT,
    "executionKey" TEXT NOT NULL,
    "trigger" "ScheduledTaskTrigger" NOT NULL DEFAULT 'schedule',
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'running',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledTask_deviceId_idx" ON "ScheduledTask"("deviceId");
CREATE INDEX "ScheduledTask_createdById_idx" ON "ScheduledTask"("createdById");
CREATE INDEX "ScheduledTask_status_enabled_runAt_idx" ON "ScheduledTask"("status", "enabled", "runAt");
CREATE INDEX "ScheduledTask_createdAt_idx" ON "ScheduledTask"("createdAt");
CREATE UNIQUE INDEX "ScheduledTaskRun_executionKey_key" ON "ScheduledTaskRun"("executionKey");
CREATE INDEX "ScheduledTaskRun_scheduledTaskId_createdAt_idx" ON "ScheduledTaskRun"("scheduledTaskId", "createdAt");
CREATE INDEX "ScheduledTaskRun_actionPlanId_idx" ON "ScheduledTaskRun"("actionPlanId");
CREATE INDEX "ScheduledTaskRun_status_startedAt_idx" ON "ScheduledTaskRun"("status", "startedAt");

ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_scheduledTaskId_fkey" FOREIGN KEY ("scheduledTaskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
