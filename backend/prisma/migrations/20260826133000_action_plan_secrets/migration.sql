CREATE TABLE "ActionPlanSecret" (
    "id" TEXT NOT NULL,
    "actionPlanId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPlanSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionPlanSecret_actionPlanId_key_key" ON "ActionPlanSecret"("actionPlanId", "key");
CREATE INDEX "ActionPlanSecret_actionPlanId_idx" ON "ActionPlanSecret"("actionPlanId");

ALTER TABLE "ActionPlanSecret"
ADD CONSTRAINT "ActionPlanSecret_actionPlanId_fkey"
FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
