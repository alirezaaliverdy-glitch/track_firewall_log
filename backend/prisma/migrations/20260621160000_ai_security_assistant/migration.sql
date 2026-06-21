CREATE TYPE "AiChatRole" AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE "AiActionIntentStatus" AS ENUM ('proposed', 'discarded', 'converted_to_action_plan');
CREATE TYPE "AiRiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "AiIntentType" AS ENUM ('block_source_ip_temporary', 'unblock_source_ip', 'open_port', 'close_port', 'change_ssh_port', 'add_firewall_rule', 'remove_firewall_rule', 'enable_rule', 'disable_rule', 'explain_security_status', 'unknown');

CREATE TABLE "AiChatSession" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" "AiChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "structuredJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiActionIntent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "messageId" TEXT,
  "deviceId" TEXT,
  "intentType" "AiIntentType" NOT NULL,
  "status" "AiActionIntentStatus" NOT NULL DEFAULT 'proposed',
  "riskLevel" "AiRiskLevel" NOT NULL,
  "parametersJson" JSONB NOT NULL,
  "explanation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiActionIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatSession_userId_idx" ON "AiChatSession"("userId");
CREATE INDEX "AiChatSession_createdAt_idx" ON "AiChatSession"("createdAt");
CREATE INDEX "AiChatMessage_sessionId_idx" ON "AiChatMessage"("sessionId");
CREATE INDEX "AiChatMessage_role_idx" ON "AiChatMessage"("role");
CREATE INDEX "AiChatMessage_createdAt_idx" ON "AiChatMessage"("createdAt");
CREATE INDEX "AiActionIntent_sessionId_idx" ON "AiActionIntent"("sessionId");
CREATE INDEX "AiActionIntent_messageId_idx" ON "AiActionIntent"("messageId");
CREATE INDEX "AiActionIntent_deviceId_idx" ON "AiActionIntent"("deviceId");
CREATE INDEX "AiActionIntent_intentType_idx" ON "AiActionIntent"("intentType");
CREATE INDEX "AiActionIntent_status_idx" ON "AiActionIntent"("status");
CREATE INDEX "AiActionIntent_riskLevel_idx" ON "AiActionIntent"("riskLevel");
CREATE INDEX "AiActionIntent_createdAt_idx" ON "AiActionIntent"("createdAt");

ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiActionIntent" ADD CONSTRAINT "AiActionIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiActionIntent" ADD CONSTRAINT "AiActionIntent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiActionIntent" ADD CONSTRAINT "AiActionIntent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
