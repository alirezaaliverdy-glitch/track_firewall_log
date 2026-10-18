BEGIN;
ALTER TABLE "CommunityAttachment" DROP CONSTRAINT "CommunityAttachment_size_check";
ALTER TABLE "CommunityAttachment" ADD CONSTRAINT "CommunityAttachment_size_check" CHECK ("size" > 0 AND "size" <= 52428800);
ALTER TABLE "CommunityThread" ADD COLUMN "retentionCheckedAt" TIMESTAMP(3),
  ADD COLUMN "prunedThroughSequence" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "CommunityThread_retentionCheckedAt_idx" ON "CommunityThread"("retentionCheckedAt");
CREATE TABLE "CommunityRetentionPolicy" (
  "workspaceId" TEXT NOT NULL PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "discussionDays" INTEGER NOT NULL DEFAULT 30 CHECK ("discussionDays" BETWEEN 7 AND 365),
  "closedTicketDays" INTEGER NOT NULL DEFAULT 90 CHECK ("closedTicketDays" BETWEEN 7 AND 365),
  "maxMessages" INTEGER NOT NULL DEFAULT 5000 CHECK ("maxMessages" BETWEEN 100 AND 20000),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
COMMIT;
