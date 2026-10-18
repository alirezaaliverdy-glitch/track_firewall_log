-- Additive collaboration migration; leaves existing text messages unchanged.
ALTER TABLE "CommunityMessage" ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "replyToId" TEXT REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "changeSequence" SERIAL NOT NULL;
CREATE UNIQUE INDEX "CommunityMessage_changeSequence_key" ON "CommunityMessage"("changeSequence");
CREATE INDEX "CommunityMessage_threadId_changeSequence_idx" ON "CommunityMessage"("threadId", "changeSequence");
CREATE TABLE "CommunityAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES "CommunityMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL, "uploaderId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 5242880),
  "checksum" TEXT NOT NULL, "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CommunityAttachment_workspaceId_idx" ON "CommunityAttachment"("workspaceId");
CREATE INDEX "CommunityAttachment_uploaderId_createdAt_idx" ON "CommunityAttachment"("uploaderId", "createdAt");
CREATE INDEX "CommunityAttachment_messageId_idx" ON "CommunityAttachment"("messageId");
CREATE TABLE "CommunityTask" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "assigneeId" TEXT REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "sourceMessageId" TEXT REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "clientKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'todo' CHECK ("status" IN ('todo','in_progress','done')),
  "priority" TEXT NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('normal','urgent')),
  "dueAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CommunityTask_creatorId_clientKey_key" ON "CommunityTask"("creatorId", "clientKey");
CREATE INDEX "CommunityTask_workspaceId_updatedAt_idx" ON "CommunityTask"("workspaceId", "updatedAt");
CREATE INDEX "CommunityTask_workspaceId_assigneeId_status_idx" ON "CommunityTask"("workspaceId", "assigneeId", "status");
