ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'custom_vendor_action';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'generic_security_action';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'custom_vendor_action';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'generic_security_action';
