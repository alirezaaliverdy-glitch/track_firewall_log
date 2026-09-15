ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'create_egress_policy';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'update_policy_schedule';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'create_address_object';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'create_schedule_object';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'create_service_object';

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'create_egress_policy';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'update_policy_schedule';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'create_address_object';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'create_schedule_object';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'create_service_object';
