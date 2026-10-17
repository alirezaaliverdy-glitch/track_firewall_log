-- Additive tables; no changes to existing data, ownership or grants.
CREATE TABLE "CommunityThread" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('discussion','ticket')),
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_progress','resolved')),
  "priority" TEXT NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('normal','urgent')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CommunityThread_creatorId_clientKey_key" ON "CommunityThread"("creatorId","clientKey");
CREATE INDEX "CommunityThread_workspaceId_kind_updatedAt_idx" ON "CommunityThread"("workspaceId","kind","updatedAt");
CREATE INDEX "CommunityThread_workspaceId_creatorId_kind_idx" ON "CommunityThread"("workspaceId","creatorId","kind");
CREATE TABLE "CommunityMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" SERIAL NOT NULL,
  "threadId" TEXT NOT NULL REFERENCES "CommunityThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientKey" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CommunityMessage_sequence_key" ON "CommunityMessage"("sequence");
CREATE UNIQUE INDEX "CommunityMessage_threadId_authorId_clientKey_key" ON "CommunityMessage"("threadId","authorId","clientKey");
CREATE INDEX "CommunityMessage_threadId_sequence_idx" ON "CommunityMessage"("threadId","sequence");
CREATE TABLE "CommunityRead" (
  "threadId" TEXT NOT NULL REFERENCES "CommunityThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("threadId","userId")
);
